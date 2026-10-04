const mongoose = require("mongoose");

const Ride = require("../models/Ride");
const Driver = require("../models/Driver");
const Payment = require("../models/Payment");
const Rating = require("../models/Rating");

const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { sendSuccess } = require("../utils/apiResponse");

const mapsService = require("../services/mapsService");
const fareService = require("../services/fareService");
const otpService = require("../services/otpService");
const notificationService = require("../services/notificationService");
const rideMatchingService = require("../services/rideMatchingService");

const {
  RIDE_STATUS,
  CANCELLABLE_STATUSES,
  NOTIFICATION_TYPE,
  VEHICLE_TYPES,
  PAYMENT_STATUS,
} = require("../constants/enums");

const logger = require("../utils/logger");
const env = require("../config/env");
const fareConfig = require("../config/fareConfig");

/* =========================================================
   HELPERS
========================================================= */

function normalizeStops(stops = []) {
  return stops.map((stop, index) => ({
    location: {
      type: "Point",
      coordinates: [stop.longitude, stop.latitude],
    },
    address: stop.address,
    order: index,
  }));
}

function getIdString(value) {
  if (!value) return "";

  if (value._id) {
    return value._id.toString();
  }

  return value.toString();
}

function calculateFareSplit(grossFare) {
  const platformCommission =
    Math.round(
      grossFare *
      (fareConfig.platformFeePercent / 100) *
      100
    ) / 100;

  const driverEarning =
    Math.round(
      (grossFare - platformCommission) * 100
    ) / 100;

  return {
    platformCommission,
    driverEarning,
  };
}

function addStatusFilter(filter, status) {
  const statuses = String(status || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (statuses.length === 1) {
    filter.rideStatus = statuses[0];
  }

  if (statuses.length > 1) {
    filter.rideStatus = {
      $in: statuses,
    };
  }
}

/* =========================================================
   ESTIMATE RIDE
========================================================= */

const estimateRide = catchAsync(async (req, res) => {
  const {
    pickup,
    drop,
    stops = [],
    vehicleType,
  } = req.body;

  const {
    distanceKm,
    durationMin,
  } =
    await mapsService.getDistanceAndDurationForRoute([
      pickup,
      ...stops,
      drop,
    ]);

  const fare = fareService.estimateFare({
    vehicleType,
    distanceKm,
    durationMin,
  });

  return sendSuccess(res, {
    message: "Fare estimated",
    data: {
      distanceKm,
      durationMin,
      vehicleType,
      stops,
      fare,
    },
  });
});

/* =========================================================
   NEARBY DRIVERS
========================================================= */

const getNearbyDrivers = catchAsync(async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  const vehicleType = req.query.vehicleType || null;

  const radiusKm =
    parseFloat(req.query.radiusKm) || 5;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      success: false,
      message:
        "lat and lng query params are required",
    });
  }

  const query = {
    isOnline: true,
    isAvailable: true,
    currentLocation: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        $maxDistance: radiusKm * 1000,
      },
    },
  };

  if (vehicleType) {
    query.vehicleType = vehicleType;
  }

  const drivers = await Driver.find(query)
    .select(
      "name vehicleType vehicleModel vehicleNumber vehicleColor rating currentLocation gender"
    )
    .limit(20);

  const pickupPoint = {
    latitude: lat,
    longitude: lng,
  };

  const driversWithMeta = drivers.map((driver) => {
    const driverLat =
      driver.currentLocation?.coordinates?.[1];

    const driverLng =
      driver.currentLocation?.coordinates?.[0];

    const hasLocation =
      Number.isFinite(driverLat) &&
      Number.isFinite(driverLng);

    const distKm = hasLocation
      ? mapsService.haversineKm(pickupPoint, {
        latitude: driverLat,
        longitude: driverLng,
      })
      : null;

    const etaMin =
      distKm !== null
        ? Math.max(
          1,
          Math.round((distKm / 25) * 60)
        )
        : null;

    return {
      _id: driver._id,
      name: driver.name,
      vehicleType: driver.vehicleType,
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      rating: driver.rating,
      gender: driver.gender,

      latitude: hasLocation
        ? driverLat
        : lat,

      longitude: hasLocation
        ? driverLng
        : lng,

      distanceKm:
        distKm !== null
          ? Math.round(distKm * 10) / 10
          : null,

      etaMin,
    };
  });

  return sendSuccess(res, {
    message: "Nearby drivers fetched",
    data: {
      drivers: driversWithMeta,
    },
  });
});

/* =========================================================
   ALL VEHICLE ESTIMATES
========================================================= */

const getAllEstimates = catchAsync(async (req, res) => {
  const {
    pickup,
    drop,
    stops = [],
  } = req.body;

  const {
    distanceKm,
    durationMin,
  } =
    await mapsService.getDistanceAndDurationForRoute([
      pickup,
      ...stops,
      drop,
    ]);

  const estimates = {};

  VEHICLE_TYPES.forEach((vehicleType) => {
    try {
      estimates[vehicleType] =
        fareService.estimateFare({
          vehicleType,
          distanceKm,
          durationMin,
        });
    } catch (error) {
      logger.warn(
        {
          error,
          vehicleType,
        },
        "Skipping unsupported vehicle type"
      );
    }
  });

  return sendSuccess(res, {
    message: "All estimates fetched",
    data: {
      distanceKm,
      durationMin,
      estimates,
    },
  });
});

/* =========================================================
   CREATE RIDE
========================================================= */

