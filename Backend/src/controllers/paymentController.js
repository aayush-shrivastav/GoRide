const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const Payment = require("../models/Payment");
const Driver = require("../models/Driver");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { sendSuccess } = require("../utils/apiResponse");
const paymentService = require("../services/paymentService");
const notificationService = require("../services/notificationService");
const { NOTIFICATION_TYPE, PAYMENT_STATUS, RIDE_STATUS } = require("../constants/enums");
const logger = require("../utils/logger");

const createOrder = catchAsync(async (req, res, next) => {
  const ride = await Ride.findOne({ _id: req.body.rideId, passenger: req.user._id });
  if (!ride) return next(new AppError("Ride not found", 404));
  if (ride.rideStatus !== RIDE_STATUS.RIDE_COMPLETED) return next(new AppError("Payment can only be started after ride completion", 400));
  if (ride.paymentMethod !== "online") return next(new AppError("This ride is not set up for online payment", 400));

  // Idempotency: reuse an existing non-failed payment for this ride instead
  // of creating a second gateway order (avoids double-charging on retry/
  // double-click from the client).
  const existing = await Payment.findOne({
    ride: ride._id,
    status: { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.SUCCESS] },
  });
  if (existing) {
    return sendSuccess(res, {
      statusCode: 200,
      message: "Using existing order for this ride",
      data: { orderId: existing.gatewayOrderId, amount: existing.amount * 100, currency: existing.currency, paymentId: existing._id },
    });
  }

  const amount = ride.finalFare ?? ride.estimatedFare;
  const order = await paymentService.createOrder({
    amountInRupees: amount,
    currency: "INR",
    receipt: `ride_${ride._id}`,
  });

  const payment = await Payment.create({
    ride: ride._id,
    passenger: ride.passenger,
    driver: ride.driver,
    amount,
    currency: "INR",
    method: "online",
    status: PAYMENT_STATUS.PENDING,
    gatewayOrderId: order.id,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: "Order created",
    data: { orderId: order.id, amount: order.amount, currency: order.currency, paymentId: payment._id },
  });
});

/**
 * The single, idempotent path by which a payment is ever marked SUCCESS.
 * Both the client-verify endpoint and the webhook call this — neither
 * contains its own success-marking logic.
 *
 * Concurrency safety comes from the findOneAndUpdate itself, NOT from a
 * prior read: the filter's `status: { $ne: SUCCESS }` means MongoDB only
 * lets ONE of any number of simultaneous callers actually transition the
 * document (this is a single atomic operation on the DB side — there is
 * no read-then-write window for two callers to both "see" PENDING). Every
 * other concurrent/duplicate caller gets a null back and is treated as a
 * no-op. The driver-earnings increment and ride sync only ever run for
 * the one caller that won that transition, so earnings can't be double
 * counted no matter how many times verify/webhook fire for the same
 * payment. Wrapped in a transaction so the payment/ride/driver writes
 * commit or roll back together (requires MongoDB running as a replica
 * set / Atlas; on a standalone dev instance without transaction support,
 * the atomic findOneAndUpdate guard alone already prevents double-credit
 * — see README "Production Considerations").
 */
