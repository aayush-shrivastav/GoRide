const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const Driver = require("../models/Driver");
const Payment = require("../models/Payment");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { sendSuccess } = require("../utils/apiResponse");
const mapsService = require("../services/mapsService");
const fareService = require("../services/fareService");
const otpService = require("../services/otpService");
const notificationService = require("../services/notificationService");
const rideMatchingService = require("../services/rideMatchingService");
const { RIDE_STATUS, CANCELLABLE_STATUSES, NOTIFICATION_TYPE, VEHICLE_TYPES, PAYMENT_STATUS } = require("../constants/enums");
const logger = require("../utils/logger");
const env = require("../config/env");
const fareConfig = require("../config/fareConfig");

function normalizeStops(stops = []) {
  return stops.map((stop, index) => ({
    location: { type: "Point", coordinates: [stop.longitude, stop.latitude] },
    address: stop.address,
    order: index,
  }));
}

function calculateFareSplit(grossFare) {
  const platformCommission = Math.round(grossFare * (fareConfig.platformFeePercent / 100) * 100) / 100;
  const driverEarning = Math.round((grossFare - platformCommission) * 100) / 100;
  return { platformCommission, driverEarning };
}

const estimateRide = catchAsync(async (req, res) => {
  const { pickup, drop, stops = [], vehicleType } = req.body;
  const { distanceKm, durationMin } = await mapsService.getDistanceAndDurationForRoute([pickup, ...stops, drop]);
  const fare = fareService.estimateFare({ vehicleType, distanceKm, durationMin });
  return sendSuccess(res, {
    message: "Fare estimated",
    data: { distanceKm, durationMin, vehicleType, stops, fare },
  });
});

/**
 * GET /api/rides/nearby-drivers?lat=&lng=&vehicleType=&radiusKm=
 * Returns online+available drivers near the given coordinates.
 * Used by the passenger home screen to show live driver markers on the map.
 */
const getNearbyDrivers = catchAsync(async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const vehicleType = req.query.vehicleType || null;
  const radiusKm = parseFloat(req.query.radiusKm) || 5;

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, message: "lat and lng query params are required" });
  }

  const query = {
    isOnline: true,
    isAvailable: true,
    currentLocation: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radiusKm * 1000,
      },
    },
  };
  if (vehicleType) query.vehicleType = vehicleType;

  const drivers = await Driver.find(query)
    .select("name vehicleType vehicleModel vehicleNumber vehicleColor rating currentLocation gender")
    .limit(20);

  // Calculate haversine distance + ETA for each driver
  const pickupPoint = { latitude: lat, longitude: lng };
  const driversWithMeta = drivers.map((d) => {
    const driverLat = d.currentLocation?.coordinates?.[1];
    const driverLng = d.currentLocation?.coordinates?.[0];
    const distKm = (driverLat && driverLng)
      ? mapsService.haversineKm(pickupPoint, { latitude: driverLat, longitude: driverLng })
      : null;
    const etaMin = distKm ? Math.max(1, Math.round((distKm / 25) * 60)) : null; // 25 km/h city avg
    return {
      _id: d._id,
      name: d.name,
      vehicleType: d.vehicleType,
      vehicleModel: d.vehicleModel,
      vehicleColor: d.vehicleColor,
      rating: d.rating,
      gender: d.gender,
      latitude: driverLat || lat,
      longitude: driverLng || lng,
      distanceKm: distKm ? Math.round(distKm * 10) / 10 : null,
      etaMin,
    };
  });

  return sendSuccess(res, { message: "Nearby drivers fetched", data: { drivers: driversWithMeta } });
});

/**
 * POST /api/rides/all-estimates
 * Returns fare estimates for ALL vehicle types in a single request.
 * Reduces 4 separate API calls to 1 when loading FareEstimateScreen.
 */
const getAllEstimates = catchAsync(async (req, res) => {
  const { pickup, drop, stops = [] } = req.body;
  const { distanceKm, durationMin } = await mapsService.getDistanceAndDurationForRoute([pickup, ...stops, drop]);

  const estimates = {};
  VEHICLE_TYPES.forEach((vt) => {
    try {
      estimates[vt] = fareService.estimateFare({ vehicleType: vt, distanceKm, durationMin });
    } catch {
      // Skip unsupported vehicle types
    }
  });

  return sendSuccess(res, {
    message: "All estimates fetched",
    data: { distanceKm, durationMin, estimates },
  });
});

