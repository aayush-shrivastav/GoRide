require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const Driver = require("../models/Driver");
const User = require("../models/User");

async function check() {
  await mongoose.connect(env.MONGODB_URI);
  const totalUsers = await User.countDocuments();
  const totalDrivers = await Driver.countDocuments();
  const onlineDrivers = await Driver.find({ isOnline: true });
  
  console.log("=== DB STATUS ===");
  console.log("Total Users:", totalUsers);
  console.log("Total Drivers:", totalDrivers);
  console.log("Online Drivers Count:", onlineDrivers.length);
  onlineDrivers.forEach(d => {
    console.log(`- Driver ID: ${d._id}, Name: ${d.name}, Gender: ${d.gender}, Vehicle: ${d.vehicleType}, Online: ${d.isOnline}, Available: ${d.isAvailable}, Coordinates: [${d.currentLocation.coordinates}]`);
  });
  const Ride = require("../models/Ride");
  const recentRides = await Ride.find().sort({ createdAt: -1 }).limit(5);
  console.log("\n=== RECENT RIDES ===");
  recentRides.forEach(r => {
    console.log(`- Ride ID: ${r._id}, Status: ${r.rideStatus}, Vehicle: ${r.vehicleType}, Pickup: [${r.pickupLocation?.coordinates}], Rejected: ${r.rejectedDrivers?.length}, Requested: ${r.requestedDrivers?.length}, Created: ${r.createdAt}`);
  });

  await mongoose.disconnect();
  process.exit(0);
}

check();
