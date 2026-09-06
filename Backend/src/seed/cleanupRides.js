require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const Ride = require("../models/Ride");
const Driver = require("../models/Driver");
const Payment = require("../models/Payment");
const Sos = require("../models/Sos");
const Notification = require("../models/Notification");
const { RIDE_STATUS } = require("../constants/enums");
const logger = require("../utils/logger");

async function cleanup() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info("Connected to database for active ride cleanup");

  const activeStatuses = [
    RIDE_STATUS.REQUESTED,
    RIDE_STATUS.SEARCHING_DRIVER,
    RIDE_STATUS.DRIVER_ASSIGNED,
    RIDE_STATUS.DRIVER_ARRIVING,
    RIDE_STATUS.DRIVER_ARRIVED,
    RIDE_STATUS.RIDE_STARTED,
  ];

  // Find all active rides
  const activeRides = await Ride.find({ rideStatus: { $in: activeStatuses } });
  const activeRideIds = activeRides.map(r => r._id);
  const driverIds = activeRides.map(r => r.driver).filter(Boolean);

  if (activeRides.length === 0) {
    logger.info("No active rides found to delete.");
    await mongoose.disconnect();
    process.exit(0);
  }

  logger.info(`Found ${activeRides.length} active rides. Deleting...`);

  // Delete rides, associated payments, SOS, and notifications
  await Promise.all([
    Ride.deleteMany({ _id: { $in: activeRideIds } }),
    Payment.deleteMany({ ride: { $in: activeRideIds } }),
    Sos.deleteMany({ ride: { $in: activeRideIds } }),
    Notification.deleteMany({ ride: { $in: activeRideIds } })
  ]);

  logger.info("Active rides and associated payments, SOS, and notifications deleted.");

  // Update drivers of active rides to make them available
  if (driverIds.length > 0) {
    const updateResult = await Driver.updateMany(
      { _id: { $in: driverIds } },
      { $set: { isAvailable: true } }
    );
    logger.info(`Updated ${updateResult.modifiedCount} driver(s) to be available.`);
  }

  logger.info("Cleanup completed successfully.");
  await mongoose.disconnect();
  process.exit(0);
}

cleanup().catch((err) => {
  logger.error({ err }, "Cleanup failed");
  process.exit(1);
});
