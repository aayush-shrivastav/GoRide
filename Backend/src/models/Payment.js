const mongoose = require("mongoose");
const { PAYMENT_METHOD, PAYMENT_STATUS } = require("../constants/enums");

const paymentSchema = new mongoose.Schema(
  {
    ride: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true, index: true },
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },

    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    method: { type: String, enum: Object.values(PAYMENT_METHOD), required: true },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },

    transactionId: { type: String, default: null },
    gateway: { type: String, default: "razorpay" },
    gatewayOrderId: { type: String, default: null, index: true },
    gatewayPaymentId: { type: String, default: null },
    gatewaySignature: { type: String, default: null, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
