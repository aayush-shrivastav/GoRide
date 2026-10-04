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

const SEED_PASSWORD = "DevPassword123"; // development-only, min 8 chars with upper, lower, number

const seedUsers = [
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
];

const seedDrivers = [
  // --- Delhi Region Drivers (all vehicle types) ---
  {
    name: "Rajesh Kumar (Car)",
    email: "driver.car.delhi@example.com",
    phone: "9000000003",
    password: SEED_PASSWORD,
    gender: "male",
    vehicleType: "car",
    vehicleModel: "Maruti Suzuki Dzire",
    vehicleNumber: "DL01AB1234",
    vehicleColor: "White",
    licenseNumber: "DL-DEL-0001",
    isOnline: true,
    isAvailable: true,
    isVerified: true,
    currentLocation: { type: "Point", coordinates: [77.2195, 28.6328] }, // Connaught Place
    lastLocationUpdate: new Date(),
  },
  {
    name: "Amit Sharma (Bike)",
    email: "driver.bike.delhi@example.com",
    phone: "9000000004",
    password: SEED_PASSWORD,
    gender: "male",
    vehicleType: "bike",
    vehicleModel: "Hero Splendor Plus",
    vehicleNumber: "DL02CD5678",
    vehicleColor: "Black",
    licenseNumber: "DL-DEL-0002",
    isOnline: true,
    isAvailable: true,
    isVerified: true,
    currentLocation: { type: "Point", coordinates: [77.209, 28.6139] }, // Central Delhi
    lastLocationUpdate: new Date(),
  },
  {
    name: "Suresh Yadav (Auto)",
    email: "driver.auto.delhi@example.com",
    phone: "9000000005",
    password: SEED_PASSWORD,
    gender: "male",
    vehicleType: "auto",
    vehicleModel: "Bajaj Compact 4S",
    vehicleNumber: "DL03EF9012",
    vehicleColor: "Yellow-Green",
    licenseNumber: "DL-DEL-0003",
    isOnline: true,
    isAvailable: true,
    isVerified: true,
    currentLocation: { type: "Point", coordinates: [77.2295, 28.6129] }, // India Gate
    lastLocationUpdate: new Date(),
  },
  {
    name: "Vikram Singh (SUV)",
    email: "driver.suv.delhi@example.com",
    phone: "9000000006",
    password: SEED_PASSWORD,
    gender: "male",
    vehicleType: "suv",
    vehicleModel: "Toyota Innova Crysta",
    vehicleNumber: "DL04GH3456",
    vehicleColor: "Silver",
    licenseNumber: "DL-DEL-0004",
    isOnline: true,
    isAvailable: true,
    isVerified: true,
    currentLocation: { type: "Point", coordinates: [77.1906, 28.6517] }, // Karol Bagh
    lastLocationUpdate: new Date(),
  },
  {
    name: "Pooja Verma (Female Driver)",
    email: "driver.female.delhi@example.com",
    phone: "9000000007",
    password: SEED_PASSWORD,
    gender: "female",
    vehicleType: "car",
    vehicleModel: "Hyundai Grand i10",
    vehicleNumber: "DL05IJ7890",
    vehicleColor: "Red",
    licenseNumber: "DL-DEL-0005",
    isOnline: true,
    isAvailable: true,
    isVerified: true,
    currentLocation: { type: "Point", coordinates: [77.2066, 28.5672] }, // South Delhi
    lastLocationUpdate: new Date(),
  },

  // --- Punjab Region Drivers (Fatehgarh Sahib / Chandigarh / Mohali) ---
  {
    name: "Dev Driver (Male - Car)",
    email: "driver.male.dev@example.com",
    phone: "9000000008",
    password: SEED_PASSWORD,
    gender: "male",
    vehicleType: "car",
    vehicleModel: "Maruti Suzuki Dzire",
    vehicleNumber: "PB10AB1234",
    vehicleColor: "White",
    licenseNumber: "DL-DEV-0001",
    isOnline: true,
    isAvailable: true,
    isVerified: true,
    currentLocation: { type: "Point", coordinates: [76.3894, 30.6469] }, // Fatehgarh Sahib
    lastLocationUpdate: new Date(),
  },
  {
    name: "Dev Driver (Female - Car)",
    email: "driver.female.dev@example.com",
    phone: "9000000009",
    password: SEED_PASSWORD,
    gender: "female",
    vehicleType: "car",
    vehicleModel: "Hyundai i20",
    vehicleNumber: "PB10CD5678",
    vehicleColor: "Silver",
    licenseNumber: "DL-DEV-0002",
    isOnline: true,
    isAvailable: true,
    isVerified: true,
    currentLocation: { type: "Point", coordinates: [76.395, 30.65] }, // Sirhind
    lastLocationUpdate: new Date(),
  },
  {
    name: "Gurpreet Singh (Bike)",
    email: "driver.bike.pb@example.com",
    phone: "9000000010",
    password: SEED_PASSWORD,
    gender: "male",
    vehicleType: "bike",
    vehicleModel: "Honda Activa 6G",
    vehicleNumber: "PB10EF9012",
    vehicleColor: "Grey",
    licenseNumber: "DL-DEV-0003",
    isOnline: true,
    isAvailable: true,
    isVerified: true,
    currentLocation: { type: "Point", coordinates: [76.7794, 30.7333] }, // Chandigarh
    lastLocationUpdate: new Date(),
  },
  {
    name: "Harinder Singh (Auto)",
    email: "driver.auto.pb@example.com",
    phone: "9000000011",
    password: SEED_PASSWORD,
    gender: "male",
    vehicleType: "auto",
    vehicleModel: "Bajaj Maxima Z",
    vehicleNumber: "PB10GH3456",
    vehicleColor: "Green",
    licenseNumber: "DL-DEV-0004",
    isOnline: true,
    isAvailable: true,
    isVerified: true,
    currentLocation: { type: "Point", coordinates: [76.7179, 30.7046] }, // Mohali
    lastLocationUpdate: new Date(),
  },
];

