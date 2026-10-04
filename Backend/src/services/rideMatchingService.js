const Ride = require("../models/Ride");
const User = require("../models/User");
const env = require("../config/env");
const driverMatchingService = require("./driverMatchingService");
const notificationService = require("./notificationService");
const logger = require("../utils/logger");

const {
  RIDE_STATUS,
  NOTIFICATION_TYPE,
} = require("../constants/enums");

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* =========================================================
   HELPERS
========================================================= */

function getIdString(value) {
  if (!value) return "";

  if (value._id) {
    return value._id.toString();
  }

  return value.toString();
}

function getDriverRoom(io, driverId) {
  if (!io || !driverId) return null;

  return io.sockets.adapter.rooms.get(
    `driver:${getIdString(driverId)}`
  );
}

function getPassengerRoom(io, passengerId) {
  if (!io || !passengerId) return null;

  return io.sockets.adapter.rooms.get(
    `passenger:${getIdString(passengerId)}`
  );
}

/* =========================================================
   RIDE MATCHING
========================================================= */

/**
 * Sequential ride-matching loop.
 *
 * Flow:
 *
 * 1. Load ride.
 * 2. Check ride is still SEARCHING_DRIVER.
 * 3. Find eligible drivers.
 * 4. Select a connected driver first.
 * 5. Record PENDING invitation.
 * 6. Emit ride_request.
 * 7. Wait for driver response.
 * 8. If accepted -> controller changes ride status and loop exits.
 * 9. If rejected/expired -> next driver.
 * 10. If no drivers remain -> NO_DRIVER_FOUND.
 *
 * The actual acceptance is handled atomically by:
 * POST /rides/:rideId/accept
 */