const createRide = catchAsync(
  async (req, res, next) => {
    // Ride request should always originate from passenger.
    if (req.userRole !== "passenger") {
      return next(
        new AppError(
          "Only passengers can create ride requests",
          403
        )
      );
    }

    const {
      pickup,
      drop,
      stops = [],
      vehicleType,
      paymentMethod,
      preferFemaleDriver,
    } = req.body;

    const activeRide = await Ride.findOne({
      passenger: req.user._id,
      rideStatus: {
        $in: [
          RIDE_STATUS.REQUESTED,
          RIDE_STATUS.SEARCHING_DRIVER,
          RIDE_STATUS.DRIVER_ASSIGNED,
          RIDE_STATUS.DRIVER_ARRIVING,
          RIDE_STATUS.DRIVER_ARRIVED,
          RIDE_STATUS.RIDE_STARTED,
        ],
      },
    });

    if (activeRide) {
      return next(
        new AppError(
          "You already have an active ride in progress",
          409
        )
      );
    }

    const {
      distanceKm,
      durationMin,
    } =
      await mapsService.getDistanceAndDurationForRoute([
        pickup,
        ...stops,
        drop,
      ]);

    const fare = fareService.estimateFare({
      vehicleType,
      distanceKm,
      durationMin,
    });

    const now = new Date();

    const ride = await Ride.create({
      passenger: req.user._id,

      pickupLocation: {
        type: "Point",
        coordinates: [
          pickup.longitude,
          pickup.latitude,
        ],
      },

      dropLocation: {
        type: "Point",
        coordinates: [
          drop.longitude,
          drop.latitude,
        ],
      },

      stops: normalizeStops(stops),

      pickupAddress: pickup.address,
      dropAddress: drop.address,

      distanceKm,
      estimatedDurationMin: durationMin,
      estimatedFare: fare.totalFare,

      vehicleType,
      paymentMethod,

      preferFemaleDriver:
        Boolean(preferFemaleDriver),

      requestedAt: now,

      rideStatus:
        RIDE_STATUS.SEARCHING_DRIVER,
    });

    rideMatchingService
      .matchRide(ride._id.toString())
      .catch((error) => {
        logger.error(
          {
            error,
            rideId: ride._id,
          },
          "Driver matching loop failed"
        );
      });

    return sendSuccess(res, {
      statusCode: 201,
      message:
        "Ride requested, searching for a driver",
      data: {
        ride,
      },
    });
  }
);

/* =========================================================
   GET SINGLE RIDE
========================================================= */

const getRide = catchAsync(
  async (req, res, next) => {
    const ride = await Ride.findById(
      req.params.rideId
    )
      .populate(
        "driver",
        "-refreshTokenHash"
      )
      .populate(
        "passenger",
        "-refreshTokenHash"
      );

    if (!ride) {
      return next(
        new AppError("Ride not found", 404)
      );
    }

    const passengerId = getIdString(
      ride.passenger
    );

    const driverId = getIdString(
      ride.driver
    );

    const currentUserId = getIdString(
      req.user._id
    );

    const isOwner =
      (
        req.userRole === "passenger" &&
        passengerId === currentUserId
      ) ||
      (
        req.userRole === "driver" &&
        driverId === currentUserId
      );

    if (!isOwner) {
      return next(
        new AppError(
          "You are not authorized to view this ride",
          403
        )
      );
    }

    let rating = null;
    if (ride.isRated || ride.rideStatus === RIDE_STATUS.RIDE_COMPLETED) {
      const foundRating = await Rating.findOne({ ride: ride._id })
        .populate("passenger", "name profileImage")
        .lean();
      if (foundRating) {
        rating = {
          _id: foundRating._id,
          stars: foundRating.stars,
          review: foundRating.review || "",
          createdAt: foundRating.createdAt,
          passenger: foundRating.passenger ? {
            name: foundRating.passenger.name,
            profileImage: foundRating.passenger.profileImage,
          } : null,
        };
      }
    }

    const rideObj = ride.toObject();
    if (rating) {
      rideObj.rating = rating;
    }

    return sendSuccess(res, {
      message: "Ride fetched",
      data: {
        ride: rideObj,
      },
    });
  }
);

/* =========================================================
   PASSENGER RIDE HISTORY
========================================================= */

const myRides = catchAsync(
  async (req, res) => {
    const {
      status,
      page = 1,
      limit = 10,
    } = req.query;

    const pageNumber =
      Math.max(Number(page), 1);

    const limitNumber =
      Math.max(Number(limit), 1);

    const filter = {
      passenger: req.user._id,
    };

    addStatusFilter(filter, status);

    const [rides, total] =
      await Promise.all([
        Ride.find(filter)
          .populate(
            "driver",
            "name vehicleType vehicleNumber rating"
          )
          .sort({
            createdAt: -1,
          })
          .skip(
            (pageNumber - 1) *
            limitNumber
          )
          .limit(limitNumber),

        Ride.countDocuments(filter),
      ]);

    return sendSuccess(res, {
      message: "Ride history fetched",
      data: {
        rides,
        total,
        page: pageNumber,
        pages: Math.ceil(
          total / limitNumber
        ),
      },
    });
  }
);

/* =========================================================
   DRIVER RIDE HISTORY
========================================================= */

const driverRides = catchAsync(
  async (req, res) => {
    const {
      status,
      page = 1,
      limit = 10,
    } = req.query;

    const pageNumber =
      Math.max(Number(page), 1);

    const limitNumber =
      Math.max(Number(limit), 1);

    const filter = {
      driver: req.user._id,
    };

    addStatusFilter(filter, status);

    const [rides, total] =
      await Promise.all([
        Ride.find(filter)
          .populate(
            "passenger",
            "name rating"
          )
          .sort({
            createdAt: -1,
          })
          .skip(
            (pageNumber - 1) *
            limitNumber
          )
          .limit(limitNumber),

        Ride.countDocuments(filter),
      ]);

    return sendSuccess(res, {
      message: "Ride history fetched",
      data: {
        rides,
        total,
        page: pageNumber,
        pages: Math.ceil(
          total / limitNumber
        ),
      },
    });
  }
);