const createRide = catchAsync(async (req, res, next) => {
  const { pickup, drop, stops = [], vehicleType, paymentMethod, preferFemaleDriver } = req.body;

  // Prevent a passenger from having two simultaneously active rides.
  const activeRide = await Ride.findOne({
    passenger: req.user._id,
    rideStatus: { $in: [RIDE_STATUS.REQUESTED, RIDE_STATUS.SEARCHING_DRIVER, RIDE_STATUS.DRIVER_ASSIGNED, RIDE_STATUS.DRIVER_ARRIVING, RIDE_STATUS.DRIVER_ARRIVED, RIDE_STATUS.RIDE_STARTED] },
  });
  if (activeRide) return next(new AppError("You already have an active ride in progress", 409));

  const { distanceKm, durationMin } = await mapsService.getDistanceAndDurationForRoute([pickup, ...stops, drop]);
  const fare = fareService.estimateFare({ vehicleType, distanceKm, durationMin });

  const ride = await Ride.create({
    passenger: req.user._id,
    pickupLocation: { type: "Point", coordinates: [pickup.longitude, pickup.latitude] },
    dropLocation: { type: "Point", coordinates: [drop.longitude, drop.latitude] },
    stops: normalizeStops(stops),
    pickupAddress: pickup.address,
    dropAddress: drop.address,
    distanceKm,
    estimatedDurationMin: durationMin,
    estimatedFare: fare.totalFare,
    vehicleType,
    paymentMethod,
    preferFemaleDriver: Boolean(preferFemaleDriver),
    rideStatus: RIDE_STATUS.SEARCHING_DRIVER,
  });

  // Fire-and-forget: the matching loop runs independently and pushes
  // real-time updates over Socket.io as candidates are contacted.
  rideMatchingService.matchRide(ride._id.toString()).catch((err) => {
    logger.error({ err, rideId: ride._id }, "Driver matching loop failed");
  });

  return sendSuccess(res, { statusCode: 201, message: "Ride requested, searching for a driver", data: { ride } });
});

const getRide = catchAsync(async (req, res, next) => {
  const ride = await Ride.findById(req.params.rideId).populate("driver", "-refreshTokenHash").populate("passenger", "-refreshTokenHash");
  if (!ride) return next(new AppError("Ride not found", 404));

  const isOwner =
    (req.userRole === "passenger" && ride.passenger._id.equals(req.user._id)) ||
    (req.userRole === "driver" && ride.driver && ride.driver._id.equals(req.user._id));
  if (!isOwner) return next(new AppError("You are not authorized to view this ride", 403));

  return sendSuccess(res, { message: "Ride fetched", data: { ride } });
});

