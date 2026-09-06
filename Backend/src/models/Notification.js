const mongoose = require("mongoose");
const { NOTIFICATION_TYPE } = require("../constants/enums");

const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    recipientRole: { type: String, enum: ["passenger", "driver"], required: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPE), required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    ride: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
