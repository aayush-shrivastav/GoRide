require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/User");
const Driver = require("../models/Driver");
const Ride = require("../models/Ride");
const Payment = require("../models/Payment");
const Rating = require("../models/Rating");
const Notification = require("../models/Notification");
const Sos = require("../models/Sos");
const logger = require("../utils/logger");

async function clearData() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    logger.info("Connected to MongoDB for clearing data...");

    const [users, drivers, rides, payments, ratings, notifications, soses] = await Promise.all([
      User.deleteMany({}),
      Driver.deleteMany({}),
      Ride.deleteMany({}),
      Payment.deleteMany({}),
      Rating.deleteMany({}),
      Notification.deleteMany({}),
      Sos.deleteMany({}),
    ]);

    logger.info({
      usersDeleted: users.deletedCount,
      driversDeleted: drivers.deletedCount,
      ridesDeleted: rides.deletedCount,
      paymentsDeleted: payments.deletedCount,
      ratingsDeleted: ratings.deletedCount,
      notificationsDeleted: notifications.deletedCount,
      sosDeleted: soses.deletedCount,
    }, "All user data and records have been successfully deleted.");

    await mongoose.disconnect();
    console.log("SUCCESS: All user data deleted successfully!");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Failed to clear data");
    console.error("ERROR clearing data:", err);
    process.exit(1);
  }
}

clearData();
