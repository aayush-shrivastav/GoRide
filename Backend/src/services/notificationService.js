const Notification = require("../models/Notification");
const logger = require("../utils/logger");

let ioInstance = null;

/** Called once from sockets/index.js after Socket.io is initialized. */
function attachIO(io) {
  ioInstance = io;
}

/**
 * Persists a notification and, if a socket connection exists for the
 * recipient, emits it in real time. Structured so a future push-notification
 * provider (FCM/APNs) can be plugged in alongside the socket emit below.
 */
async function notify({ recipientId, recipientRole, type, title, message, ride = null }) {
  const notification = await Notification.create({ recipientId, recipientRole, type, title, message, ride });

  if (ioInstance) {
    const room = `${recipientRole}:${recipientId}`;
    ioInstance.to(room).emit("notification", {
      id: notification._id,
      type,
      title,
      message,
      rideId: ride,
      createdAt: notification.createdAt,
    });
  } else {
    logger.warn("notificationService: io not attached yet, skipping real-time emit");
  }

  return notification;
}

module.exports = { attachIO, notify };
