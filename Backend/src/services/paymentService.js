const crypto = require("crypto");
const Razorpay = require("razorpay");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * Payment provider abstraction. Everything Razorpay-specific lives here so
 * a different gateway can be swapped in by reimplementing this module's
 * exported functions with the same signatures.
 */

let client = null;
function getClient() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError(
      "Payment gateway is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file.",
      500
    );
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return client;
}

/** Creates a gateway order for the given amount (in the smallest currency unit). */
async function createOrder({ amountInRupees, currency, receipt }) {
  const razorpay = getClient();
  const order = await razorpay.orders.create({
    amount: Math.round(amountInRupees * 100), // paise
    currency,
    receipt,
    payment_capture: 1,
  });
  return order;
}

/**
 * Verifies the HMAC signature Razorpay sends back after checkout.
 * This is the ONLY trusted way to confirm a payment succeeded — never
 * mark a payment successful because the client says so.
 */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

/** Verifies the signature Razorpay sends on the `X-Razorpay-Signature` webhook header. */
function verifyWebhookSignature({ rawBody, signature }) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    logger.warn("RAZORPAY_WEBHOOK_SECRET not set — rejecting webhook");
    return false;
  }
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

module.exports = { createOrder, verifyPaymentSignature, verifyWebhookSignature };
