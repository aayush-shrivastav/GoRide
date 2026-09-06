const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    ride: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true, unique: true },
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true, index: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rating", ratingSchema);
