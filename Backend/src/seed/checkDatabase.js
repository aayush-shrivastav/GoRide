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
  await mongoose.disconnect();
  process.exit(0);
}

check();
