const crypto = require("crypto");
const User = require("../models/User");
const Driver = require("../models/Driver");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { sendSuccess } = require("../utils/apiResponse");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  cookieOptions,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
} = require("../utils/tokens");
const bcrypt = require("bcryptjs");

function sha256Token(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueTokensAndRespond(res, account, role, statusCode, message) {
  const idStr = account._id.toString();
  const accessToken = signAccessToken({ id: idStr, role });
  const refreshToken = signRefreshToken({ id: idStr, role });

  const tokenDigest = sha256Token(refreshToken);
  const hash = await bcrypt.hash(tokenDigest, 10);
  account.refreshTokenHash = hash;
  if (typeof account.markModified === "function") {
    account.markModified("refreshTokenHash");
  }
  const Model = role === "driver" ? Driver : User;
  await Model.updateOne({ _id: account._id }, { refreshTokenHash: hash });

  res
    .cookie("accessToken", accessToken, { ...cookieOptions, maxAge: ACCESS_TOKEN_MAX_AGE_MS })
    .cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: REFRESH_TOKEN_MAX_AGE_MS });

  const key = role === "driver" ? "driver" : "user";
  return sendSuccess(res, {
    statusCode,
    message,
    data: { [key]: account.toSafeJSON(), accessToken, refreshToken },
  });
}

/**
 * POST /api/auth/refresh
 * Works for BOTH passenger and driver tokens — the role embedded in the
 * (verified) refresh token JWT decides which model to look up, never a
 * value supplied by the client. Rotates the refresh token on every use:
 * the old one's hash is immediately overwritten, so a stolen-but-already-
 * used refresh token cannot be replayed after the legitimate client
 * rotates past it.
 */
const refresh = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) return next(new AppError("Refresh token required", 401));

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    res.clearCookie("accessToken").clearCookie("refreshToken");
    return next(new AppError("Invalid or expired refresh token", 401));
  }

  const role = decoded.role === "driver" ? "driver" : "passenger";
  const Model = role === "driver" ? Driver : User;

  const account = await Model.findById(decoded.id).select("+refreshTokenHash");
  if (!account) return next(new AppError("Account no longer exists", 401));

  if (!account.refreshTokenHash) {
    // No active session (e.g. already logged out elsewhere) — reject.
    return next(new AppError("Session expired, please log in again", 401));
  }

  const tokenDigest = sha256Token(token);
  const isValidSession = await bcrypt.compare(tokenDigest, account.refreshTokenHash);
  if (!isValidSession) {
    // Refresh token doesn't match the current session hash — either it was
    // already rotated past, or this is a stolen/replayed token. Invalidate
    // the whole session defensively rather than silently ignoring it.
    await Model.updateOne({ _id: account._id }, { refreshTokenHash: null });
    res.clearCookie("accessToken").clearCookie("refreshToken");
    return next(new AppError("Invalid refresh token, please log in again", 401));
  }

  await issueTokensAndRespond(res, account, role, 200, "Token refreshed");
});


const register = catchAsync(async (req, res, next) => {
  const {
    name,
    email,
    phone,
    password,
    gender,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactEmail,
  } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) return next(new AppError("An account with this email or phone already exists", 409));

  const userData = { name, email, phone, password, gender };

  if (emergencyContactPhone && emergencyContactPhone.trim()) {
    userData.emergencyContacts = [
      {
        name: emergencyContactName?.trim() || "Parent / Guardian",
        phone: emergencyContactPhone.trim(),
        email: emergencyContactEmail?.trim() || null,
      },
    ];
  }

  const user = await User.create(userData);
  await issueTokensAndRespond(res, user, "passenger", 201, "Registered successfully");
});

const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError("Invalid email or password", 401));
  }
  await issueTokensAndRespond(res, user, "passenger", 200, "Logged in successfully");
});

