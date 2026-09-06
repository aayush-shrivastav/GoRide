require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const INSECURE_DEV_JWT_SECRET = "dev_jwt_secret_change_me";
const INSECURE_DEV_REFRESH_SECRET = "dev_refresh_secret_change_me";

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // eslint-disable-next-line no-console
    console.warn(`[env] Missing environment variable: ${name}`);
  }
  return value;
}

// Fail loudly at startup in production if real secrets were never set,
// instead of silently signing tokens with a well-known dev placeholder —
// that would let anyone forge a valid passenger/driver JWT.
if (NODE_ENV === "production") {
  const missing = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === INSECURE_DEV_JWT_SECRET) missing.push("JWT_SECRET");
  if (!process.env.REFRESH_TOKEN_SECRET || process.env.REFRESH_TOKEN_SECRET === INSECURE_DEV_REFRESH_SECRET)
    missing.push("REFRESH_TOKEN_SECRET");
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(`[env] Refusing to start in production with unset/default secrets: ${missing.join(", ")}`);
    process.exit(1);
  }
}

module.exports = {
  NODE_ENV,
  PORT: Number(process.env.PORT) || 5000,
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "",

  MONGODB_URI: required("MONGODB_URI", "mongodb://127.0.0.1:27017/cab_booking"),

  JWT_SECRET: required("JWT_SECRET", INSECURE_DEV_JWT_SECRET),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",
  REFRESH_TOKEN_SECRET: required("REFRESH_TOKEN_SECRET", INSECURE_DEV_REFRESH_SECRET),
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",

  NOMINATIM_BASE_URL: process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org",
  OSRM_BASE_URL: process.env.OSRM_BASE_URL || "http://router.project-osrm.org",


  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "",

  CURRENCY: process.env.CURRENCY || "INR",

  FEMALE_DRIVER_PRIORITY: process.env.FEMALE_DRIVER_PRIORITY !== "false",
  FEMALE_DRIVER_SEARCH_TIMEOUT: Number(process.env.FEMALE_DRIVER_SEARCH_TIMEOUT) || 20,
  INITIAL_DRIVER_RADIUS_KM: Number(process.env.INITIAL_DRIVER_RADIUS_KM) || 5,
  MAX_DRIVER_RADIUS_KM: Number(process.env.MAX_DRIVER_RADIUS_KM) || 15,
  RADIUS_EXPANSION_STEP_KM: Number(process.env.RADIUS_EXPANSION_STEP_KM) || 2,
  DRIVER_REQUEST_TIMEOUT_SECONDS: Number(process.env.DRIVER_REQUEST_TIMEOUT_SECONDS) || 30,

  OTP_LENGTH: Number(process.env.OTP_LENGTH) || 4,
  OTP_EXPIRES_MINUTES: Number(process.env.OTP_EXPIRES_MINUTES) || 10,
  OTP_MAX_ATTEMPTS: Number(process.env.OTP_MAX_ATTEMPTS) || 5,

  RATE_LIMIT_WINDOW_MINUTES: Number(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15,
  RATE_LIMIT_MAX_REQUESTS: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
};
