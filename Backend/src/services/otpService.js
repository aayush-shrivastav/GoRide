const env = require("../config/env");
const AppError = require("../utils/AppError");
const { generateOtp, hashOtp, compareOtp } = require("../utils/otp");

/**
 * Generates a fresh OTP for a ride, hashes it, and returns both the
 * plaintext (to be sent to the passenger via notification/SMS) and the
 * fields to persist on the Ride document.
 */
async function issueRideOtp() {
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const otpExpiresAt = new Date(Date.now() + env.OTP_EXPIRES_MINUTES * 60 * 1000);
  return { otp, otpHash, otpExpiresAt };
}

/**
 * Verifies a submitted OTP against the ride's stored hash.
 * Throws AppError on expiry, attempt exhaustion, or mismatch.
 * Caller is responsible for persisting otpAttempts/otpVerified updates.
 */
async function verifyRideOtp(ride, submittedOtp) {
  if (!ride.otpHash || !ride.otpExpiresAt) {
    throw new AppError("No OTP has been issued for this ride", 400);
  }
  if (ride.otpAttempts >= env.OTP_MAX_ATTEMPTS) {
    throw new AppError("Maximum OTP verification attempts exceeded", 429);
  }
  if (new Date() > new Date(ride.otpExpiresAt)) {
    throw new AppError("OTP has expired", 400);
  }

  const isValid = await compareOtp(submittedOtp, ride.otpHash);
  if (!isValid) {
    throw new AppError("Incorrect OTP", 400);
  }
  return true;
}

module.exports = { issueRideOtp, verifyRideOtp };