async function matchRide(rideId) {
  const initialRide =
    await Ride.findById(rideId);

  if (!initialRide) {
    logger.warn(
      { rideId },
      "Ride not found while starting matching"
    );

    return;
  }

  if (
    initialRide.rideStatus !==
    RIDE_STATUS.SEARCHING_DRIVER
  ) {
    logger.info(
      {
        rideId,
        status: initialRide.rideStatus,
      },
      "Ride is not in searching state"
    );

    return;
  }

  const passenger =
    await User.findById(
      initialRide.passenger
    );

  /*
   * requestedAt is the beginning of the
   * matching/search period.
   */
  const searchStartedAt =
    initialRide.requestedAt ||
    initialRide.createdAt ||
    new Date();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    /* =====================================================
       RELOAD RIDE
    ===================================================== */

    const ride =
      await Ride.findById(rideId);

    if (!ride) {
      logger.info(
        { rideId },
        "Ride disappeared during matching"
      );

      return;
    }

    /*
     * If another driver accepted the ride,
     * or passenger cancelled it, stop immediately.
     */
    if (
      ride.rideStatus !==
      RIDE_STATUS.SEARCHING_DRIVER
    ) {
      logger.info(
        {
          rideId,
          status: ride.rideStatus,
        },
        "Stopping matching because ride state changed"
      );

      return;
    }

    /* =====================================================
       PICKUP LOCATION
    ===================================================== */

    const coordinates =
      ride.pickupLocation?.coordinates;

    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      logger.error(
        { rideId },
        "Ride has invalid pickup coordinates"
      );

      await Ride.findByIdAndUpdate(
        rideId,
        {
          rideStatus:
            RIDE_STATUS.NO_DRIVER_FOUND,
        }
      );

      return;
    }

    const pickup = {
      latitude: Number(
        coordinates[1]
      ),

      longitude: Number(
        coordinates[0]
      ),
    };

    if (
      !Number.isFinite(pickup.latitude) ||
      !Number.isFinite(pickup.longitude)
    ) {
      logger.error(
        {
          rideId,
          pickup,
        },
        "Ride has invalid pickup latitude/longitude"
      );

      await Ride.findByIdAndUpdate(
        rideId,
        {
          rideStatus:
            RIDE_STATUS.NO_DRIVER_FOUND,
        }
      );

      return;
    }

    /* =====================================================
       SEARCH ELIGIBLE DRIVERS
    ===================================================== */

    const elapsedSeconds =
      Math.max(
        0,
        (
          Date.now() -
          new Date(
            searchStartedAt
          ).getTime()
        ) / 1000
      );

    logger.info(
      {
        rideId,
        vehicleType:
          ride.vehicleType,

        pickup,

        passengerGender:
          passenger?.gender,

        preferFemaleDriver:
          Boolean(
            ride.preferFemaleDriver
          ),

        elapsedSeconds,
      },
      "Searching for drivers..."
    );

    const {
      drivers = [],
      radiusKm,
    } =
      await driverMatchingService.searchDriversForRide(
        {
          pickup,

          vehicleType:
            ride.vehicleType,

          passengerGender:
            passenger?.gender,

          preferFemaleDriver:
            Boolean(
              ride.preferFemaleDriver
            ),

          excludeDriverIds:
            ride.rejectedDrivers || [],

          elapsedSeconds,
        }
      );

    logger.info(
      {
        rideId,
        driversFound:
          drivers.length,
        radiusKm,
      },
      "Driver search result"
    );

    /* =====================================================
       NO DRIVER FOUND
    ===================================================== */

    if (!drivers.length) {
      const isFemalePreference =
        Boolean(
          ride.preferFemaleDriver
        );

      /*
       * Female-driver preference:
       *
       * Do NOT mark the ride as NO_DRIVER_FOUND.
       * Passenger can choose "accept male driver",
       * which calls acceptAnyDriver().
       */
      if (isFemalePreference) {
        logger.info(
          { rideId },
          "No female driver found"
        );

        const passengerId =
          getIdString(
            ride.passenger
          );

        /*
         * In-app notification.
         */
        if (passengerId) {
          try {
            await notificationService.notify(
              {
                recipientId:
                  passengerId,

                recipientRole:
                  "passenger",

                type:
                  NOTIFICATION_TYPE.RIDE_REQUESTED,

                title:
                  "No female drivers available",

                message:
                  "We couldn't find a female driver nearby. Would you like to connect with a male driver?",

                ride: ride._id,
              }
            );
          } catch (notificationError) {
            logger.warn(
              {
                notificationError,
                rideId,
              },
              "Could not send female-driver fallback notification"
            );
          }
        }

        /*
         * Socket notification.
         */
        try {
          const io =
            require("../sockets").getIO();

          if (
            io &&
            passengerId
          ) {
            io.to(
              `passenger:${passengerId}`
            ).emit(
              "no_female_driver_found",
              {
                rideId:
                  ride._id,

                message:
                  "No female driver is currently available near you.",
              }
            );
          }
        } catch (socketError) {
          logger.warn(
            {
              socketError,
              rideId,
            },
            "Could not emit no_female_driver_found"
          );
        }

        /*
         * Stop here.
         *
         * Passenger's acceptAnyDriver()
         * endpoint will restart matching.
         */
        return;
      }

      /* ===================================================
         NO DRIVER AT ALL
      =================================================== */

      /*
       * Keep searching for nearby drivers up to search timeout (40 seconds)
       * rather than immediately terminating the ride.
       */
      const maxSearchSeconds = Math.max(
        40,
        Number(env.DRIVER_REQUEST_TIMEOUT_SECONDS) || 30
      );

      if (elapsedSeconds < maxSearchSeconds) {
        logger.info(
          {
            rideId,
            elapsedSeconds,
            maxSearchSeconds,
          },
          "No drivers found in this pass, waiting before retrying search..."
        );

        await sleep(3000);
        continue;
      }

      /*
       * Re-check the ride before changing its state.
       * Another process may have accepted/cancelled it.
       */
      const latestRide =
        await Ride.findById(
          rideId
        );

      if (!latestRide) {
        return;
      }

      if (
        latestRide.rideStatus !==
        RIDE_STATUS.SEARCHING_DRIVER
      ) {
        return;
      }

      await Ride.findByIdAndUpdate(
        rideId,
        {
          rideStatus:
            RIDE_STATUS.NO_DRIVER_FOUND,
        }
      );

      const passengerId =
        getIdString(
          latestRide.passenger
        );

      if (passengerId) {
        try {
          await notificationService.notify(
            {
              recipientId:
                passengerId,

              recipientRole:
                "passenger",

              type:
                NOTIFICATION_TYPE.RIDE_REQUESTED,

              title:
                "No drivers available",

              message:
                "We couldn't find a nearby driver. Please try again shortly.",

              ride:
                latestRide._id,
            }
          );
        } catch (notificationError) {
          logger.warn(
            {
              notificationError,
              rideId,
            },
            "Could not send no-driver notification"
          );
        }
      }

      try {
        const io =
          require("../sockets").getIO();

        if (
          io &&
          passengerId
        ) {
          io.to(
            `passenger:${passengerId}`
          ).emit(
            "no_driver_found",
            {
              rideId:
                latestRide._id,
            }
          );
        }
      } catch (socketError) {
        logger.warn(
          {
            socketError,
            rideId,
          },
          "Could not emit no_driver_found"
        );
      }

      logger.info(
        { rideId },
        "No driver found for ride"
      );

      return;
    }

    /* =====================================================
       SOCKET.IO
    ===================================================== */

    let io = null;

    try {
      io =
        require("../sockets").getIO();
    } catch (socketError) {
      logger.warn(
        {
          socketError,
          rideId,
        },
        "Socket.IO is not initialized"
      );
    }

    /* =====================================================
       FIND CONNECTED DRIVER OR BEST AVAILABLE
    ===================================================== */

    let candidate = null;

    if (io) {
      for (const driver of drivers) {
        const room = getDriverRoom(io, driver._id);
        if (room && room.size > 0) {
          candidate = driver;
          break;
        }
      }
    }

    /*
     * If none of the drivers has an active socket room yet,
     * select the closest eligible driver in database.
     */
    if (!candidate) {
      candidate = drivers[0];
    }

    if (!candidate) {
      logger.warn(
        { rideId },
        "Driver search returned empty candidate"
      );
      await sleep(2000);
      continue;
    }

    const candidateId =
      getIdString(
        candidate._id
      );

    /* =====================================================
       FINAL RIDE STATE CHECK BEFORE INVITATION
    ===================================================== */

    const beforeInvite =
      await Ride.findOne({
        _id: rideId,

        rideStatus:
          RIDE_STATUS.SEARCHING_DRIVER,
      });

    if (!beforeInvite) {
      return;
    }

    /* =====================================================
       RECORD PENDING INVITATION
    ===================================================== */

    const invitationTime =
      new Date();

    const invitationUpdate =
      await Ride.findOneAndUpdate(
        {
          _id: rideId,

          rideStatus:
            RIDE_STATUS.SEARCHING_DRIVER,

          /*
           * Do not create duplicate active
           * invitation for the same driver.
           */
          requestedDrivers: {
            $not: {
              $elemMatch: {
                driver:
                  candidate._id,

                status:
                  "PENDING",
              },
            },
          },
        },

        {
          $push: {
            requestedDrivers: {
              driver:
                candidate._id,

              requestedAt:
                invitationTime,

              status:
                "PENDING",
            },
          },
        },

        {
          new: true,
        }
      );

    /*
     * Ride state changed while we were
     * preparing invitation.
     */
    if (!invitationUpdate) {
      logger.info(
        {
          rideId,
          driverId:
            candidateId,
        },
        "Ride changed before invitation could be recorded"
      );

      return;
    }

    /* =====================================================
       EMIT RIDE REQUEST
    ===================================================== */

    try {
      if (io) {
        io.to(
          `driver:${candidateId}`
        ).emit(
          "ride_request",
          {
            rideId:
              ride._id,

            _id:
              ride._id,

            pickupAddress:
              ride.pickupAddress,

            dropAddress:
              ride.dropAddress,

            pickupLocation:
              ride.pickupLocation,

            dropLocation:
              ride.dropLocation,

            stops:
              ride.stops || [],

            stopCount:
              Array.isArray(
                ride.stops
              )
                ? ride.stops.length
                : 0,

            distanceKm:
              ride.distanceKm,

            estimatedDurationMin:
              ride.estimatedDurationMin,

            estimatedFare:
              ride.estimatedFare,

            vehicleType:
              ride.vehicleType,

            paymentMethod:
              ride.paymentMethod,

            passenger:
              passenger
                ? {
                  _id:
                    passenger._id,

                  name:
                    passenger.name,

                  phone:
                    passenger.phone,

                  gender:
                    passenger.gender,

                  rating:
                    passenger.rating,
                }
                : null,

            expiresInSeconds:
              env.DRIVER_REQUEST_TIMEOUT_SECONDS || 30,
          }
        );

        logger.info(
          {
            rideId: ride._id,
            driverId: candidateId,
            name: candidate.name,
            expiresInSeconds: env.DRIVER_REQUEST_TIMEOUT_SECONDS || 30,
          },
          "Emitted ride_request to driver"
        );
      }
    } catch (socketError) {
      logger.warn(
        {
          socketError,
          rideId,
          driverId: candidateId,
        },
        "Could not emit ride_request"
      );
    }

    /* =====================================================
       WAIT FOR DRIVER
    ===================================================== */

    const timeoutSeconds =
      Math.max(
        1,
        Number(
          env.DRIVER_REQUEST_TIMEOUT_SECONDS
        ) || 20
      );

    await sleep(
      timeoutSeconds * 1000
    );

    /* =====================================================
       CHECK WHAT HAPPENED
    ===================================================== */

    const refreshed =
      await Ride.findById(
        rideId
      );

    if (!refreshed) {
      return;
    }

    /*
     * Driver accepted the ride,
     * passenger cancelled,
     * or another process changed state.
     */
    if (
      refreshed.rideStatus !==
      RIDE_STATUS.SEARCHING_DRIVER
    ) {
      return;
    }

    /*
     * Check whether this driver's invitation
     * is still pending.
     *
     * If it is already ACCEPTED/REJECTED/EXPIRED,
     * another action already handled it.
     */
    const invitation =
      (
        refreshed.requestedDrivers ||
        []
      ).find(
        (item) =>
          getIdString(
            item.driver
          ) === candidateId &&
          item.status ===
          "PENDING"
      );

    if (!invitation) {
      continue;
    }

    /* =====================================================
       EXPIRE INVITATION
    ===================================================== */

    await Ride.findOneAndUpdate(
      {
        _id: rideId,

        rideStatus:
          RIDE_STATUS.SEARCHING_DRIVER,

        requestedDrivers: {
          $elemMatch: {
            driver:
              candidate._id,

            status:
              "PENDING",
          },
        },
      },

      {
        $addToSet: {
          rejectedDrivers:
            candidate._id,
        },

        $set: {
          "requestedDrivers.$.status":
            "EXPIRED",
        },
      }
    );

    logger.info(
      {
        rideId,
        driverId:
          candidateId,
      },
      "Driver invitation expired; moving to next driver"
    );
  }
}

module.exports = {
  matchRide,
};