const myRides = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const filter = { passenger: req.user._id };
  if (status) filter.rideStatus = status;

  const [rides, total] = await Promise.all([
    Ride.find(filter)
      .populate("driver", "name vehicleType vehicleNumber rating")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    Ride.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    message: "Ride history fetched",
    data: { rides, total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

const driverRides = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const filter = { driver: req.user._id };
  if (status) filter.rideStatus = status;

  const [rides, total] = await Promise.all([
    Ride.find(filter)
      .populate("passenger", "name rating")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    Ride.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    message: "Ride history fetched",
    data: { rides, total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

/**
 * Atomic accept: only succeeds if (a) the ride is still unassigned AND
 * (b) THIS driver actually has a PENDING invitation on the ride's
 * requestedDrivers ledger, recorded within the last invitation window.
 * Both conditions are enforced inside the single findOneAndUpdate, which
 * is what prevents two drivers accepting the same ride simultaneously
 * AND what prevents a driver who was never offered this ride from
 * accepting it by guessing/reusing a rideId.
 */
const acceptRide = catchAsync(async (req, res, next) => {
  const driver = req.user;
  if (!driver.isOnline || !driver.isAvailable) {
    return next(new AppError("You must be online and available to accept rides", 400));
  }

  const { otp, otpHash, otpExpiresAt } = await otpService.issueRideOtp();

  // Small buffer added to DRIVER_REQUEST_TIMEOUT_SECONDS to tolerate normal
  // network/processing latency between the invite being recorded and this
  // request arriving — the matching loop is still the source of truth for
  // marking an invitation EXPIRED once its own timer fires.
  const invitationCutoff = new Date(Date.now() - (env.DRIVER_REQUEST_TIMEOUT_SECONDS + 5) * 1000);

  const ride = await Ride.findOneAndUpdate(
    {
      _id: req.params.rideId,
      rideStatus: RIDE_STATUS.SEARCHING_DRIVER,
      driver: null,
      requestedDrivers: {
        $elemMatch: { driver: driver._id, status: "PENDING", requestedAt: { $gte: invitationCutoff } },
      },
    },
    {
      $set: {
        driver: driver._id,
        rideStatus: RIDE_STATUS.DRIVER_ASSIGNED,
        acceptedAt: new Date(),
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
        "requestedDrivers.$.status": "ACCEPTED",
      },
      $unset: { otpCode: 1 },
    },
    { new: true }
  );

  if (!ride) {
    // Distinguish "already taken" from "never invited" for a clearer error,
    // without this read affecting the atomicity of the update above.
    const current = await Ride.findById(req.params.rideId).select("+requestedDrivers");
    if (!current) return next(new AppError("Ride not found", 404));
    if (current.rideStatus !== RIDE_STATUS.SEARCHING_DRIVER || current.driver) {
      return next(new AppError("This ride has already been assigned to another driver", 409));
    }
    const invite = current.requestedDrivers.find((r) => r.driver.equals(driver._id));
    if (!invite || invite.status !== "PENDING") {
      return next(new AppError("This ride request is not assigned to you", 403));
    }
    return next(new AppError("This ride invitation has expired", 409));
  }

  await ride.populate("passenger", "name phone gender rating");
  await ride.populate("driver", "-refreshTokenHash");

  driver.isAvailable = false;
  await driver.save({ validateBeforeSave: false });

  await notificationService.notify({
    recipientId: ride.passenger,
    recipientRole: "passenger",
    type: NOTIFICATION_TYPE.DRIVER_ASSIGNED,
    title: "Driver assigned",
    message: `${driver.name} is on the way. Share OTP ${otp} with your driver on arrival.`,
    ride: ride._id,
  });

  const io = require("../sockets").getIO();
  io.to(`passenger:${ride.passenger}`).emit("driver_assigned", {
    rideId: ride._id,
    driver: driver.toSafeJSON(),
    otp, // sent only to the passenger, never logged or sent to the driver
  });

  // Broadcast to all socket clients so any other driver's pending request card is dismissed
  io.emit("ride_taken", { rideId: ride._id });

  return sendSuccess(res, { message: "Ride accepted", data: { ride } });
});

/**
 * Same invitation guard as accept: a driver may only reject a ride that
 * was actually offered to them (PENDING entry in requestedDrivers).
 */
const rejectRide = catchAsync(async (req, res, next) => {
  const ride = await Ride.findOneAndUpdate(
    {
      _id: req.params.rideId,
      rideStatus: RIDE_STATUS.SEARCHING_DRIVER,
      requestedDrivers: { $elemMatch: { driver: req.user._id, status: "PENDING" } },
    },
    {
      $addToSet: { rejectedDrivers: req.user._id },
      $set: { "requestedDrivers.$.status": "REJECTED" },
    },
    { new: true }
  );

  if (!ride) {
    const current = await Ride.findById(req.params.rideId).select("+requestedDrivers");
    if (!current) return next(new AppError("Ride not found", 404));
    if (current.rideStatus !== RIDE_STATUS.SEARCHING_DRIVER) {
      return next(new AppError("Ride is no longer available to reject", 409));
    }
    return next(new AppError("This ride request is not assigned to you", 403));
  }

  // Rejecting one driver never cancels the ride — the matching loop simply
  // moves on to the next eligible candidate on its own.
  return sendSuccess(res, { message: "Ride rejected" });
});

const driverArriving = catchAsync(async (req, res, next) => {
  const ride = await Ride.findOneAndUpdate(
    { _id: req.params.rideId, driver: req.user._id, rideStatus: RIDE_STATUS.DRIVER_ASSIGNED },
    { rideStatus: RIDE_STATUS.DRIVER_ARRIVING },
    { new: true }
  );
  if (!ride) return next(new AppError("Ride cannot be updated from its current state", 409));

  const io = require("../sockets").getIO();
  io.to(`passenger:${ride.passenger}`).emit("driver_arriving", { rideId: ride._id });

  return sendSuccess(res, { message: "Marked as arriving", data: { ride } });
});

const driverArrived = catchAsync(async (req, res, next) => {
  const ride = await Ride.findOneAndUpdate(
    { _id: req.params.rideId, driver: req.user._id, rideStatus: { $in: [RIDE_STATUS.DRIVER_ASSIGNED, RIDE_STATUS.DRIVER_ARRIVING] } },
    { rideStatus: RIDE_STATUS.DRIVER_ARRIVED, arrivedAt: new Date() },
    { new: true }
  );
  if (!ride) return next(new AppError("Ride cannot be updated from its current state", 409));

  await notificationService.notify({
    recipientId: ride.passenger,
    recipientRole: "passenger",
    type: NOTIFICATION_TYPE.DRIVER_ARRIVED,
    title: "Driver has arrived",
    message: "Your driver is waiting outside. Share the OTP to start your ride.",
    ride: ride._id,
  });

  const io = require("../sockets").getIO();
  io.to(`passenger:${ride.passenger}`).emit("driver_arrived", { rideId: ride._id });

  return sendSuccess(res, { message: "Marked as arrived", data: { ride } });
});

/** Driver submits the OTP given to them by the passenger; backend verifies it server-side. */
const verifyOtp = catchAsync(async (req, res, next) => {
  const ride = await Ride.findOne({ _id: req.params.rideId, driver: req.user._id }).select("+otpHash +otpExpiresAt +otpAttempts");
  if (!ride) return next(new AppError("Ride not found", 404));
  
  // If driver enters OTP before clicking arrived, auto-transition to DRIVER_ARRIVED
  if ([RIDE_STATUS.DRIVER_ASSIGNED, RIDE_STATUS.DRIVER_ARRIVING].includes(ride.rideStatus)) {
    ride.rideStatus = RIDE_STATUS.DRIVER_ARRIVED;
    ride.arrivedAt = new Date();
  } else if (ride.rideStatus !== RIDE_STATUS.DRIVER_ARRIVED) {
    return next(new AppError("OTP cannot be verified for this ride in its current state", 400));
  }

  try {
    await otpService.verifyRideOtp(ride, req.body.otp);
  } catch (err) {
    ride.otpAttempts += 1;
    await ride.save({ validateBeforeSave: false });
    return next(err);
  }

  ride.otpVerified = true;
  await ride.save({ validateBeforeSave: false });

  return sendSuccess(res, { message: "OTP verified, you may start the ride" });
});

const startRide = catchAsync(async (req, res, next) => {
  const ride = await Ride.findOne({ _id: req.params.rideId, driver: req.user._id });
  if (!ride) return next(new AppError("Ride not found", 404));
  if (![RIDE_STATUS.DRIVER_ASSIGNED, RIDE_STATUS.DRIVER_ARRIVING, RIDE_STATUS.DRIVER_ARRIVED].includes(ride.rideStatus)) {
    return next(new AppError("Ride cannot be started from its current state", 400));
  }
  if (!ride.otpVerified) {
    return next(new AppError("OTP must be verified before starting the ride", 400));
  }

  ride.rideStatus = RIDE_STATUS.RIDE_STARTED;
  ride.startedAt = new Date();
  await ride.save();

  await notificationService.notify({
    recipientId: ride.passenger,
    recipientRole: "passenger",
    type: NOTIFICATION_TYPE.RIDE_STARTED,
    title: "Ride started",
    message: "Enjoy your ride!",
    ride: ride._id,
  });

  const io = require("../sockets").getIO();
  io.to(`passenger:${ride.passenger}`).emit("ride_started", { rideId: ride._id });

  return sendSuccess(res, { message: "Ride started", data: { ride } });
});

const completeRide = catchAsync(async (req, res, next) => {
  // Early status check before opening a database session
  const existingRide = await Ride.findOne({ _id: req.params.rideId, driver: req.user._id });
  if (!existingRide) return next(new AppError("Ride not found", 404));
  if (existingRide.rideStatus !== RIDE_STATUS.RIDE_STARTED) {
    return next(new AppError("Ride cannot be completed from its current state", 400));
  }

  let session;
  let responseRide;

  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const ride = await Ride.findOne({ _id: req.params.rideId, driver: req.user._id }).session(session);
      if (!ride) throw new AppError("Ride not found", 404);
      if (ride.rideStatus !== RIDE_STATUS.RIDE_STARTED) {
        throw new AppError("Ride cannot be completed from its current state", 400);
      }

      ride.rideStatus = RIDE_STATUS.RIDE_COMPLETED;
      ride.completedAt = new Date();
      ride.finalFare = ride.estimatedFare; // distance-based fare confirmed server-side at booking time
      const { platformCommission, driverEarning } = calculateFareSplit(ride.finalFare);
      ride.platformCommission = platformCommission;
      ride.driverEarning = driverEarning;
      if (ride.paymentMethod === "cash") ride.paymentStatus = PAYMENT_STATUS.SUCCESS;
      await ride.save({ session });

      if (ride.paymentMethod === "cash") {
        await Payment.create([{
          ride: ride._id,
          passenger: ride.passenger,
          driver: ride.driver,
          amount: ride.finalFare,
          currency: fareConfig.currency,
          method: "cash",
          status: PAYMENT_STATUS.SUCCESS,
          transactionId: `cash_${ride._id}`,
          gateway: "cash",
        }], { session });
      }

      const driver = await Driver.findById(req.user._id).session(session);
      // Only auto-restore availability if the driver is still online — if
      // they went offline mid-ride (e.g. ending their shift), respect that
      // instead of silently pulling them back into the matching pool.
      driver.isAvailable = driver.isOnline;
      driver.totalRides += 1;
      if (ride.paymentMethod === "cash") driver.totalEarnings += ride.driverEarning;
      await driver.save({ validateBeforeSave: false, session });

      responseRide = ride;
    });
  } catch (txErr) {
    if (txErr.isOperational) throw txErr;

    // Fallback for standalone Mongo instances (e.g. MongoMemoryServer in tests) without Replica Set support
    const ride = await Ride.findOne({ _id: req.params.rideId, driver: req.user._id });
    if (!ride) return next(new AppError("Ride not found", 404));
    if (ride.rideStatus !== RIDE_STATUS.RIDE_STARTED) {
      return next(new AppError("Ride cannot be completed from its current state", 400));
    }

    ride.rideStatus = RIDE_STATUS.RIDE_COMPLETED;
    ride.completedAt = new Date();
    ride.finalFare = ride.estimatedFare;
    const { platformCommission, driverEarning } = calculateFareSplit(ride.finalFare);
    ride.platformCommission = platformCommission;
    ride.driverEarning = driverEarning;
    if (ride.paymentMethod === "cash") ride.paymentStatus = PAYMENT_STATUS.SUCCESS;
    await ride.save();

    if (ride.paymentMethod === "cash") {
      await Payment.create([{
        ride: ride._id,
        passenger: ride.passenger,
        driver: ride.driver,
        amount: ride.finalFare,
        currency: fareConfig.currency,
        method: "cash",
        status: PAYMENT_STATUS.SUCCESS,
        transactionId: `cash_${ride._id}`,
        gateway: "cash",
      }]);
    }

    const driver = await Driver.findById(req.user._id);
    driver.isAvailable = driver.isOnline;
    driver.totalRides += 1;
    if (ride.paymentMethod === "cash") driver.totalEarnings += ride.driverEarning;
    await driver.save({ validateBeforeSave: false });

    responseRide = ride;
  } finally {
    if (session) session.endSession();
  }

  await notificationService.notify({
    recipientId: responseRide.passenger,
    recipientRole: "passenger",
    type: NOTIFICATION_TYPE.RIDE_COMPLETED,
    title: "Ride completed",
    message: `Trip completed. Fare: ${responseRide.finalFare}`,
    ride: responseRide._id,
  });

  const io = require("../sockets").getIO();
  io.to(`passenger:${responseRide.passenger}`).emit("ride_completed", { rideId: responseRide._id, finalFare: responseRide.finalFare });

  return sendSuccess(res, { message: "Ride completed", data: { ride: responseRide } });
});

const cancelRide = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const isPassenger = req.userRole === "passenger";

  const filter = {
    _id: req.params.rideId,
    $or: [{ passenger: req.user._id }, { driver: req.user._id }],
  };
  const ride = await Ride.findOne(filter).select("+requestedDrivers");
  if (!ride) {
    return sendSuccess(res, { message: "Ride already cancelled or non-existent", data: { ride: null } });
  }
  if (!CANCELLABLE_STATUSES.includes(ride.rideStatus)) {
    if (ride.rideStatus === RIDE_STATUS.NO_DRIVER_FOUND) {
      return sendSuccess(res, { message: "Ride already ended (no driver found)", data: { ride } });
    }
    return next(new AppError(`Ride cannot be cancelled from status ${ride.rideStatus}`, 400));
  }

  ride.rideStatus = isPassenger ? RIDE_STATUS.CANCELLED_BY_PASSENGER : RIDE_STATUS.CANCELLED_BY_DRIVER;
  ride.cancelledAt = new Date();
  ride.cancelledBy = req.userRole;
  ride.cancellationReason = reason;
  await ride.save();

  if (ride.driver) {
    // Same rule as ride completion: only restore availability if the
    // driver is still online, so an offline driver isn't silently marked
    // available again by a cancellation freeing them up.
    const releasedDriver = await Driver.findById(ride.driver);
    if (releasedDriver) {
      releasedDriver.isAvailable = releasedDriver.isOnline;
      await releasedDriver.save({ validateBeforeSave: false });
    }
  }

  const io = require("../sockets").getIO();
  const notifyRecipientId = isPassenger ? ride.driver : ride.passenger;
  const notifyRole = isPassenger ? "driver" : "passenger";
  
  if (notifyRecipientId) {
    await notificationService.notify({
      recipientId: notifyRecipientId,
      recipientRole: notifyRole,
      type: NOTIFICATION_TYPE.RIDE_CANCELLED,
      title: "Ride cancelled",
      message: reason,
      ride: ride._id,
    });
    io.to(`${notifyRole}:${notifyRecipientId}`).emit("ride_cancelled", { rideId: ride._id, reason, cancelledBy: req.userRole });
  } else if (isPassenger && !ride.driver) {
    // If passenger cancelled while searching, alert any drivers who might currently have this request card open
    (ride.requestedDrivers || []).forEach((reqDriver) => {
      if (reqDriver.status === "PENDING") {
        io.to(`driver:${reqDriver.driver}`).emit("ride_cancelled", { rideId: ride._id, reason, cancelledBy: req.userRole });
      }
    });
  }

  return sendSuccess(res, { message: "Ride cancelled", data: { ride } });
});

const triggerSos = catchAsync(async (req, res, next) => {
  const Sos = require("../models/Sos");
  const isPassenger = req.userRole === "passenger";
  const ride = await Ride.findOne({
    _id: req.params.rideId,
    [isPassenger ? "passenger" : "driver"]: req.user._id,
  });
  if (!ride) return next(new AppError("Ride not found", 404));
  if (![RIDE_STATUS.DRIVER_ASSIGNED, RIDE_STATUS.DRIVER_ARRIVING, RIDE_STATUS.DRIVER_ARRIVED, RIDE_STATUS.RIDE_STARTED].includes(ride.rideStatus)) {
    return next(new AppError("SOS can only be triggered during an active ride", 400));
  }

  const { latitude, longitude } = req.body;
  const sos = await Sos.create({
    ride: ride._id,
    passenger: req.user._id,
    driver: ride.driver,
    location: { type: "Point", coordinates: [longitude, latitude] },
  });

  const recipientId = isPassenger ? ride.driver : ride.passenger;
  const recipientRole = isPassenger ? "driver" : "passenger";
  await notificationService.notify({
    recipientId,
    recipientRole,
    type: NOTIFICATION_TYPE.SOS_TRIGGERED,
    title: "SOS triggered",
    message: `The ${isPassenger ? "passenger" : "driver"} has triggered an SOS alert.`,
    ride: ride._id,
  });

  const io = require("../sockets").getIO();
  io.to(`${recipientRole}:${recipientId}`).emit("sos_triggered", { rideId: ride._id, sosId: sos._id, location: sos.location });

  logger.warn({ rideId: ride._id, sosId: sos._id }, "SOS triggered");

  return sendSuccess(res, { statusCode: 201, message: "SOS alert sent", data: { sos } });
});
const getTodayEarnings = catchAsync(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const rides = await Ride.find({
    driver: req.user._id,
    rideStatus: RIDE_STATUS.RIDE_COMPLETED,
    completedAt: { $gte: startOfDay }
  });

  const totalEarnings = rides.reduce((sum, ride) => sum + (ride.driverEarning || ride.finalFare || 0), 0);

  return sendSuccess(res, {
    message: "Today's earnings fetched",
    data: { 
      earnings: totalEarnings,
      ridesCount: rides.length
    },
  });
});

module.exports = {
  estimateRide,
  getAllEstimates,
  getNearbyDrivers,
  createRide,
  getRide,
  myRides,
  driverRides,
  acceptRide,
  rejectRide,
  driverArriving,
  driverArrived,
  verifyOtp,
  startRide,
  completeRide,
  cancelRide,
  triggerSos,
  getTodayEarnings,
};
