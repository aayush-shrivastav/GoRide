const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const env = require("../config/env");

/**
 * Generates a numeric OTP of configured length and its bcrypt hash.
 * Only the hash should ever be persisted to the database.
 */
function generateOtp() {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < env.OTP_LENGTH; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
}

async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

async function compareOtp(otp, hash) {
  if (!otp || !hash) return false;
  return bcrypt.compare(otp, hash);
}

module.exports = { generateOtp, hashOtp, compareOtp };
