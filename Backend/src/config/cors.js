const env = require("./env");
const logger = require("../utils/logger");

/**
 * Parses all explicitly configured trusted origins from environment variables.
 * Supports comma-separated origins in CLIENT_URL and ALLOWED_ORIGINS.
 */
function getConfiguredOrigins() {
  const origins = [];

  const addOrigins = (val) => {
    if (!val || typeof val !== "string") return;
    val
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((origin) => {
        // Strip trailing slash for consistent exact matching
        const normalized = origin.replace(/\/+$/, "");
        if (normalized) origins.push(normalized);
      });
  };

  addOrigins(env.CLIENT_URL);
  addOrigins(env.ALLOWED_ORIGINS);

  return Array.from(new Set(origins));
}

/**
 * Regex for local development origins:
 * Matches localhost, 127.0.0.1, or private LAN IPv4 ranges (10.x, 172.16-31.x, 192.168.x)
 * on any port (e.g. :8081 for Metro/Expo, :19006, :5173 for Vite, :3000, etc.)
 */
const DEV_LOCAL_ORIGIN_REGEX =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;

/**
 * Validates whether a given origin is allowed to access the backend.
 *
 * Rules:
 * 1. Missing Origin (mobile apps, curl, Postman, internal health checks) -> ALLOWED.
 * 2. Explicitly configured origins (CLIENT_URL / ALLOWED_ORIGINS) -> ALLOWED (dev & prod).
 * 3. Local/LAN dev origins (localhost, 127.0.0.1, private IP) -> ALLOWED ONLY IN DEVELOPMENT.
 * 4. All other origins -> REJECTED.
 */
function isOriginAllowed(origin) {
  // Mobile apps (React Native iOS/Android via Axios/Fetch), native tools, and
  // server-to-server health checks do not send a browser 'Origin' header.
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.replace(/\/+$/, "");
  const trustedOrigins = getConfiguredOrigins();

  // 1. Explicitly configured origins are always allowed
  if (trustedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  // 2. In development, allow local and LAN addresses for Expo / React Native dev servers
  if (env.NODE_ENV !== "production" && DEV_LOCAL_ORIGIN_REGEX.test(normalizedOrigin)) {
    return true;
  }

  // 3. Reject all unknown origins
  return false;
}

/**
 * Dynamic CORS origin delegate for Express cors middleware.
 */
const corsOriginDelegate = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    // Reflect origin to satisfy Access-Control-Allow-Credentials: true
    callback(null, true);
  } else {
    logger.warn({ origin }, "Blocked by CORS policy: unauthorized origin");
    callback(null, false);
  }
};

const corsOptions = {
  origin: corsOriginDelegate,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  exposedHeaders: ["Set-Cookie"],
  maxAge: 86400, // 24 hours preflight cache
};

/**
 * Socket.io allowRequest handler to enforce CORS on WebSocket / polling handshakes.
 */
const socketAllowRequest = (req, callback) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    callback(null, true);
  } else {
    logger.warn({ origin }, "Socket connection blocked by CORS: unauthorized origin");
    callback("CORS origin not allowed", false);
  }
};

module.exports = {
  corsOptions,
  socketAllowRequest,
  isOriginAllowed,
  getConfiguredOrigins,
};
