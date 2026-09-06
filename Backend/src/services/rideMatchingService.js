const Ride = require("../models/Ride");
const User = require("../models/User");
const env = require("../config/env");
const driverMatchingService = require("./driverMatchingService");
const notificationService = require("./notificationService");
const logger = require("../utils/logger");
const { RIDE_STATUS, NOTIFICATION_TYPE } = require("../constants/enums");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sequential ride-matching loop.
 *
 * Runs after a ride is created (fire-and-forget from the controller).
 * Each round: find the nearest eligible driver (respecting female-driver
 * priority + progressive radius expansion), push a `ride_request` event to
 * them, and wait up to DRIVER_REQUEST_TIMEOUT_SECONDS for a response.
 *
 * Actual acceptance happens via the atomic POST /rides/:id/accept endpoint
 * (see rideController.acceptRide) — this loop only decides who gets asked
 * next and gives up once every option is exhausted. Re-checking the ride's
 * status on every iteration is what makes this safe against a driver
 * accepting out-of-band while we were about to contact someone else.
 */
async function matchRide(rideId) {
  const initialRide = await Ride.findById(rideId);
  if (!initialRide) return;
  const passenger = await User.findById(initialRide.passenger);
  const searchStartedAt = initialRide.requestedAt || new Date();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ride = await Ride.findById(rideId);
    if (!ride || ride.rideStatus !== RIDE_STATUS.SEARCHING_DRIVER) return; // assigned/cancelled elsewhere

    const pickup = {
      latitude: ride.pickupLocation.coordinates[1],
      longitude: ride.pickupLocation.coordinates[0],
    };

    const elapsedSeconds = (Date.now() - new Date(searchStartedAt).getTime()) / 1000;

    logger.info({ rideId, vehicleType: ride.vehicleType, pickup, elapsedSeconds }, "Searching for drivers...");

    const { drivers, radiusKm } = await driverMatchingService.searchDriversForRide({
      pickup,
      vehicleType: ride.vehicleType,
      passengerGender: passenger?.gender,
      preferFemaleDriver: ride.preferFemaleDriver,
      excludeDriverIds: ride.rejectedDrivers,
      elapsedSeconds,
    });

    logger.info({ rideId, driversFound: drivers.length, radiusKm }, "Driver search result");

    if (!drivers.length) {
      await Ride.findByIdAndUpdate(rideId, { rideStatus: RIDE_STATUS.NO_DRIVER_FOUND });
      await notificationService.notify({
        recipientId: ride.passenger,
        recipientRole: "passenger",
        type: NOTIFICATION_TYPE.RIDE_REQUESTED,
        title: "No drivers available",
        message: "We couldn't find a nearby driver. Please try again shortly.",
        ride: ride._id,
      });
      try {
        const io = require("../sockets").getIO();
        io.to(`passenger:${ride.passenger}`).emit("no_driver_found", { rideId: ride._id });
      } catch (err) {
        logger.warn({ err, rideId }, "Could not emit no_driver_found — socket layer not ready");
      }
      logger.info({ rideId }, "No driver found for ride");
      return;
    }

    const candidate = drivers[0];

    // Record the invitation BEFORE emitting it — this is the ledger that
    // POST /rides/:id/accept and /reject check against, so a driver can
    // never accept/reject a ride that was never actually offered to them.
    await Ride.findByIdAndUpdate(rideId, {
      $push: { requestedDrivers: { driver: candidate._id, requestedAt: new Date(), status: "PENDING" } },
    });

    try {
      const io = require("../sockets").getIO();
      io.to(`driver:${candidate._id}`).emit("ride_request", {
        rideId: ride._id,
        pickupAddress: ride.pickupAddress,
        dropAddress: ride.dropAddress,
        pickupLocation: ride.pickupLocation,
        dropLocation: ride.dropLocation,
        stops: ride.stops,
        stopCount: ride.stops.length,
        distanceKm: ride.distanceKm,
        estimatedDurationMin: ride.estimatedDurationMin,
        estimatedFare: ride.estimatedFare,
        vehicleType: ride.vehicleType,
        paymentMethod: ride.paymentMethod,
        passenger: passenger
          ? {
              _id: passenger._id,
              name: passenger.name,
              phone: passenger.phone,
              gender: passenger.gender,
              rating: passenger.rating,
            }
          : null,
        expiresInSeconds: env.DRIVER_REQUEST_TIMEOUT_SECONDS,
      });
    } catch (err) {
      logger.warn({ err }, "Could not emit ride_request — socket layer not ready");
    }

    await sleep(env.DRIVER_REQUEST_TIMEOUT_SECONDS * 1000);

    const refreshed = await Ride.findById(rideId);
    if (!refreshed || refreshed.rideStatus !== RIDE_STATUS.SEARCHING_DRIVER) return; // someone accepted

    // Timed out — expire this driver's invitation, treat like a rejection
    // for matching-exclusion purposes, and move to the next candidate.
    await Ride.findOneAndUpdate(
      { _id: rideId, "requestedDrivers.driver": candidate._id, "requestedDrivers.status": "PENDING" },
      {
        $addToSet: { rejectedDrivers: candidate._id },
        $set: { "requestedDrivers.$.status": "EXPIRED" },
      }
    );
  }
}

module.exports = { matchRide };
