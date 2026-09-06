const { Server } = require("socket.io");
const { corsOptions, socketAllowRequest } = require("../config/cors");
const env = require("../config/env");
const logger = require("../utils/logger");
const socketAuthMiddleware = require("./socketAuth");
const registerDriverHandlers = require("./driverSocket");
const registerPassengerHandlers = require("./passengerSocket");
const notificationService = require("../services/notificationService");

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: corsOptions,
    allowRequest: socketAllowRequest,
  });


  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    // Every authenticated user joins a personal room `<role>:<id>` — this
    // is how the rest of the app pushes targeted events/notifications.
    const room = `${socket.userRole}:${socket.userId}`;
    socket.join(room);
    logger.info({ userId: socket.userId, role: socket.userRole }, "Socket connected");

    if (socket.userRole === "driver") registerDriverHandlers(io, socket);
    if (socket.userRole === "passenger") registerPassengerHandlers(io, socket);

    socket.on("disconnect", async () => {
      logger.info({ userId: socket.userId, role: socket.userRole }, "Socket disconnected");
      // Intentionally a no-op for ride/driver state: a temporary network
      // drop must never cancel an active ride, clear the driver's
      // assignment, or flip isOnline/isAvailable. The driver's REST
      // POST /drivers/offline (or the driver_offline socket event) is the
      // only path that takes them out of the matching pool — disconnects
      // are expected to be transient and the client will reconnect and
      // rejoin its room, after which it keeps receiving ride/location
      // events for any ride still in progress.
    });
  });

  notificationService.attachIO(io);
  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.io has not been initialized yet");
  return io;
}

module.exports = { initSocket, getIO };
