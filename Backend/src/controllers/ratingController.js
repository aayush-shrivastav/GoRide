const Ride = require("../models/Ride");
const Rating = require("../models/Rating");
const Driver = require("../models/Driver");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { sendSuccess } = require("../utils/apiResponse");
const { RIDE_STATUS, NOTIFICATION_TYPE } = require("../constants/enums");
const notificationService = require("../services/notificationService");
const logger = require("../utils/logger");

const createRating = catchAsync(async (req, res, next) => {
  const { rideId } = req.body;
  const stars = Number(req.body.stars || req.body.rating);
  const review = req.body.review || req.body.comment || "";

  const ride = await Ride.findOne({ _id: rideId, passenger: req.user._id });
  if (!ride) return next(new AppError("Ride not found", 404));
  if (ride.rideStatus !== RIDE_STATUS.RIDE_COMPLETED) {
    return next(new AppError("You can only rate a completed ride", 400));
  }
  if (ride.isRated) return next(new AppError("This ride has already been rated", 409));

  const rating = await Rating.create({ ride: ride._id, passenger: req.user._id, driver: ride.driver, stars, review });

  ride.isRated = true;
  await ride.save({ validateBeforeSave: false });

  // Recompute the driver's running average rating.
  const driver = await Driver.findById(ride.driver);
  const newCount = driver.ratingCount + 1;
  const newAverage = (driver.rating * driver.ratingCount + stars) / newCount;
  driver.rating = Math.round(newAverage * 100) / 100;
  driver.ratingCount = newCount;
  await driver.save({ validateBeforeSave: false });

  // Notify driver about the new rating via push notification + socket
  try {
    await notificationService.notify({
      recipientId: ride.driver,
      recipientRole: "driver",
      type: NOTIFICATION_TYPE.RATING_RECEIVED,
      title: "New Rating Received ⭐",
      message: `A passenger rated you ${stars} star${stars !== 1 ? "s" : ""}${review ? `: "${review}"` : ""}. Your new average is ${driver.rating}★`,
      ride: ride._id,
    });

    const io = require("../sockets").getIO();
    io.to(`driver:${ride.driver}`).emit("rating_received", {
      rideId: ride._id,
      stars,
      review,
      newAverage: driver.rating,
      newCount: driver.ratingCount,
    });
  } catch (err) {
    logger.warn({ err }, "Could not send rating notification to driver");
  }

  return sendSuccess(res, { statusCode: 201, message: "Rating submitted", data: { rating } });
});

const getDriverRatings = catchAsync(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const [ratings, total] = await Promise.all([
    Rating.find({ driver: req.params.driverId })
      .populate("passenger", "name")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    Rating.countDocuments({ driver: req.params.driverId }),
  ]);

  return sendSuccess(res, { message: "Ratings fetched", data: { ratings, total } });
});

module.exports = { createRating, getDriverRatings };
