const jwt = require("jsonwebtoken");
const env = require("../config/env");

function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function signRefreshToken(payload) {
  return jwt.sign({ ...payload, nonce: Math.random().toString(36).substring(2) + Date.now() }, env.REFRESH_TOKEN_SECRET, { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN });
}


function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.REFRESH_TOKEN_SECRET);
}

/**
 * Parses simple JWT-style duration strings ("15m", "7d", "1h", "30s") into
 * milliseconds. Falls back to treating a bare number as milliseconds.
 * Used so cookie maxAge always matches the *actual* configured token
 * lifetime instead of a hardcoded value that can drift from .env.
 */
function durationToMs(duration, fallbackMs) {
  if (typeof duration === "number") return duration;
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(String(duration).trim());
  if (!match) return fallbackMs;
  const value = Number(match[1]);
  const unit = match[2] || "ms";
  const unitMs = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[unit];
  return value * unitMs;
}

const ACCESS_TOKEN_MAX_AGE_MS = durationToMs(env.JWT_EXPIRES_IN, 15 * 60 * 1000);
const REFRESH_TOKEN_MAX_AGE_MS = durationToMs(env.REFRESH_TOKEN_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SECURE ? "none" : "lax",
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  durationToMs,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
  cookieOptions,
};
