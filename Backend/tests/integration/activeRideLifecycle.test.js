const http = require("http");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { initSocket } = require("../../src/sockets");
const User = require("../../src/models/User");
const Driver = require("../../src/models/Driver");
const Ride = require("../../src/models/Ride");
const { RIDE_STATUS, PAYMENT_METHOD } = require("../../src/constants/enums");
const { signAccessToken } = require("../../src/utils/tokens");
const otpService = require("../../src/services/otpService");

jest.setTimeout(30000);

let app;
let otpSpy;
const FIXED_OTP = "4567";

beforeAll(async () => {
  await connect();
  app = require("../../src/app");
  const server = http.createServer(app);
  initSocket(server);

  // Deterministic OTP generation for testing verify-otp flow
  otpSpy = jest.spyOn(otpService, "issueRideOtp").mockImplementation(async () => {
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(FIXED_OTP, salt);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    return { otp: FIXED_OTP, otpHash, otpExpiresAt };
  });
});

afterAll(async () => {
  if (otpSpy) otpSpy.mockRestore();
  await closeDatabase();
});

afterEach(async () => {
  await clearDatabase();
});

async function makeDriver(overrides = {}) {
  return Driver.create({
    name: "Lifecycle Driver",
    email: `driver-${Date.now()}-${Math.random()}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    password: "Password123",
    vehicleType: "car",
    vehicleModel: "Test Sedan",
    vehicleNumber: `MH${Math.floor(100000 + Math.random() * 899999)}`,
    licenseNumber: `LIC${Math.floor(100000 + Math.random() * 899999)}`,
    isOnline: true,
    isAvailable: true,
    totalEarnings: 0,
    totalRides: 0,
    ...overrides,
  });
}

async function makePassenger(overrides = {}) {
  return User.create({
    name: "Lifecycle Passenger",
    email: `passenger-${Date.now()}-${Math.random()}@test.com`,
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    password: "Password123",
    ...overrides,
  });
}

async function createBaseRide(passenger, driver, status = RIDE_STATUS.SEARCHING_DRIVER, overrides = {}) {
  return Ride.create({
    passenger: passenger._id,
    driver: null,
    pickupLocation: { type: "Point", coordinates: [72.877, 19.076] },
    dropLocation: { type: "Point", coordinates: [72.978, 19.218] },
    pickupAddress: "Bandra West, Mumbai",
    dropAddress: "Thane West, Mumbai",
    distanceKm: 15,
    estimatedDurationMin: 30,
    estimatedFare: 300,
    finalFare: 300,
    vehicleType: "car",
    paymentMethod: PAYMENT_METHOD.CASH,
    rideStatus: status,
    requestedDrivers: driver
      ? [{ driver: driver._id, status: "PENDING", requestedAt: new Date() }]
      : [],
    ...overrides,
  });
}

describe("Phase 1B — Active Ride Lifecycle Integration Tests", () => {
  describe("1. Driver accepts a valid ride", () => {
    it("transitions ride to DRIVER_ASSIGNED, assigns driver, and generates OTP", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isOnline: true, isAvailable: true });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const ride = await createBaseRide(passenger, driver, RIDE_STATUS.SEARCHING_DRIVER);

      const res = await request(app)
        .post(`/api/rides/${ride._id}/accept`)
        .set("Authorization", `Bearer ${driverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/ride accepted/i);

      const acceptedRide = res.body.data.ride;
      expect(acceptedRide.rideStatus).toBe(RIDE_STATUS.DRIVER_ASSIGNED);
      expect(acceptedRide.driver._id.toString()).toBe(driver._id.toString());
      expect(acceptedRide.acceptedAt).toBeDefined();

      // Verify database persistence
      const dbRide = await Ride.findById(ride._id).select("+otpHash +otpExpiresAt");
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.DRIVER_ASSIGNED);
      expect(dbRide.driver.toString()).toBe(driver._id.toString());
      expect(dbRide.otpHash).toBeDefined();
      expect(dbRide.otpExpiresAt).toBeDefined();
      expect(dbRide.otpVerified).toBe(false);

      // Verify driver isAvailable became false
      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.isAvailable).toBe(false);
    });
  });

  describe("2. Prevent invalid ride acceptance", () => {
    it("rejects acceptance with 409 Conflict when ride was already cancelled", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isOnline: true, isAvailable: true });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const ride = await createBaseRide(passenger, driver, RIDE_STATUS.CANCELLED_BY_PASSENGER, {
        cancelledAt: new Date(),
        cancelledBy: "passenger",
        cancellationReason: "Found other ride",
      });

      const res = await request(app)
        .post(`/api/rides/${ride._id}/accept`)
        .set("Authorization", `Bearer ${driverToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);

      // Verify state was not altered
      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.CANCELLED_BY_PASSENGER);
      expect(dbRide.driver).toBeNull();
    });

    it("rejects acceptance with 409 Conflict when ride is already taken by another driver", async () => {
      const passenger = await makePassenger();
      const driverA = await makeDriver({ name: "Driver A", isAvailable: false });
      const driverB = await makeDriver({ name: "Driver B", isAvailable: true });
      const driverBToken = signAccessToken({ id: driverB._id.toString(), role: "driver" });

      const ride = await createBaseRide(passenger, null, RIDE_STATUS.DRIVER_ASSIGNED, {
        driver: driverA._id,
        requestedDrivers: [
          { driver: driverA._id, status: "ACCEPTED", requestedAt: new Date() },
          { driver: driverB._id, status: "PENDING", requestedAt: new Date() },
        ],
      });

      const res = await request(app)
        .post(`/api/rides/${ride._id}/accept`)
        .set("Authorization", `Bearer ${driverBToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already been assigned to another driver/i);

      // Verify original driver assignment was preserved
      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.DRIVER_ASSIGNED);
      expect(dbRide.driver.toString()).toBe(driverA._id.toString());
    });
  });

  describe("3. OTP verification", () => {
    it("rejects invalid OTP and increments otpAttempts", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isAvailable: false });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const salt = await bcrypt.genSalt(10);
      const otpHash = await bcrypt.hash(FIXED_OTP, salt);

      const ride = await createBaseRide(passenger, driver, RIDE_STATUS.DRIVER_ARRIVED, {
        driver: driver._id,
        otpHash,
        otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        otpVerified: false,
        otpAttempts: 0,
      });

      const res = await request(app)
        .post(`/api/rides/${ride._id}/verify-otp`)
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ otp: "0000" }); // Wrong OTP

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const dbRide = await Ride.findById(ride._id).select("+otpAttempts +otpVerified");
      expect(dbRide.otpVerified).toBe(false);
      expect(dbRide.otpAttempts).toBe(1);
    });

    it("verifies valid OTP successfully and updates otpVerified to true", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isAvailable: false });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const salt = await bcrypt.genSalt(10);
      const otpHash = await bcrypt.hash(FIXED_OTP, salt);

      const ride = await createBaseRide(passenger, driver, RIDE_STATUS.DRIVER_ARRIVED, {
        driver: driver._id,
        otpHash,
        otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        otpVerified: false,
        otpAttempts: 0,
      });

      const res = await request(app)
        .post(`/api/rides/${ride._id}/verify-otp`)
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ otp: FIXED_OTP }); // Correct OTP

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/OTP verified/i);

      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.otpVerified).toBe(true);
    });
  });

  describe("4. Start ride", () => {
    it("cannot start the ride before OTP verification", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isAvailable: false });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const ride = await createBaseRide(passenger, driver, RIDE_STATUS.DRIVER_ARRIVED, {
        driver: driver._id,
        otpVerified: false,
      });

      const res = await request(app)
        .post(`/api/rides/${ride._id}/start`)
        .set("Authorization", `Bearer ${driverToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/OTP must be verified before starting/i);

      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.DRIVER_ARRIVED);
    });

    it("starts ride after OTP verification, transitioning status to RIDE_STARTED", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isAvailable: false });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const ride = await createBaseRide(passenger, driver, RIDE_STATUS.DRIVER_ARRIVED, {
        driver: driver._id,
        otpVerified: true,
      });

      const res = await request(app)
        .post(`/api/rides/${ride._id}/start`)
        .set("Authorization", `Bearer ${driverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/ride started/i);
      expect(res.body.data.ride.rideStatus).toBe(RIDE_STATUS.RIDE_STARTED);

      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.RIDE_STARTED);
      expect(dbRide.startedAt).toBeDefined();
    });
  });

  describe("5. Complete ride", () => {
    it("cannot complete ride before status reaches RIDE_STARTED", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isAvailable: false });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const ride = await createBaseRide(passenger, driver, RIDE_STATUS.DRIVER_ARRIVED, {
        driver: driver._id,
        otpVerified: true,
      });

      const res = await request(app)
        .post(`/api/rides/${ride._id}/complete`)
        .set("Authorization", `Bearer ${driverToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot be completed from its current state/i);

      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.DRIVER_ARRIVED);
    });

    it("completes started ride successfully, setting status to RIDE_COMPLETED and finalizing fare", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isAvailable: false, totalEarnings: 0, totalRides: 0 });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const ride = await createBaseRide(passenger, driver, RIDE_STATUS.RIDE_STARTED, {
        driver: driver._id,
        otpVerified: true,
        startedAt: new Date(),
        estimatedFare: 300,
        paymentMethod: PAYMENT_METHOD.CASH,
      });

      const res = await request(app)
        .post(`/api/rides/${ride._id}/complete`)
        .set("Authorization", `Bearer ${driverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/ride completed/i);
      expect(res.body.data.ride.rideStatus).toBe(RIDE_STATUS.RIDE_COMPLETED);

      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.RIDE_COMPLETED);
      expect(dbRide.completedAt).toBeDefined();
      expect(dbRide.finalFare).toBe(300);

      // Verify driver stats were updated
      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.totalRides).toBe(1);
      expect(dbDriver.isAvailable).toBe(true);
    });
  });
});
