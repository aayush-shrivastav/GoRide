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

// Simple in-memory throttle.
// For multi-instance deployment, use Redis instead.
const lastWriteAt = new Map();

const MIN_WRITE_INTERVAL_MS = 3000;

function getDriverRoom(driverId) {
  return `driver:${String(driverId)}`;
}

function getPassengerRoom(passengerId) {
  return `passenger:${String(passengerId)}`;
}

function isValidCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

async function registerDriverHandlers(io, socket) {
  const driverId = socket.userId;

  if (!driverId) {
    logger.warn(
      { socketId: socket.id },
      "Driver socket connected without userId"
    );

    return;
  }

  const driverIdString = String(driverId);
  const driverRoom = getDriverRoom(driverIdString);

  /*
   * IMPORTANT:
   * rideMatchingService emits ride requests to:
   *
   *     driver:${driverId}
   *
   * Therefore every authenticated driver socket MUST join
   * this exact room.
   */
  await socket.join(driverRoom);

  logger.info(
    {
      driverId: driverIdString,
      socketId: socket.id,
      room: driverRoom,
    },
    "Driver joined personal socket room"
  );

  /*
   * DRIVER ONLINE
   */
  socket.on("driver_online", async () => {
    try {
      const hasActiveRide = await Ride.exists({
        driver: driverId,
        rideStatus: {
          $in: ACTIVE_RIDE_STATUSES,
        },
      });

      await Driver.findByIdAndUpdate(
        driverId,
        {
          isOnline: true,
          isAvailable: !hasActiveRide,
        },
        {
          new: true,
        }
      );

      logger.info(
        {
          driverId: driverIdString,
          hasActiveRide: Boolean(hasActiveRide),
          isAvailable: !hasActiveRide,
        },
        "Driver marked online"
      );
    } catch (err) {
      logger.error(
        {
          err,
          driverId: driverIdString,
        },
        "driver_online handler failed"
      );
    }
  });

  /*
   * DRIVER OFFLINE
   */
  socket.on("driver_offline", async () => {
    try {
      await Driver.findByIdAndUpdate(
        driverId,
        {
          isOnline: false,
          isAvailable: false,
        },
        {
          new: true,
        }
      );

      logger.info(
        {
          driverId: driverIdString,
        },
        "Driver marked offline"
      );
    } catch (err) {
      logger.error(
        {
          err,
          driverId: driverIdString,
        },
        "driver_offline handler failed"
      );
    }
  });

  /*
   * DRIVER LOCATION UPDATE
   *
   * payload:
   * {
   *   latitude,
   *   longitude,
   *   rideId?
   * }
   *
   * driverId always comes from authenticated socket.
   * Never trust driverId from client payload.
   */
  socket.on("driver_location_update", async (payload) => {
    try {
      const {
        latitude,
        longitude,
        rideId,
      } = payload || {};

      const lat = Number(latitude);
      const lng = Number(longitude);

      if (!isValidCoordinate(lat, lng)) {
        logger.warn(
          {
            driverId: driverIdString,
            latitude,
            longitude,
          },
          "Invalid driver location received"
        );

        return;
      }

      const now = Date.now();

      const last = lastWriteAt.get(driverIdString) || 0;

      /*
       * Throttle database writes.
       *
       * Socket location can come every few hundred milliseconds,
       * but DB only needs an update every 3 seconds.
       */
      if (now - last >= MIN_WRITE_INTERVAL_MS) {
        lastWriteAt.set(driverIdString, now);

        await Driver.findByIdAndUpdate(
          driverId,
          {
            currentLocation: {
              type: "Point",
              coordinates: [lng, lat],
            },
            lastLocationUpdate: new Date(now),
          }
        );
      }

      /*
       * Broadcast location ONLY to the passenger of the driver's
       * currently assigned active ride.
       */
      if (!rideId) {
        return;
      }

      const ride = await Ride.findOne({
        _id: rideId,
        driver: driverId,
        rideStatus: {
          $in: ACTIVE_RIDE_STATUSES,
        },
      }).select("passenger");

      if (!ride) {
        return;
      }

      const passengerId = ride.passenger?._id
        ? String(ride.passenger._id)
        : String(ride.passenger);

      if (!passengerId || passengerId === "undefined") {
        return;
      }

      io.to(getPassengerRoom(passengerId)).emit(
        "driver_location_update",
        {
          rideId: String(rideId),
          latitude: lat,
          longitude: lng,
          timestamp: now,
        }
      );
    } catch (err) {
      logger.error(
        {
          err,
          driverId: driverIdString,
        },
        "driver_location_update handler failed"
      );
    }
  });

  /*
   * Optional client-side ride status notification hook.
   */
  socket.on("ride_status_updated", (payload) => {
    logger.debug(
      {
        driverId: driverIdString,
        payload,
      },
      "ride_status_updated received from driver"
    );
  });

  /*
   * SOCKET DISCONNECT
   */
  socket.on("disconnect", async (reason) => {
    try {
      lastWriteAt.delete(driverIdString);

      /*
       * Don't immediately mark driver offline if another socket
       * belonging to the same driver is still connected.
       *
       * This can happen when the app reconnects or multiple tabs/
       * devices are connected.
       */
      const room = io.sockets.adapter.rooms.get(driverRoom);

      const hasAnotherSocket =
        room && room.size > 0;

      if (!hasAnotherSocket) {
        await Driver.findByIdAndUpdate(
          driverId,
          {
            isOnline: false,
            isAvailable: false,
          }
        );

        logger.info(
          {
            driverId: driverIdString,
            reason,
          },
          "Driver socket disconnected; driver marked offline"
        );
      } else {
        logger.debug(
          {
            driverId: driverIdString,
            reason,
          },
          "Driver socket disconnected; another socket is still connected"
        );
      }
    } catch (err) {
      logger.error(
        {
          err,
          driverId: driverIdString,
          reason,
        },
        "Driver disconnect handler failed"
      );
    }
  });
}

module.exports = registerDriverHandlers;