/* =========================================================
   ACCEPT RIDE
========================================================= */

const acceptRide = catchAsync(
  async (req, res, next) => {
    const driver = req.user;

    if (
      !driver.isOnline ||
      !driver.isAvailable
    ) {
      return next(
        new AppError(
          "You must be online and available to accept rides",
          400
        )
      );
    }

    const {
      otp,
      otpHash,
      otpExpiresAt,
    } =
      await otpService.issueRideOtp();

    const invitationCutoff =
      new Date(
        Date.now() -
        (env.DRIVER_REQUEST_TIMEOUT_SECONDS +
          5) *
        1000
      );

    const ride =
      await Ride.findOneAndUpdate(
        {
          _id: req.params.rideId,

          rideStatus:
            RIDE_STATUS.SEARCHING_DRIVER,

          driver: null,

          requestedDrivers: {
            $elemMatch: {
              driver: driver._id,
              status: "PENDING",
              requestedAt: {
                $gte: invitationCutoff,
              },
            },
          },
        },

        {
          $set: {
            driver: driver._id,

            rideStatus:
              RIDE_STATUS.DRIVER_ASSIGNED,

            acceptedAt: new Date(),

            otpHash,
            otpExpiresAt,
            otpAttempts: 0,

            "requestedDrivers.$.status":
              "ACCEPTED",
          },

          $unset: {
            otpCode: 1,
          },
        },

        {
          new: true,
        }
      );

    if (!ride) {
      const current =
        await Ride.findById(
          req.params.rideId
        ).select(
          "+requestedDrivers"
        );

      if (!current) {
        return next(
          new AppError(
            "Ride not found",
            404
          )
        );
      }

      if (
        current.rideStatus !==
        RIDE_STATUS.SEARCHING_DRIVER ||
        current.driver
      ) {
        return next(
          new AppError(
            "This ride has already been assigned to another driver",
            409
          )
        );
      }

      const invite =
        current.requestedDrivers.find(
          (item) =>
            getIdString(item.driver) ===
            getIdString(driver._id)
        );

      if (
        !invite ||
        invite.status !== "PENDING"
      ) {
        return next(
          new AppError(
            "This ride request is not assigned to you",
            403
          )
        );
      }

      return next(
        new AppError(
          "This ride invitation has expired",
          409
        )
      );
    }

    await ride.populate(
      "passenger",
      "name phone gender rating"
    );

    await ride.populate(
      "driver",
      "-refreshTokenHash"
    );

    driver.isAvailable = false;

    await driver.save({
      validateBeforeSave: false,
    });

    /*
      IMPORTANT:
      After passenger population, ride.passenger is
      an object. Always send the actual ID to notification service.
    */
    const passengerId =
      getIdString(ride.passenger);

    await notificationService.notify({
      recipientId: passengerId,
      recipientRole: "passenger",
      type:
        NOTIFICATION_TYPE.DRIVER_ASSIGNED,

      title: "Driver assigned",

      message:
        `${driver.name} is on the way. ` +
        `Share OTP ${otp} with your driver on arrival.`,

      ride: ride._id,
    });

    const io =
      require("../sockets").getIO();

    io.to(
      `passenger:${passengerId}`
    ).emit("driver_assigned", {
      rideId: ride._id,
      driver: driver.toSafeJSON(),
      otp,
    });

    // Remove request card from other drivers.
    io.emit("ride_taken", {
      rideId: ride._id,
    });

    return sendSuccess(res, {
      message: "Ride accepted",
      data: {
        ride,
      },
    });
  }
);

/* =========================================================
   REJECT RIDE
========================================================= */

const rejectRide = catchAsync(
  async (req, res, next) => {
    const ride =
      await Ride.findOneAndUpdate(
        {
          _id: req.params.rideId,

          rideStatus:
            RIDE_STATUS.SEARCHING_DRIVER,

          requestedDrivers: {
            $elemMatch: {
              driver: req.user._id,
              status: "PENDING",
            },
          },
        },

        {
          $addToSet: {
            rejectedDrivers:
              req.user._id,
          },

          $set: {
            "requestedDrivers.$.status":
              "REJECTED",
          },
        },

        {
          new: true,
        }
      );

    if (!ride) {
      const current =
        await Ride.findById(
          req.params.rideId
        ).select(
          "+requestedDrivers"
        );

      if (!current) {
        return next(
          new AppError(
            "Ride not found",
            404
          )
        );
      }

      if (
        current.rideStatus !==
        RIDE_STATUS.SEARCHING_DRIVER
      ) {
        return next(
          new AppError(
            "Ride is no longer available to reject",
            409
          )
        );
      }

      return next(
        new AppError(
          "This ride request is not assigned to you",
          403
        )
      );
    }

    return sendSuccess(res, {
      message: "Ride rejected",
    });
  }
);

/* =========================================================
   DRIVER ARRIVING
========================================================= */

const driverArriving = catchAsync(
  async (req, res, next) => {
    const ride =
      await Ride.findOneAndUpdate(
        {
          _id: req.params.rideId,

          driver: req.user._id,

          rideStatus:
            RIDE_STATUS.DRIVER_ASSIGNED,
        },

        {
          rideStatus:
            RIDE_STATUS.DRIVER_ARRIVING,
        },

        {
          new: true,
        }
      );

    if (!ride) {
      return next(
        new AppError(
          "Ride cannot be updated from its current state",
          409
        )
      );
    }

    const passengerId =
      getIdString(ride.passenger);

    const io =
      require("../sockets").getIO();

    io.to(
      `passenger:${passengerId}`
    ).emit("driver_arriving", {
      rideId: ride._id,
    });

    return sendSuccess(res, {
      message: "Marked as arriving",
      data: {
        ride,
      },
    });
  }
);

