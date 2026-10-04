const { z } = require("zod");

const createOrderSchema = z.object({
  rideId: z.string().min(1),
});

const verifyPaymentSchema = z.object({
  rideId: z.string().optional(),
  orderId: z.string().optional(),
  paymentId: z.string().optional(),
  paymentIntentId: z.string().optional(),
  razorpay_order_id: z.string().optional(),
  razorpay_payment_id: z.string().optional(),
  razorpay_signature: z.string().optional(),
  signature: z.string().optional(),
}).refine(
  (data) =>
    data.razorpay_order_id ||
    data.paymentIntentId ||
    data.orderId ||
    data.rideId,
  {
    message: "At least one of razorpay_order_id, paymentIntentId, orderId, or rideId must be provided",
  }
);

module.exports = { createOrderSchema, verifyPaymentSchema };
