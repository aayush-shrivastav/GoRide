const mongoose = require("mongoose");
const { RIDE_STATUS, VEHICLE_TYPES, PAYMENT_METHOD, PAYMENT_STATUS } = require("../constants/enums");

const geoPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);

const rideSchema = new mongoose.Schema(
  {
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", default: null, index: true },

    pickupLocation: { type: geoPointSchema, required: true },
    dropLocation: { type: geoPointSchema, required: true },
    stops: {
      type: [
        {
          location: { type: geoPointSchema, required: true },
          address: { type: String, required: true },
          order: { type: Number, required: true },
        },
      ],
      default: [],
    },
    pickupAddress: { type: String, required: true },
    dropAddress: { type: String, required: true },

    distanceKm: { type: Number, required: true },
    estimatedDurationMin: { type: Number, required: true },

    estimatedFare: { type: Number, required: true },
    finalFare: { type: Number, default: null },
    platformCommission: { type: Number, default: 0 },
    driverEarning: { type: Number, default: 0 },

    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
    preferFemaleDriver: { type: Boolean, default: false },

    paymentMethod: { type: String, enum: Object.values(PAYMENT_METHOD), default: PAYMENT_METHOD.CASH },
    paymentStatus: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },

    rideStatus: { type: String, enum: Object.values(RIDE_STATUS), default: RIDE_STATUS.REQUESTED, index: true },

    otpHash: { type: String, select: false, default: null },
    otpExpiresAt: { type: Date, select: false, default: null },
    otpAttempts: { type: Number, default: 0, select: false },
    otpVerified: { type: Boolean, default: false },

    requestedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    cancelledBy: { type: String, enum: ["passenger", "driver", null], default: null },
    cancellationReason: { type: String, default: null },

    // Drivers who rejected or timed out — excluded from further matching rounds for this ride
    rejectedDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Driver" }],

    // Invitation ledger: every driver the matching loop has actually offered
    // this ride to. accept/reject are only ever honored for a driver with a
    // PENDING entry here — this is what stops a driver who was never
    // contacted for a ride from calling accept/reject on it directly.
    requestedDrivers: {
      type: [
        {
          driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },
          requestedAt: { type: Date, default: Date.now },
          status: { type: String, enum: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"], default: "PENDING" },
        },
      ],
      default: [],
      select: false,
    },

    isRated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rideSchema.index({ pickupLocation: "2dsphere" });
rideSchema.index({ passenger: 1, createdAt: -1 });
rideSchema.index({ driver: 1, createdAt: -1 });

module.exports = mongoose.model("Ride", rideSchema);