/* =========================================================
   DRIVER ARRIVED
========================================================= */

const driverArrived = catchAsync(
  async (req, res, next) => {
    const ride =
      await Ride.findOneAndUpdate(
        {
          _id: req.params.rideId,

          driver: req.user._id,

          rideStatus: {
            $in: [
              RIDE_STATUS.DRIVER_ASSIGNED,
              RIDE_STATUS.DRIVER_ARRIVING,
            ],
          },
        },

        {
          rideStatus:
            RIDE_STATUS.DRIVER_ARRIVED,

          arrivedAt: new Date(),
        },

        {
          new: true,
        }
      );

    if (!ride) {
      return next(
        new AppError(
          "Ride cannot be updated from its current state",
          409
        )
      );
    }

    const passengerId =
      getIdString(ride.passenger);

    await notificationService.notify({
      recipientId: passengerId,
      recipientRole: "passenger",

      type:
        NOTIFICATION_TYPE.DRIVER_ARRIVED,

      title: "Driver has arrived",

      message:
        "Your driver is waiting outside. Share the OTP to start your ride.",

      ride: ride._id,
    });

    const io =
      require("../sockets").getIO();

    io.to(
      `passenger:${passengerId}`
    ).emit("driver_arrived", {
      rideId: ride._id,
    });

    return sendSuccess(res, {
      message: "Marked as arrived",
      data: {
        ride,
      },
    });
  }
);

/* =========================================================
   VERIFY OTP
========================================================= */

const verifyOtp = catchAsync(
  async (req, res, next) => {
    const ride =
      await Ride.findOne({
        _id: req.params.rideId,
        driver: req.user._id,
      }).select(
        "+otpHash +otpExpiresAt +otpAttempts"
      );

    if (!ride) {
      return next(
        new AppError(
          "Ride not found",
          404
        )
      );
    }

    if (
      [
        RIDE_STATUS.DRIVER_ASSIGNED,
        RIDE_STATUS.DRIVER_ARRIVING,
      ].includes(ride.rideStatus)
    ) {
      ride.rideStatus =
        RIDE_STATUS.DRIVER_ARRIVED;

      ride.arrivedAt = new Date();
    } else if (
      ride.rideStatus !==
      RIDE_STATUS.DRIVER_ARRIVED
    ) {
      return next(
        new AppError(
          "OTP cannot be verified for this ride in its current state",
          400
        )
      );
    }

    try {
      await otpService.verifyRideOtp(
        ride,
        req.body.otp
      );
    } catch (error) {
      ride.otpAttempts =
        (ride.otpAttempts || 0) + 1;

      await ride.save({
        validateBeforeSave: false,
      });

      return next(error);
    }

    ride.otpVerified = true;

    await ride.save({
      validateBeforeSave: false,
    });

    return sendSuccess(res, {
      message:
        "OTP verified, you may start the ride",
    });
  }
);

/* =========================================================
   START RIDE
========================================================= */

const startRide = catchAsync(
  async (req, res, next) => {
    const ride =
      await Ride.findOne({
        _id: req.params.rideId,
        driver: req.user._id,
      });

    if (!ride) {
      return next(
        new AppError(
          "Ride not found",
          404
        )
      );
    }

    if (
      ![
        RIDE_STATUS.DRIVER_ASSIGNED,
        RIDE_STATUS.DRIVER_ARRIVING,
        RIDE_STATUS.DRIVER_ARRIVED,
      ].includes(ride.rideStatus)
    ) {
      return next(
        new AppError(
          "Ride cannot be started from its current state",
          400
        )
      );
    }

    if (!ride.otpVerified) {
      return next(
        new AppError(
          "OTP must be verified before starting the ride",
          400
        )
      );
    }

    ride.rideStatus =
      RIDE_STATUS.RIDE_STARTED;

    ride.startedAt = new Date();

    await ride.save();

    const passengerId =
      getIdString(ride.passenger);

    await notificationService.notify({
      recipientId: passengerId,
      recipientRole: "passenger",

      type:
        NOTIFICATION_TYPE.RIDE_STARTED,

      title: "Ride started",

      message: "Enjoy your ride!",

      ride: ride._id,
    });

    const io =
      require("../sockets").getIO();

    io.to(
      `passenger:${passengerId}`
    ).emit("ride_started", {
      rideId: ride._id,
    });

    return sendSuccess(res, {
      message: "Ride started",
      data: {
        ride,
      },
    });
  }
);

/* =========================================================
   COMPLETE RIDE
========================================================= */