async function seed() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info("Connected to MongoDB for seeding");

  // Collect seed emails, phones, vehicle numbers, license numbers to prevent unique collision
  const userEmails = seedUsers.map((u) => u.email);
  const userPhones = seedUsers.map((u) => u.phone);

  const driverEmails = seedDrivers.map((d) => d.email);
  const driverPhones = seedDrivers.map((d) => d.phone);
  const driverVehicles = seedDrivers.map((d) => d.vehicleNumber);
  const driverLicenses = seedDrivers.map((d) => d.licenseNumber);

  await Promise.all([
    User.deleteMany({
      $or: [{ email: { $in: userEmails } }, { phone: { $in: userPhones } }],
    }),
    Driver.deleteMany({
      $or: [
        { email: { $in: driverEmails } },
        { phone: { $in: driverPhones } },
        { vehicleNumber: { $in: driverVehicles } },
        { licenseNumber: { $in: driverLicenses } },
      ],
    }),
  ]);

  const createdUsers = await User.create(seedUsers);
  const createdDrivers = await Driver.create(seedDrivers);

  console.log("\n=======================================================");
  console.log("             GO RIDE - DATABASE SEED COMPLETE           ");
  console.log("=======================================================");
  console.log(`Password for all seeded accounts: ${SEED_PASSWORD}\n`);

  console.log("PASSENGER ACCOUNTS:");
  createdUsers.forEach((u) => {
    console.log(`  - [${u.gender.toUpperCase()}] ${u.name}`);
    console.log(`    Email: ${u.email} | Phone: ${u.phone}`);
  });

  console.log("\nDRIVER ACCOUNTS (Online & Available):");
  createdDrivers.forEach((d) => {
    console.log(`  - [${d.vehicleType.toUpperCase()}] ${d.name} (${d.vehicleModel})`);
    console.log(`    Email: ${d.email} | Phone: ${d.phone} | Plate: ${d.vehicleNumber}`);
    console.log(`    Location: [Lng: ${d.currentLocation.coordinates[0]}, Lat: ${d.currentLocation.coordinates[1]}]`);
  });
  console.log("=======================================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  logger.error({ err }, "Seeding failed");
  process.exit(1);
});
