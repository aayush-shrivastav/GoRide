const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { GENDER } = require("../constants/enums");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[0-9]{10}$/, "Phone number must be 10 digits"],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    gender: { type: String, enum: Object.values(GENDER), default: GENDER.PREFER_NOT_TO_SAY },
    profileImage: { type: String, default: null },
    role: { type: String, enum: ["passenger"], default: "passenger" },
    isVerified: { type: Boolean, default: false },
    emergencyContacts: [
      {
        name: { type: String, required: true },
        phone: { type: String, required: true, match: /^[0-9]{10}$/ },
        email: { type: String, default: null, trim: true, lowercase: true },
      }
    ],
    rating: { type: Number, default: 5, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    refreshTokenHash: { type: String, select: false, default: null },
    resetOtp: { type: String, select: false, default: null },
    resetOtpExpires: { type: Date, select: false, default: null },
  },
  { timestamps: true }
);



userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokenHash;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