const completeRide = catchAsync(
  async (req, res, next) => {
    const existingRide =
      await Ride.findOne({
        _id: req.params.rideId,
        driver: req.user._id,
      });

    if (!existingRide) {
      return next(
        new AppError(
          "Ride not found",
          404
        )
      );
    }

    if (
      existingRide.rideStatus !==
      RIDE_STATUS.RIDE_STARTED
    ) {
      return next(
        new AppError(
          "Ride cannot be completed from its current state",
          400
        )
      );
    }

    let session;
    let responseRide;

    try {
      session =
        await mongoose.startSession();

      await session.withTransaction(
        async () => {
          const ride =
            await Ride.findOne({
              _id: req.params.rideId,
              driver: req.user._id,
            }).session(session);

          if (!ride) {
            throw new AppError(
              "Ride not found",
              404
            );
          }

          if (
            ride.rideStatus !==
            RIDE_STATUS.RIDE_STARTED
          ) {
            throw new AppError(
              "Ride cannot be completed from its current state",
              400
            );
          }

          const selectedPaymentMethod =
            req.body?.paymentMethod ||
            ride.paymentMethod ||
            "cash";

          /*
           * CASH:
           * Driver confirms cash collection and ride can complete.
           *
           * ONLINE:
           * Ride MUST already have SUCCESS payment status.
           */
          if (
            selectedPaymentMethod ===
            "online" &&
            ride.paymentStatus !==
            PAYMENT_STATUS.SUCCESS
          ) {
            throw new AppError(
              "Online payment must be completed before finishing the ride",
              400
            );
          }

          if (
            ride.paymentStatus !==
            PAYMENT_STATUS.SUCCESS
          ) {
            ride.paymentMethod =
              selectedPaymentMethod;

            if (
              selectedPaymentMethod ===
              "cash"
            ) {
              ride.paymentStatus =
                PAYMENT_STATUS.SUCCESS;
            }
          }

          ride.rideStatus =
            RIDE_STATUS.RIDE_COMPLETED;

          ride.completedAt = new Date();

          ride.finalFare =
            ride.estimatedFare;

          const {
            platformCommission,
            driverEarning,
          } =
            calculateFareSplit(
              ride.finalFare
            );

          ride.platformCommission =
            platformCommission;

          ride.driverEarning =
            driverEarning;

          await ride.save({
            session,
          });

          /*
           * Create cash payment record only once.
           */
          if (
            ride.paymentMethod ===
            "cash" &&
            ride.paymentStatus ===
            PAYMENT_STATUS.SUCCESS
          ) {
            const existingPayment =
              await Payment.findOne({
                ride: ride._id,
                method: "cash",
              }).session(session);

            if (!existingPayment) {
              await Payment.create(
                [
                  {
                    ride: ride._id,
                    passenger:
                      ride.passenger,
                    driver:
                      ride.driver,
                    amount:
                      ride.finalFare,
                    currency:
                      fareConfig.currency,
                    method: "cash",
                    status:
                      PAYMENT_STATUS.SUCCESS,
                    transactionId:
                      `cash_${ride._id}`,
                    gateway: "cash",
                  },
                ],
                {
                  session,
                }
              );
            }
          }

          const driver =
            await Driver.findById(
              req.user._id
            ).session(session);

          if (!driver) {
            throw new AppError(
              "Driver not found",
              404
            );
          }

          driver.isAvailable =
            driver.isOnline;

          driver.totalRides += 1;

          if (
            ride.paymentMethod ===
            "cash" &&
            ride.paymentStatus ===
            PAYMENT_STATUS.SUCCESS
          ) {
            driver.totalEarnings +=
              ride.driverEarning;
          }

          await driver.save({
            validateBeforeSave: false,
            session,
          });

          responseRide = ride;
        }
      );
    } catch (transactionError) {
      /*
       * Do not use standalone fallback for
       * operational/business errors.
       */
      if (
        transactionError?.isOperational
      ) {
        throw transactionError;
      }

      /*
       * Fallback for MongoDB instances
       * without replica-set transactions.
       */
      const ride =
        await Ride.findOne({
          _id: req.params.rideId,
          driver: req.user._id,
        });

      if (!ride) {
        return next(
          new AppError(
            "Ride not found",
            404
          )
        );
      }

      if (
        ride.rideStatus !==
        RIDE_STATUS.RIDE_STARTED
      ) {
        return next(
          new AppError(
            "Ride cannot be completed from its current state",
            400
          )
        );
      }

      const selectedPaymentMethod =
        req.body?.paymentMethod ||
        ride.paymentMethod ||
        "cash";

      /*
       * IMPORTANT:
       * Do not allow unpaid online ride
       * to be completed.
       */
      if (
        selectedPaymentMethod ===
        "online" &&
        ride.paymentStatus !==
        PAYMENT_STATUS.SUCCESS
      ) {
        return next(
          new AppError(
            "Online payment must be completed before finishing the ride",
            400
          )
        );
      }

      if (
        ride.paymentStatus !==
        PAYMENT_STATUS.SUCCESS
      ) {
        ride.paymentMethod =
          selectedPaymentMethod;

        if (
          selectedPaymentMethod ===
          "cash"
        ) {
          ride.paymentStatus =
            PAYMENT_STATUS.SUCCESS;
        }
      }

      ride.rideStatus =
        RIDE_STATUS.RIDE_COMPLETED;

      ride.completedAt = new Date();

      ride.finalFare =
        ride.estimatedFare;

      const {
        platformCommission,
        driverEarning,
      } =
        calculateFareSplit(
          ride.finalFare
        );

      ride.platformCommission =
        platformCommission;

      ride.driverEarning =
        driverEarning;

      await ride.save();

      if (
        ride.paymentMethod ===
        "cash" &&
        ride.paymentStatus ===
        PAYMENT_STATUS.SUCCESS
      ) {
        const existingPayment =
          await Payment.findOne({
            ride: ride._id,
            method: "cash",
          });

        if (!existingPayment) {
          await Payment.create({
            ride: ride._id,
            passenger:
              ride.passenger,
            driver:
              ride.driver,
            amount:
              ride.finalFare,
            currency:
              fareConfig.currency,
            method: "cash",
            status:
              PAYMENT_STATUS.SUCCESS,
            transactionId:
              `cash_${ride._id}`,
            gateway: "cash",
          });
        }
      }

      const driver =
        await Driver.findById(
          req.user._id
        );

      if (driver) {
        driver.isAvailable =
          driver.isOnline;

        driver.totalRides += 1;

        if (
          ride.paymentMethod ===
          "cash" &&
          ride.paymentStatus ===
          PAYMENT_STATUS.SUCCESS
        ) {
          driver.totalEarnings +=
            ride.driverEarning;
        }

        await driver.save({
          validateBeforeSave: false,
        });
      }

      responseRide = ride;
    } finally {
      if (session) {
        await session.endSession();
      }
    }

    const passengerId =
      getIdString(
        responseRide.passenger
      );

    await notificationService.notify({
      recipientId: passengerId,
      recipientRole: "passenger",

      type:
        NOTIFICATION_TYPE.RIDE_COMPLETED,

      title: "Ride completed",

      message:
        `Trip completed. Fare: ${responseRide.finalFare}`,

      ride: responseRide._id,
    });

    const io =
      require("../sockets").getIO();

    io.to(
      `passenger:${passengerId}`
    ).emit("ride_completed", {
      rideId: responseRide._id,
      finalFare:
        responseRide.finalFare,
    });

    return sendSuccess(res, {
      message: "Ride completed",
      data: {
        ride: responseRide,
      },
    });
  }
);

