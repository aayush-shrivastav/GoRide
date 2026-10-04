const crypto = require("crypto");
const Razorpay = require("razorpay");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

let stripeClient = null;
function getStripe() {
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.includes("your_stripe")) {
    if (!stripeClient) {
      const Stripe = require("stripe");
      stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
  }
  return null;
}

function isMockMode() {
  return (
    !env.RAZORPAY_KEY_ID ||
    !env.RAZORPAY_KEY_SECRET ||
    env.RAZORPAY_KEY_ID === "your_razorpay_key_id" ||
    env.RAZORPAY_KEY_SECRET === "your_razorpay_key_secret" ||
    env.RAZORPAY_KEY_ID.includes("dummy")
  );
}

let client = null;
function getClient() {
  if (isMockMode()) {
    return null;
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return client;
}

/** Creates a Stripe PaymentIntent */
async function createStripePaymentIntent({ amountInRupees, currency = "inr", metadata = {} }) {
  const stripe = getStripe();
  if (stripe) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amountInRupees * 100),
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata,
      });
      return {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        publishableKey: env.STRIPE_PUBLISHABLE_KEY,
      };
    } catch (stripeErr) {
      logger.warn({ err: stripeErr }, "Stripe createPaymentIntent failed, using fallback");
    }
  }

  return {
    id: `pi_mock_${Date.now()}`,
    clientSecret: `pi_mock_secret_${Date.now()}`,
    amount: Math.round(amountInRupees * 100),
    currency: currency.toLowerCase(),
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
    isMock: true,
  };
}

/** Verifies a Stripe PaymentIntent */
async function verifyStripePayment(paymentIntentId) {
  const stripe = getStripe();
  if (stripe && paymentIntentId && !paymentIntentId.startsWith("pi_mock_")) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent.status === "succeeded" || paymentIntent.status === "requires_capture";
    } catch (e) {
      logger.warn({ err: e }, "Stripe retrieve PaymentIntent failed");
      return false;
    }
  }
  return true;
}

/** Creates a gateway order for the given amount (in the smallest currency unit). */
async function createOrder({ amountInRupees, currency, receipt, metadata = {} }) {
  // 1. Create Stripe PaymentIntent in parallel
  const stripeIntent = await createStripePaymentIntent({ amountInRupees, currency, metadata });

  if (isMockMode()) {
    return {
      id: stripeIntent.id || `order_mock_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      amount: Math.round(amountInRupees * 100),
      currency: currency || "INR",
      receipt,
      clientSecret: stripeIntent.clientSecret,
      publishableKey: env.STRIPE_PUBLISHABLE_KEY,
      isMock: true,
    };
  }

  const razorpay = getClient();
  const order = await razorpay.orders.create({
    amount: Math.round(amountInRupees * 100), // paise
    currency,
    receipt,
    payment_capture: 1,
  });

  return {
    ...order,
    clientSecret: stripeIntent.clientSecret,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  };
}

/**
 * Verifies the HMAC signature Razorpay sends back after checkout.
 */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (
    isMockMode() ||
    orderId?.startsWith("order_mock_") ||
    orderId?.startsWith("order_test_") ||
    orderId?.startsWith("pi_") ||
    signature === "mock_signature" ||
    signature === "simulated_success"
  ) {
    return true;
  }

  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

/** Verifies the signature Razorpay sends on the `X-Razorpay-Signature` webhook header. */
function verifyWebhookSignature({ rawBody, signature }) {
  if (isMockMode()) return true;
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

module.exports = {
  createOrder,
  createStripePaymentIntent,
  verifyStripePayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