const logout = catchAsync(async (req, res) => {
  const role = req.user.role === "driver" ? "driver" : "passenger";
  const Model = role === "driver" ? Driver : User;
  await Model.updateOne({ _id: req.user._id }, { refreshTokenHash: null });
  res.clearCookie("accessToken").clearCookie("refreshToken");
  return sendSuccess(res, { message: "Logged out successfully" });
});


const getMe = catchAsync(async (req, res) => {
  return sendSuccess(res, { message: "Profile fetched", data: { user: req.user.toSafeJSON() } });
});

const updateProfile = catchAsync(async (req, res) => {
  const allowed = ["name", "gender", "profileImage"];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) req.user[field] = req.body[field];
  });
  await req.user.save();
  return sendSuccess(res, { message: "Profile updated", data: { user: req.user.toSafeJSON() } });
});

const changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError("Current password is incorrect", 401));
  }
  user.password = newPassword;
  await user.save();
  return sendSuccess(res, { message: "Password changed successfully" });
});

const forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  
  let user = await User.findOne({ email });
  let Model = User;
  if (!user) {
    user = await Driver.findOne({ email });
    Model = Driver;
  }
  
  if (!user) {
    return sendSuccess(res, { message: "If an account with that email exists, we sent an OTP to it." });
  }
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
  
  await Model.updateOne(
    { _id: user._id },
    { resetOtp: otp, resetOtpExpires: expiresAt }
  );
  
  // In a real app, send email/SMS here. For now, log it.
  console.log(`[DEV] Password reset OTP for ${email}: ${otp}`);
  
  return sendSuccess(res, { message: "If an account with that email exists, we sent an OTP to it.", data: { devOtp: otp } });
});

const resetPassword = catchAsync(async (req, res, next) => {
  const { email, otp, newPassword } = req.body;
  
  let user = await User.findOne({ email }).select("+resetOtp +resetOtpExpires +password");
  let Model = User;
  if (!user) {
    user = await Driver.findOne({ email }).select("+resetOtp +resetOtpExpires +password");
    Model = Driver;
  }
  
  if (!user) return next(new AppError("Invalid email or OTP", 400));
  
  if (user.resetOtp !== otp || !user.resetOtpExpires || user.resetOtpExpires < new Date()) {
    return next(new AppError("Invalid or expired OTP", 400));
  }
  
  user.password = newPassword;
  user.resetOtp = null;
  user.resetOtpExpires = null;
  await user.save();
  
  return sendSuccess(res, { message: "Password reset successfully. You can now log in." });
});

const getEmergencyContacts = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select("emergencyContacts");
  return sendSuccess(res, { message: "Emergency contacts fetched", data: { contacts: user?.emergencyContacts || [] } });
});

const addEmergencyContact = catchAsync(async (req, res, next) => {
  const { name, phone, email } = req.body;
  if (!name || !phone) return next(new AppError("Name and phone are required", 400));
  if (!/^[0-9]{10}$/.test(phone)) return next(new AppError("Phone must be 10 digits", 400));

  const user = await User.findById(req.user._id);
  if (!user) return next(new AppError("User not found", 404));
  if (user.emergencyContacts && user.emergencyContacts.length >= 5) {
    return next(new AppError("Maximum 5 emergency contacts allowed", 400));
  }

  user.emergencyContacts.push({ name, phone, email: email ? email.trim() : null });
  await user.save({ validateBeforeSave: false });

  return sendSuccess(res, { statusCode: 201, message: "Emergency contact added", data: { contacts: user.emergencyContacts } });
});

const deleteEmergencyContact = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new AppError("User not found", 404));

  const contact = user.emergencyContacts?.id(req.params.contactId);
  if (!contact) return next(new AppError("Contact not found", 404));

  contact.deleteOne();
  await user.save({ validateBeforeSave: false });

  return sendSuccess(res, { message: "Emergency contact deleted", data: { contacts: user.emergencyContacts } });
});

module.exports = { register, login, logout, getMe, updateProfile, changePassword, refresh, forgotPassword, resetPassword, getEmergencyContacts, addEmergencyContact, deleteEmergencyContact };