/* =========================================================
   CANCEL RIDE
========================================================= */

const cancelRide = catchAsync(
  async (req, res, next) => {
    const { reason } = req.body;

    const isPassenger =
      req.userRole === "passenger";

    const filter = {
      _id: req.params.rideId,

      $or: [
        {
          passenger: req.user._id,
        },
        {
          driver: req.user._id,
        },
      ],
    };

    const ride =
      await Ride.findOne(filter).select(
        "+requestedDrivers"
      );

    if (!ride) {
      return sendSuccess(res, {
        message:
          "Ride already cancelled or non-existent",
        data: {
          ride: null,
        },
      });
    }

    if (
      !CANCELLABLE_STATUSES.includes(
        ride.rideStatus
      )
    ) {
      if (
        ride.rideStatus ===
        RIDE_STATUS.NO_DRIVER_FOUND
      ) {
        return sendSuccess(res, {
          message:
            "Ride already ended (no driver found)",
          data: {
            ride,
          },
        });
      }

      return next(
        new AppError(
          `Ride cannot be cancelled from status ${ride.rideStatus}`,
          400
        )
      );
    }

    ride.rideStatus =
      isPassenger
        ? RIDE_STATUS.CANCELLED_BY_PASSENGER
        : RIDE_STATUS.CANCELLED_BY_DRIVER;

    ride.cancelledAt = new Date();

    ride.cancelledBy =
      req.userRole;

    ride.cancellationReason =
      reason;

    await ride.save();

    if (ride.driver) {
      const releasedDriver =
        await Driver.findById(
          ride.driver
        );

      if (releasedDriver) {
        releasedDriver.isAvailable =
          releasedDriver.isOnline;

        await releasedDriver.save({
          validateBeforeSave: false,
        });
      }
    }

    const io =
      require("../sockets").getIO();

    const rawRecipientId =
      isPassenger
        ? ride.driver
        : ride.passenger;

    const notifyRecipientId =
      getIdString(
        rawRecipientId
      );

    const notifyRole =
      isPassenger
        ? "driver"
        : "passenger";

    if (notifyRecipientId) {
      await notificationService.notify(
        {
          recipientId:
            notifyRecipientId,

          recipientRole:
            notifyRole,

          type:
            NOTIFICATION_TYPE.RIDE_CANCELLED,

          title: "Ride cancelled",

          message:
            reason ||
            "The ride has been cancelled.",

          ride: ride._id,
        }
      );

      io.to(
        `${notifyRole}:${notifyRecipientId}`
      ).emit("ride_cancelled", {
        rideId: ride._id,
        reason,
        cancelledBy:
          req.userRole,
      });
    } else if (
      isPassenger &&
      !ride.driver
    ) {
      /*
       * Passenger cancelled while driver
       * invitations are still visible.
       */
      (
        ride.requestedDrivers ||
        []
      ).forEach((requestedDriver) => {
        if (
          requestedDriver.status ===
          "PENDING"
        ) {
          const driverId =
            getIdString(
              requestedDriver.driver
            );

          if (driverId) {
            io.to(
              `driver:${driverId}`
            ).emit(
              "ride_cancelled",
              {
                rideId:
                  ride._id,

                reason,

                cancelledBy:
                  req.userRole,
              }
            );
          }
        }
      });
    }

    return sendSuccess(res, {
      message: "Ride cancelled",
      data: {
        ride,
      },
    });
  }
);

/* =========================================================
   SOS
========================================================= */

