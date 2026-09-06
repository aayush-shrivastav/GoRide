const cookie = require("cookie");
const { verifyAccessToken } = require("../utils/tokens");
const User = require("../models/User");
const Driver = require("../models/Driver");

/**
 * Authenticates a Socket.io connection using the same JWT access token
 * used for REST requests (sent via `auth.token` on the client, or the
 * accessToken cookie). Identity is attached to the socket and is the ONLY
 * source of truth for who a socket belongs to — client-sent IDs in event
 * payloads are never trusted.
 */
async function socketAuthMiddleware(socket, next) {
  try {
    let token = socket.handshake.auth?.token;

    if (!token && socket.handshake.headers.cookie) {
      const parsed = cookie.parse(socket.handshake.headers.cookie);
      token = parsed.accessToken;
    }

    if (!token) return next(new Error("Authentication required"));

    const decoded = verifyAccessToken(token);
    const Model = decoded.role === "driver" ? Driver : User;
    const account = await Model.findById(decoded.id);
    if (!account) return next(new Error("Account no longer exists"));

    socket.userId = account._id.toString();
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
}

module.exports = socketAuthMiddleware;
