const logger = require("../utils/logger");
const env = require("../config/env");

function handleCastError(err) {
  return { statusCode: 400, message: `Invalid ${err.path}: ${err.value}` };
}

function handleDuplicateKeyError(err) {
  const field = Object.keys(err.keyValue || {})[0];
  return { statusCode: 409, message: `${field} already in use` };
}

function handleValidationError(err) {
  const message = Object.values(err.errors)
    .map((e) => e.message)
    .join(". ");
  return { statusCode: 400, message };
}

function handleJWTError() {
  return { statusCode: 401, message: "Invalid token, please log in again" };
}

function handleJWTExpired() {
  return { statusCode: 401, message: "Session expired, please log in again" };
}

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let details = err.details;

  if (err.name === "CastError") ({ statusCode, message } = handleCastError(err));
  else if (err.code === 11000) ({ statusCode, message } = handleDuplicateKeyError(err));
  else if (err.name === "ValidationError") ({ statusCode, message } = handleValidationError(err));
  else if (err.name === "JsonWebTokenError") ({ statusCode, message } = handleJWTError());
  else if (err.name === "TokenExpiredError") ({ statusCode, message } = handleJWTExpired());

  if (!err.isOperational && statusCode === 500) {
    logger.error({ err }, "Unexpected error");
  } else {
    logger.warn({ statusCode, message }, "Handled error");
  }

  res.status(statusCode).json({
    success: false,
    message,
    error:
      env.NODE_ENV === "production"
        ? undefined
        : { details, stack: err.stack },
  });
};