async function processSuccessfulPayment(paymentId, gatewayPaymentId) {
  const session = await mongoose.startSession();
  let outcome;

  try {
    try {
      await session.withTransaction(async () => {
        const updated = await Payment.findOneAndUpdate(
          { _id: paymentId, status: { $ne: PAYMENT_STATUS.SUCCESS } },
          {
            $set: {
              status: PAYMENT_STATUS.SUCCESS,
              ...(gatewayPaymentId ? { gatewayPaymentId, transactionId: gatewayPaymentId } : {}),
            },
          },
          { new: true, session }
        );

        if (!updated) {
          outcome = { payment: await Payment.findById(paymentId).session(session), alreadyProcessed: true };
          return;
        }

        const ride = await Ride.findByIdAndUpdate(
          updated.ride,
          { paymentStatus: PAYMENT_STATUS.SUCCESS },
          { new: true, session }
        );

        if (updated.driver) {
          await Driver.findByIdAndUpdate(updated.driver, { $inc: { totalEarnings: ride.driverEarning || updated.amount } }, { session });
        }

        outcome = { payment: updated, ride, alreadyProcessed: false };
      });
    } catch (txErr) {
      // Fallback for standalone Mongo instances (e.g. MongoMemoryServer in tests) without Replica Set support
      const updated = await Payment.findOneAndUpdate(
        { _id: paymentId, status: { $ne: PAYMENT_STATUS.SUCCESS } },
        {
          $set: {
            status: PAYMENT_STATUS.SUCCESS,
            ...(gatewayPaymentId ? { gatewayPaymentId, transactionId: gatewayPaymentId } : {}),
          },
        },
        { new: true }
      );

      if (!updated) {
        outcome = { payment: await Payment.findById(paymentId), alreadyProcessed: true };
      } else {
        const ride = await Ride.findByIdAndUpdate(
          updated.ride,
          { paymentStatus: PAYMENT_STATUS.SUCCESS },
          { new: true }
        );

        if (updated.driver) {
          await Driver.findByIdAndUpdate(updated.driver, { $inc: { totalEarnings: ride.driverEarning || updated.amount } });
        }

        outcome = { payment: updated, ride, alreadyProcessed: false };
      }
    }
  } finally {
    await session.endSession();
  }


  if (!outcome.payment) throw new AppError("Payment record not found", 404);

  // Side effects (notification, socket emit) only fire for the call that
  // actually won the transition — never for a duplicate/no-op call.
  if (!outcome.alreadyProcessed) {
    await notificationService.notify({
      recipientId: outcome.payment.passenger,
      recipientRole: "passenger",
      type: NOTIFICATION_TYPE.PAYMENT_SUCCESS,
      title: "Payment successful",
      message: `Payment of ${outcome.payment.amount} ${outcome.payment.currency} confirmed`,
      ride: outcome.payment.ride,
    });

    try {
      const io = require("../sockets").getIO();
      io.to(`passenger:${outcome.payment.passenger}`).emit("payment_updated", {
        rideId: outcome.payment.ride,
        status: PAYMENT_STATUS.SUCCESS,
      });
      if (outcome.ride?.driver) {
        io.to(`driver:${outcome.ride.driver}`).emit("payment_updated", {
          rideId: outcome.payment.ride,
          status: PAYMENT_STATUS.SUCCESS,
        });
      }
    } catch (err) {
      logger.warn({ err }, "Could not emit payment_updated — socket layer not ready");
    }
  }

  return outcome;
}

/**
 * Called by the client after Razorpay checkout completes. The signature
 * check below is what actually confirms the payment — the client's claim
 * that "payment succeeded" is never trusted on its own.
 */
const verifyPayment = catchAsync(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const isValid = paymentService.verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  const payment = await Payment.findOne({ gatewayOrderId: razorpay_order_id });
  if (!payment) return next(new AppError("Payment record not found", 404));

  if (!isValid) {
    await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $ne: PAYMENT_STATUS.SUCCESS } },
      { status: PAYMENT_STATUS.FAILED }
    );
    return next(new AppError("Payment signature verification failed", 400));
  }

  const { payment: updated } = await processSuccessfulPayment(payment._id, razorpay_payment_id);
  return sendSuccess(res, { message: "Payment verified", data: { payment: updated } });
});

/**
 * Razorpay webhook — the authoritative, server-to-server confirmation
 * channel. Must be mounted with the raw body parser (see routes file).
 * Never trusts the frontend for status/amount/transactionId; everything
 * here comes from the signed webhook payload only.
 */
const handleWebhook = catchAsync(async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const isValid = paymentService.verifyWebhookSignature({ rawBody: req.rawBody, signature });

  if (!isValid) {
    logger.warn("Rejected webhook with invalid signature");
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }

  const event = req.body;

  if (event.event === "payment.captured") {
    const entity = event.payload.payment.entity;
    const payment = await Payment.findOne({ gatewayOrderId: entity.order_id });

    if (!payment) {
      logger.warn({ orderId: entity.order_id }, "Webhook for unknown payment order — ignoring");
      return res.status(200).json({ received: true });
    }

    // Defense in depth: the captured amount (paise) must match what we
    // expect for this payment before we ever mark it successful.
    const expectedPaise = Math.round(payment.amount * 100);
    if (entity.amount !== expectedPaise) {
      logger.error(
        { paymentId: payment._id, expectedPaise, gotPaise: entity.amount },
        "Webhook amount mismatch — refusing to mark payment successful"
      );
      return res.status(200).json({ received: true }); // ack the webhook, but do NOT process it
    }

    await processSuccessfulPayment(payment._id, entity.id);
  } else if (event.event === "payment.failed") {
    const orderId = event.payload.payment.entity.order_id;
    await Payment.findOneAndUpdate(
      { gatewayOrderId: orderId, status: { $ne: PAYMENT_STATUS.SUCCESS } },
      { status: PAYMENT_STATUS.FAILED }
    );
  }

  return res.status(200).json({ received: true });
});

const getPayment = catchAsync(async (req, res, next) => {
  const payment = await Payment.findById(req.params.paymentId);
  if (!payment) return next(new AppError("Payment not found", 404));

  const isOwner = payment.passenger.equals(req.user._id) || (payment.driver && payment.driver.equals(req.user._id));
  if (!isOwner) return next(new AppError("You are not authorized to view this payment", 403));

  return sendSuccess(res, { message: "Payment fetched", data: { payment } });
});

module.exports = { createOrder, verifyPayment, handleWebhook, getPayment, processSuccessfulPayment };
