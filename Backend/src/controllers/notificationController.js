const Notification = require("../models/Notification");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { sendSuccess } = require("../utils/apiResponse");

const getMyNotifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const filter = { recipientId: req.user._id, recipientRole: req.userRole };

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, isRead: false }),
  ]);

  return sendSuccess(res, { message: "Notifications fetched", data: { notifications, total, unreadCount } });
});

const markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: req.user._id, recipientRole: req.userRole },
    { isRead: true },
    { new: true }
  );
  if (!notification) return next(new AppError("Notification not found", 404));
  return sendSuccess(res, { message: "Notification marked as read", data: { notification } });
});

module.exports = { getMyNotifications, markAsRead };
