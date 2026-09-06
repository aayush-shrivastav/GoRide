const Driver = require("../models/Driver");
const Ride = require("../models/Ride");
const logger = require("../utils/logger");
const { RIDE_STATUS } = require("../constants/enums");

const ACTIVE_RIDE_STATUSES = [
  RIDE_STATUS.DRIVER_ASSIGNED,
  RIDE_STATUS.DRIVER_ARRIVING,
  RIDE_STATUS.DRIVER_ARRIVED,
  RIDE_STATUS.RIDE_STARTED,
];

// Simple in-memory throttle so a driver's rapid GPS stream doesn't hammer
// the database. Fine for a single-instance deployment; for multi-instance
// scaling this would move to Redis.
const lastWriteAt = new Map();
const MIN_WRITE_INTERVAL_MS = 3000;

function registerDriverHandlers(io, socket) {
  const driverId = socket.userId;

  socket.on("driver_online", async () => {
    // Same rule as the REST endpoint: don't mark available if there's
    // already an active ride, or this driver could be matched twice.
    const hasActiveRide = await Ride.exists({ driver: driverId, rideStatus: { $in: ACTIVE_RIDE_STATUSES } });
    await Driver.findByIdAndUpdate(driverId, { isOnline: true, isAvailable: !hasActiveRide });
  });

  socket.on("driver_offline", async () => {
    await Driver.findByIdAndUpdate(driverId, { isOnline: false, isAvailable: false });
  });

  /**
   * payload: { latitude, longitude, rideId? }
   * Identity (driverId) always comes from the authenticated socket, never
   * from the payload.
   */
  socket.on("driver_location_update", async (payload) => {
    try {
      const { latitude, longitude, rideId } = payload || {};
      if (typeof latitude !== "number" || typeof longitude !== "number") return;
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;

      const now = Date.now();
      const last = lastWriteAt.get(driverId) || 0;
      if (now - last >= MIN_WRITE_INTERVAL_MS) {
        lastWriteAt.set(driverId, now);
        await Driver.findByIdAndUpdate(driverId, {
          currentLocation: { type: "Point", coordinates: [longitude, latitude] },
          lastLocationUpdate: new Date(),
        });
      }

      // Only broadcast to the passenger of the ride this driver is
      // currently assigned to — never a public broadcast of location.
      if (rideId) {
        const ride = await Ride.findOne({
          _id: rideId,
          driver: driverId,
          rideStatus: { $in: [RIDE_STATUS.DRIVER_ASSIGNED, RIDE_STATUS.DRIVER_ARRIVING, RIDE_STATUS.DRIVER_ARRIVED, RIDE_STATUS.RIDE_STARTED] },
        });
        if (ride) {
          io.to(`passenger:${ride.passenger}`).emit("driver_location_update", {
            rideId,
            latitude,
            longitude,
            timestamp: now,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "driver_location_update handler failed");
    }
  });

  socket.on("ride_status_updated", (payload) => {
    // Placeholder hook for additional client-driven status pings if needed
    // beyond the REST lifecycle endpoints (arriving/arrived/start/complete).
    logger.debug({ driverId, payload }, "ride_status_updated received from driver");
  });
}

module.exports = registerDriverHandlers;
