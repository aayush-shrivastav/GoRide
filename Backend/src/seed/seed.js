/**
 * Development-only seed data. Never run against a production database.
 * Usage: npm run seed
 */
require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/User");
const Driver = require("../models/Driver");
const logger = require("../utils/logger");

const SEED_PASSWORD = "DevPassword123"; // development-only, never used in production

async function seed() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info("Connected for seeding");

  await Promise.all([
    User.deleteMany({ email: { $in: ["passenger.dev@example.com", "passenger.female.dev@example.com"] } }),
    Driver.deleteMany({ email: { $in: ["driver.male.dev@example.com", "driver.female.dev@example.com"] } }),
  ]);

  await User.create([
    {
      name: "Dev Passenger (Male)",
      email: "passenger.dev@example.com",
      phone: "9000000001",
      password: SEED_PASSWORD,
      gender: "male",
      isVerified: true,
    },
    {
      name: "Dev Passenger (Female)",
      email: "passenger.female.dev@example.com",
      phone: "9000000002",
      password: SEED_PASSWORD,
      gender: "female",
      isVerified: true,
    },
  ]);

  await Driver.create([
    {
      name: "Dev Driver (Male)",
      email: "driver.male.dev@example.com",
      phone: "9000000003",
      password: SEED_PASSWORD,
      gender: "male",
      vehicleType: "car",
      vehicleModel: "Maruti Suzuki Dzire",
      vehicleNumber: "PB10AB1234",
      vehicleColor: "White",
      licenseNumber: "DL-DEV-0001",
      isOnline: true,
      isAvailable: true,
      currentLocation: { type: "Point", coordinates: [76.3894, 30.6469] }, // Fatehgarh Sahib, PB (dev sample)
      lastLocationUpdate: new Date(),
    },
    {
      name: "Dev Driver (Female)",
      email: "driver.female.dev@example.com",
      phone: "9000000004",
      password: SEED_PASSWORD,
      gender: "female",
      vehicleType: "car",
      vehicleModel: "Hyundai i20",
      vehicleNumber: "PB10CD5678",
      vehicleColor: "Silver",
      licenseNumber: "DL-DEV-0002",
      isOnline: true,
      isAvailable: true,
      currentLocation: { type: "Point", coordinates: [76.395, 30.65] },
      lastLocationUpdate: new Date(),
    },
  ]);

  logger.info(`Seed complete. All seed accounts use password: ${SEED_PASSWORD}`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  logger.error({ err }, "Seeding failed");
  process.exit(1);
});
