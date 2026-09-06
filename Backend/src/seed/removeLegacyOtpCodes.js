require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const Ride = require("../models/Ride");
const logger = require("../utils/logger");

async function removeLegacyOtpCodes() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    const result = await Ride.collection.updateMany(
      { otpCode: { $exists: true } },
      { $unset: { otpCode: 1 } }
    );
    logger.info({ modifiedCount: result.modifiedCount }, "Removed legacy plaintext OTP codes");
    await mongoose.disconnect();
  } catch (err) {
    logger.error({ err }, "Failed to remove legacy plaintext OTP codes");
    process.exitCode = 1;
  }
}

removeLegacyOtpCodes();
