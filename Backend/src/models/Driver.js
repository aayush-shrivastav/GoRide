const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { GENDER, VEHICLE_TYPES } = require("../constants/enums");

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length === 2 &&
          arr[0] >= -180 &&
          arr[0] <= 180 &&
          arr[1] >= -90 &&
          arr[1] <= 90,
        message: "Invalid GeoJSON coordinates",
      },
    },
  },
  { _id: false }
);

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true, match: /^[0-9]{10}$/ },
    password: { type: String, required: true, minlength: 8, select: false },
    gender: { type: String, enum: Object.values(GENDER), default: GENDER.PREFER_NOT_TO_SAY },
    profileImage: { type: String, default: null },
    role: { type: String, enum: ["driver"], default: "driver" },

    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
    vehicleModel: { type: String, required: true, trim: true },
    vehicleNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    vehicleColor: { type: String, trim: true },
    licenseNumber: { type: String, required: true, unique: true, trim: true },

    rating: { type: Number, default: 5, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },

    isOnline: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: false }, // false while on an active ride
    isVerified: { type: Boolean, default: false }, // admin/document verification, extensible later

    currentLocation: { type: pointSchema, default: () => ({}) },
    lastLocationUpdate: { type: Date, default: null },

    refreshTokenHash: { type: String, select: false, default: null },
    resetOtp: { type: String, select: false, default: null },
    resetOtpExpires: { type: Date, select: false, default: null },
  },
  { timestamps: true }
);

driverSchema.index({ currentLocation: "2dsphere" });
driverSchema.index({ isOnline: 1, isAvailable: 1 });


driverSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

driverSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

driverSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokenHash;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Driver", driverSchema);
