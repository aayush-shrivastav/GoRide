const { Server } = require("socket.io");

const {
  corsOptions,
  socketAllowRequest,
} = require("../config/cors");

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

  // Authenticate every socket before connection is accepted.
  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    const userId = String(socket.userId);
    const userRole = socket.userRole;

    /*
     * Every authenticated user gets a personal room:
     *
     * driver:<driverId>
     * passenger:<passengerId>
     *
     * rideMatchingService uses driver:<driverId>
     * to send ride requests.
     */
    const personalRoom = `${userRole}:${userId}`;

    socket.join(personalRoom);

    logger.info(
      {
        socketId: socket.id,
        userId,
        role: userRole,
        room: personalRoom,
      },
      "Socket connected and joined personal room"
    );

    /*
     * Register role-specific socket handlers.
     */
    if (userRole === "driver") {
      registerDriverHandlers(io, socket);
    } else if (userRole === "passenger") {
      registerPassengerHandlers(io, socket);
    } else {
      logger.warn(
        {
          socketId: socket.id,
          userId,
          role: userRole,
        },
        "Socket connected with unsupported role"
      );
    }

    /*
     * IMPORTANT:
     *
     * Do NOT change driver online/available state here.
     *
     * A socket disconnect can happen because of:
     * - temporary network loss
     * - app backgrounding
     * - reconnect
     * - Wi-Fi/mobile network switching
     *
     * Driver state should be changed only by explicit
     * driver_online / driver_offline logic.
     */
    socket.on("disconnect", (reason) => {
      logger.info(
        {
          socketId: socket.id,
          userId,
          role: userRole,
          reason,
        },
        "Socket disconnected"
      );
    });
  });

  notificationService.attachIO(io);

  return io;
}

function getIO() {
  if (!io) {
    throw new Error(
      "Socket.io has not been initialized yet"
    );
  }

  return io;
}

module.exports = {
  initSocket,
  getIO,
};