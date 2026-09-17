require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const Ride = require("../models/Ride");
const Driver = require("../models/Driver");

async function cleanup() {
  await mongoose.connect(env.MONGODB_URI);
  
  const stuckRides = await Ride.find({
    rideStatus: { $in: ["REQUESTED", "SEARCHING_DRIVER", "DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "RIDE_STARTED"] },
  });

  console.log(`Found ${stuckRides.length} stuck active rides.`);
  for (const ride of stuckRides) {
    console.log(`Cancelling ride: ${ride._id}, status: ${ride.rideStatus}`);
    ride.rideStatus = "CANCELLED_BY_PASSENGER";
    ride.cancellationReason = "Stale test ride cleaned up";
    await ride.save();
  }

  const drivers = await Driver.find({ isOnline: true });
  for (const d of drivers) {
    d.isAvailable = true;
    await d.save({ validateBeforeSave: false });
    console.log(`Driver ${d.name} (${d.vehicleType}) set to Online: true, Available: true`);
  }

  await mongoose.disconnect();
  console.log("Cleanup done!");
  process.exit(0);
}

cleanup().catch(err => {
  console.error(err);
  process.exit(1);
});
