const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { verifyAccessToken } = require("../utils/tokens");
const User = require("../models/User");
const Driver = require("../models/Driver");

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.split(" ")[1];
  if (req.cookies && req.cookies.accessToken) return req.cookies.accessToken;
  return null;
}

/**
 * Populates req.user (identity) and req.userRole from a verified JWT.
 * NEVER trust a userId/driverId sent in the request body — identity
 * always comes from this middleware.
 */
const authenticate = catchAsync(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next(new AppError("Authentication required", 401));

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    return next(new AppError("Invalid or expired token", 401));
  }

  const Model = decoded.role === "driver" ? Driver : User;
  const account = await Model.findById(decoded.id);
  if (!account) return next(new AppError("Account no longer exists", 401));

  req.user = account;
  req.userRole = decoded.role;
  next();
});

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return next(new AppError("You are not authorized to perform this action", 403));
    }
    next();
  };
}

module.exports = { authenticate, authorize };
