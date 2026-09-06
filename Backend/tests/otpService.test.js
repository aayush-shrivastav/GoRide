const { issueRideOtp, verifyRideOtp } = require("../src/services/otpService");

describe("otpService", () => {
  it("issues an OTP that verifies successfully against its own hash", async () => {
    const { otp, otpHash, otpExpiresAt } = await issueRideOtp();
    const ride = { otpHash, otpExpiresAt, otpAttempts: 0 };
    await expect(verifyRideOtp(ride, otp)).resolves.toBe(true);
  });

  it("rejects an incorrect OTP", async () => {
    const { otpHash, otpExpiresAt } = await issueRideOtp();
    const ride = { otpHash, otpExpiresAt, otpAttempts: 0 };
    await expect(verifyRideOtp(ride, "0000")).rejects.toThrow();
  });

  it("rejects an expired OTP", async () => {
    const { otp, otpHash } = await issueRideOtp();
    const ride = { otpHash, otpExpiresAt: new Date(Date.now() - 1000), otpAttempts: 0 };
    await expect(verifyRideOtp(ride, otp)).rejects.toThrow(/expired/i);
  });
});