const triggerSos = catchAsync(
  async (req, res, next) => {
    const Sos =
      require("../models/Sos");

    const User =
      require("../models/User");

    const emailService =
      require("../services/emailService");

    const isPassenger =
      req.userRole === "passenger";

    const ride =
      await Ride.findOne({
        _id: req.params.rideId,

        [
          isPassenger
            ? "passenger"
            : "driver"
        ]: req.user._id,
      });

    if (!ride) {
      return next(
        new AppError(
          "Ride not found",
          404
        )
      );
    }

    if (
      ![
        RIDE_STATUS.DRIVER_ASSIGNED,
        RIDE_STATUS.DRIVER_ARRIVING,
        RIDE_STATUS.DRIVER_ARRIVED,
        RIDE_STATUS.RIDE_STARTED,
      ].includes(ride.rideStatus)
    ) {
      return next(
        new AppError(
          "SOS can only be triggered during an active ride",
          400
        )
      );
    }

    const latitude =
      Number(req.body.latitude);

    const longitude =
      Number(req.body.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return next(
        new AppError(
          "Valid latitude and longitude are required",
          400
        )
      );
    }

    const sos =
      await Sos.create({
        ride: ride._id,
        passenger: ride.passenger,
        driver: ride.driver,

        location: {
          type: "Point",

          coordinates: [
            longitude,
            latitude,
          ],
        },
      });

    const passenger =
      await User.findById(
        ride.passenger
      );

    const driver =
      await Driver.findById(
        ride.driver
      );

    const mapsUrl =
      `https://www.google.com/maps?q=${latitude},${longitude}`;

    /*
     * Emergency contact emails.
     */
    if (
      passenger?.emergencyContacts
        ?.length
    ) {
      for (
        const contact of
        passenger.emergencyContacts
      ) {
        if (!contact.email) {
          continue;
        }

        emailService
          .sendSosAlertEmail({
            to: contact.email,

            contactName:
              contact.name,

            passengerName:
              passenger.name,

            passengerPhone:
              passenger.phone,

            driverName:
              driver?.name,

            driverPhone:
              driver?.phone,

            vehicleModel:
              driver?.vehicleModel,

            vehicleNumber:
              driver?.vehicleNumber,

            pickupAddress:
              ride.pickupAddress,

            dropAddress:
              ride.dropAddress,

            latitude,
            longitude,
            mapsUrl,

            triggeredAt:
              sos.createdAt,
          })
          .catch((error) => {
            logger.error(
              {
                error,
                to: contact.email,
              },
              "Failed to send emergency SOS email"
            );
          });
      }
    }

    /*
     * Simulated Police Control Room dispatch email (sent to developer during testing).
     */
    emailService
      .sendPoliceDispatchEmail({
        rideId: ride._id,
        passengerName: passenger?.name,
        passengerPhone: passenger?.phone,
        passengerEmail: passenger?.email,
        driverName: driver?.name,
        driverPhone: driver?.phone,
        vehicleModel: driver?.vehicleModel,
        vehicleNumber: driver?.vehicleNumber,
        vehicleType: driver?.vehicleType,
        pickupAddress: ride.pickupAddress,
        dropAddress: ride.dropAddress,
        latitude,
        longitude,
        mapsUrl,
        triggeredAt: sos.createdAt,
      })
      .catch((error) => {
        logger.error(
          { error },
          "Failed to send police dispatch email"
        );
      });

    /*
     * Emergency Messaging (SMS / WhatsApp) to Parents & Simulated Police Control Room.
     */
    try {
      const emergencyMessagingService = require("../services/emergencyMessagingService");
      emergencyMessagingService
        .sendEmergencyMessagingAlerts({
          rideId: ride._id,
          passenger,
          driver,
          ride,
          latitude,
          longitude,
          mapsUrl,
          triggeredAt: sos.createdAt,
        })
        .catch((error) => {
          logger.error(
            { error },
            "Failed to send emergency messaging alerts"
          );
        });
    } catch (msgErr) {
      logger.error({ msgErr }, "Emergency messaging service error");
    }

    /*
     * Notify the other participant.
     */
    const rawRecipientId =
      isPassenger
        ? ride.driver
        : ride.passenger;

    const recipientId =
      getIdString(
        rawRecipientId
      );

    const recipientRole =
      isPassenger
        ? "driver"
        : "passenger";

    if (recipientId) {
      await notificationService.notify(
        {
          recipientId,

          recipientRole,

          type:
            NOTIFICATION_TYPE.SOS_TRIGGERED,

          title:
            "🚨 EMERGENCY SOS TRIGGERED",

          message:
            `SOS alert triggered by ${isPassenger
              ? passenger?.name ||
              "Passenger"
              : driver?.name ||
              "Driver"
            }. Location: ${latitude}, ${longitude}. Live Map: ${mapsUrl}`,

          ride: ride._id,
        }
      );
    }

    /*
     * Real-time socket notification to both participants and ride room.
     */
    try {
      const io =
        require("../sockets").getIO();

      const sosSocketPayload = {
        rideId: ride._id,
        sosId: sos._id,
        location: sos.location,
        latitude,
        longitude,
        mapsUrl,
        triggeredBy: isPassenger ? "passenger" : "driver",
        passenger: passenger
          ? {
              name: passenger.name,
              phone: passenger.phone,
            }
          : null,
        driver: driver
          ? {
              name: driver.name,
              phone: driver.phone,
              vehicleNumber: driver.vehicleNumber,
            }
          : null,
      };

      io.to(`ride:${ride._id}`).emit("sos_triggered", sosSocketPayload);
      if (ride.passenger) io.to(`passenger:${ride.passenger}`).emit("sos_triggered", sosSocketPayload);
      if (ride.driver) io.to(`driver:${ride.driver}`).emit("sos_triggered", sosSocketPayload);
    } catch (socketError) {
      logger.warn(
        {
          socketError,
        },
        "Could not emit sos_triggered socket event"
      );
    }

    logger.warn(
      {
        rideId: ride._id,
        sosId: sos._id,
        latitude,
        longitude,
        mapsUrl,
      },
      "🚨 SOS Emergency triggered"
    );

    return sendSuccess(res, {
      statusCode: 201,

      message:
        "SOS alert sent to emergency contacts, police dispatch, and ride participants.",

      data: {
        sos,
        mapsUrl,
      },
    });
  }
);

/* =========================================================
   CANCEL / RESOLVE SOS
========================================================= */

