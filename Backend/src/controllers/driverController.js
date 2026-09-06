const bcrypt = require("bcryptjs");
const Driver = require("../models/Driver");
const Ride = require("../models/Ride");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { sendSuccess } = require("../utils/apiResponse");
const { RIDE_STATUS } = require("../constants/enums");
const {
  signAccessToken,
  signRefreshToken,
  cookieOptions,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
} = require("../utils/tokens");

const ACTIVE_RIDE_STATUSES = [
  RIDE_STATUS.DRIVER_ASSIGNED,
  RIDE_STATUS.DRIVER_ARRIVING,
  RIDE_STATUS.DRIVER_ARRIVED,
  RIDE_STATUS.RIDE_STARTED,
];

async function issueTokensAndRespond(res, account, statusCode, message) {
  const accessToken = signAccessToken({ id: account._id, role: "driver" });
  const refreshToken = signRefreshToken({ id: account._id, role: "driver" });

  account.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await account.save({ validateBeforeSave: false });

  res
    .cookie("accessToken", accessToken, { ...cookieOptions, maxAge: ACCESS_TOKEN_MAX_AGE_MS })
    .cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: REFRESH_TOKEN_MAX_AGE_MS });

  return sendSuccess(res, {
    statusCode,
    message,
    data: { driver: account.toSafeJSON(), accessToken, refreshToken },
  });
}

const register = catchAsync(async (req, res, next) => {
  const { name, email, phone, password, gender, vehicleType, vehicleModel, vehicleNumber, vehicleColor, licenseNumber } =
    req.body;

  const existing = await Driver.findOne({
    $or: [{ email }, { phone }, { vehicleNumber }, { licenseNumber }],
  });
  if (existing) return next(new AppError("A driver with this email, phone, vehicle or license already exists", 409));

  const driver = await Driver.create({
    name,
    email,
    phone,
    password,
    gender,
    vehicleType,
    vehicleModel,
    vehicleNumber,
    vehicleColor,
    licenseNumber,
  });

  await issueTokensAndRespond(res, driver, 201, "Driver registered successfully");
});

const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  const driver = await Driver.findOne({ email }).select("+password");
  if (!driver || !(await driver.comparePassword(password))) {
    return next(new AppError("Invalid email or password", 401));
  }
  await issueTokensAndRespond(res, driver, 200, "Logged in successfully");
});

const logout = catchAsync(async (req, res) => {
  req.user.refreshTokenHash = null;
  req.user.isOnline = false;
  req.user.isAvailable = false;
  await req.user.save({ validateBeforeSave: false });
  res.clearCookie("accessToken").clearCookie("refreshToken");
  return sendSuccess(res, { message: "Logged out successfully" });
});

const getProfile = catchAsync(async (req, res) => {
  return sendSuccess(res, { message: "Profile fetched", data: { driver: req.user.toSafeJSON() } });
});

const updateProfile = catchAsync(async (req, res) => {
  const allowed = ["name", "vehicleModel", "vehicleColor", "profileImage"];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) req.user[field] = req.body[field];
  });
  await req.user.save();
  return sendSuccess(res, { message: "Profile updated", data: { driver: req.user.toSafeJSON() } });
});

const goOnline = catchAsync(async (req, res) => {
  // Do NOT blindly set isAvailable = true — if this driver already has an
  // active ride in progress, marking them available would let the
  // matching loop offer them a second, overlapping ride.
  const activeRide = await Ride.findOne({ driver: req.user._id, rideStatus: { $in: ACTIVE_RIDE_STATUSES } });

  req.user.isOnline = true;
  req.user.isAvailable = !activeRide;
  await req.user.save({ validateBeforeSave: false });

  return sendSuccess(res, {
    message: activeRide ? "You are online but have an active ride in progress" : "You are now online",
    data: {
      isOnline: true,
      isAvailable: !activeRide,
      activeRideId: activeRide ? activeRide._id : null,
    }
  });
});

const goOffline = catchAsync(async (req, res) => {
  req.user.isOnline = false;
  req.user.isAvailable = false;
  await req.user.save({ validateBeforeSave: false });
  return sendSuccess(res, { message: "You are now offline" });
});

const getStatus = catchAsync(async (req, res) => {
  return sendSuccess(res, {
    message: "Status fetched",
    data: { isOnline: req.user.isOnline, isAvailable: req.user.isAvailable },
  });
});

/**
 * REST fallback for location updates. In practice the driver app should
 * prefer the `driver_location_update` Socket.io event for lower latency;
 * this endpoint exists for clients that cannot maintain a socket.
 */
const updateLocation = catchAsync(async (req, res) => {
  const { latitude, longitude } = req.body;
  req.user.currentLocation = { type: "Point", coordinates: [longitude, latitude] };
  req.user.lastLocationUpdate = new Date();
  await req.user.save({ validateBeforeSave: false });
  return sendSuccess(res, { message: "Location updated" });
});

module.exports = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  goOnline,
  goOffline,
  getStatus,
  updateLocation,
};