const cancelSos = catchAsync(async (req, res, next) => {
  const Sos = require("../models/Sos");
  const { SOS_STATUS } = require("../constants/enums");
  const isPassenger = req.userRole === "passenger";

  const ride = await Ride.findOne({
    _id: req.params.rideId,
    [isPassenger ? "passenger" : "driver"]: req.user._id,
  });

  if (!ride) {
    return next(new AppError("Ride not found", 404));
  }

  const activeSos = await Sos.findOneAndUpdate(
    {
      ride: ride._id,
      status: SOS_STATUS.TRIGGERED,
    },
    {
      status: SOS_STATUS.RESOLVED,
      resolvedAt: new Date(),
    },
    { new: true, sort: { createdAt: -1 } }
  );

  try {
    const io = require("../sockets").getIO();
    const payload = {
      rideId: ride._id,
      sosId: activeSos?._id,
      resolvedBy: isPassenger ? "passenger" : "driver",
      resolvedAt: new Date(),
    };
    io.to(`ride:${ride._id}`).emit("sos_resolved", payload);
    if (ride.passenger) io.to(`passenger:${ride.passenger}`).emit("sos_resolved", payload);
    if (ride.driver) io.to(`driver:${ride.driver}`).emit("sos_resolved", payload);
  } catch (socketError) {
    logger.warn({ socketError }, "Could not emit sos_resolved socket event");
  }

  logger.info({ rideId: ride._id, sosId: activeSos?._id }, "SOS Emergency marked as resolved");

  return sendSuccess(res, {
    statusCode: 200,
    message: "SOS alert resolved successfully.",
    data: {
      resolved: true,
      sos: activeSos,
    },
  });
});

/* =========================================================
   DRIVER TODAY EARNINGS
========================================================= */

const getTodayEarnings =
  catchAsync(async (req, res) => {
    const startOfDay =
      new Date();

    startOfDay.setHours(
      0,
      0,
      0,
      0
    );

    const rides =
      await Ride.find({
        driver: req.user._id,

        rideStatus:
          RIDE_STATUS.RIDE_COMPLETED,

        completedAt: {
          $gte: startOfDay,
        },
      });

    const totalEarnings =
      rides.reduce(
        (sum, ride) =>
          sum +
          (
            ride.driverEarning ||
            ride.finalFare ||
            0
          ),
        0
      );

    return sendSuccess(res, {
      message:
        "Today's earnings fetched",

      data: {
        earnings:
          totalEarnings,

        ridesCount:
          rides.length,
      },
    });
  });

/* =========================================================
   ACCEPT ANY DRIVER
========================================================= */

const acceptAnyDriver =
  catchAsync(
    async (req, res, next) => {
      const { rideId } =
        req.params;

      const ride =
        await Ride.findById(
          rideId
        );

      if (!ride) {
        return next(
          new AppError(
            "Ride not found",
            404
          )
        );
      }

      if (
        getIdString(
          ride.passenger
        ) !==
        getIdString(
          req.user._id
        )
      ) {
        return next(
          new AppError(
            "Not authorized to update this ride",
            403
          )
        );
      }

      if (
        ride.rideStatus !==
        RIDE_STATUS.SEARCHING_DRIVER &&
        ride.rideStatus !==
        RIDE_STATUS.REQUESTED
      ) {
        return next(
          new AppError(
            "Ride is not in a searching state",
            400
          )
        );
      }

      ride.preferFemaleDriver =
        false;

      ride.rejectedDrivers = [];

      ride.requestedAt =
        new Date();

      await ride.save();

      rideMatchingService
        .matchRide(ride._id)
        .catch((error) => {
          logger.error(
            {
              error,
              rideId: ride._id,
            },
            "Error restarting ride matching after female fallback"
          );
        });

      return sendSuccess(res, {
        message:
          "Searching for all available drivers",

        data: {
          ride,
        },
      });
    }
  );

/* =========================================================
   GET DRIVER PENDING REQUEST
   Fallback polling endpoint so driver receives pending ride
   invitation even if Socket.IO message was dropped or delayed.
========================================================= */

const getDriverPendingRequest = catchAsync(async (req, res, next) => {
  const driverId = req.user._id;
  const timeoutSeconds = Math.max(
    1,
    Number(env.DRIVER_REQUEST_TIMEOUT_SECONDS) || 20
  );
  const cutoff = new Date(Date.now() - (timeoutSeconds + 5) * 1000);

  const ride = await Ride.findOne({
    rideStatus: RIDE_STATUS.SEARCHING_DRIVER,
    driver: null,
    requestedDrivers: {
      $elemMatch: {
        driver: driverId,
        status: "PENDING",
        requestedAt: { $gte: cutoff },
      },
    },
  })
    .select("+requestedDrivers")
    .populate("passenger", "name phone gender rating profileImage");

  if (!ride) {
    return sendSuccess(res, {
      message: "No pending ride request",
      data: { pendingRequest: null },
    });
  }

  const invitation = ride.requestedDrivers.find(
    (item) =>
      getIdString(item.driver) === getIdString(driverId) &&
      item.status === "PENDING"
  );

  const elapsedSeconds = invitation
    ? Math.floor(
        (Date.now() - new Date(invitation.requestedAt).getTime()) / 1000
      )
    : 0;
  const expiresInSeconds = Math.max(1, timeoutSeconds - elapsedSeconds);

  const payload = {
    rideId: ride._id,
    _id: ride._id,
    pickupAddress: ride.pickupAddress,
    dropAddress: ride.dropAddress,
    pickupLocation: ride.pickupLocation,
    dropLocation: ride.dropLocation,
    stops: ride.stops || [],
    stopCount: Array.isArray(ride.stops) ? ride.stops.length : 0,
    distanceKm: ride.distanceKm,
    estimatedDurationMin: ride.estimatedDurationMin,
    estimatedFare: ride.estimatedFare,
    vehicleType: ride.vehicleType,
    paymentMethod: ride.paymentMethod,
    passenger: ride.passenger
      ? {
          _id: ride.passenger._id,
          name: ride.passenger.name,
          phone: ride.passenger.phone,
          gender: ride.passenger.gender,
          rating: ride.passenger.rating,
          profileImage: ride.passenger.profileImage,
        }
      : null,
    expiresInSeconds,
  };

  return sendSuccess(res, {
    message: "Pending ride request found",
    data: { pendingRequest: payload },
  });
});

/* =========================================================
   EXPORTS
========================================================= */

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
  cancelSos,
  getTodayEarnings,
  acceptAnyDriver,
  getDriverPendingRequest,
};