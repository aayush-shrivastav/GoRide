const { connect, closeDatabase, clearDatabase } = require("./setup");
const User = require("../../src/models/User");
const Driver = require("../../src/models/Driver");
const Ride = require("../../src/models/Ride");
const { RIDE_STATUS } = require("../../src/constants/enums");

jest.setTimeout(30000);

beforeAll(async () => connect());
afterAll(async () => closeDatabase());
afterEach(async () => clearDatabase());

async function makeDriver(overrides = {}) {
  return Driver.create({
    name: "Test Driver",
    email: `driver-${Date.now()}-${Math.random()}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    password: "Password123",
    vehicleType: "car",
    vehicleModel: "Test Car",
    vehicleNumber: `PB${Math.floor(Math.random() * 999999)}`,
    licenseNumber: `LIC${Math.floor(Math.random() * 999999)}`,
    isOnline: true,
    isAvailable: true,
    ...overrides,
  });
}

async function makePassenger() {
  return User.create({
    name: "Test Passenger",
    email: `passenger-${Date.now()}-${Math.random()}@test.com`,
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    password: "Password123",
  });
}

/**
 * Mirrors the exact atomic filter/update used in
 * rideController.acceptRide — this is the operation whose atomicity is
 * actually under test, not the HTTP layer around it.
 */
async function attemptAccept(rideId, driverId) {
  return Ride.findOneAndUpdate(
    {
      _id: rideId,
      rideStatus: RIDE_STATUS.SEARCHING_DRIVER,
      driver: null,
      requestedDrivers: { $elemMatch: { driver: driverId, status: "PENDING", requestedAt: { $gte: new Date(Date.now() - 60000) } } },
    },
    { $set: { driver: driverId, rideStatus: RIDE_STATUS.DRIVER_ASSIGNED, acceptedAt: new Date(), "requestedDrivers.$.status": "ACCEPTED" } },
    { new: true }
  );
}

describe("Ride acceptance concurrency + authorization", () => {
  it("only allows ONE of two simultaneously-invited drivers to accept the same ride", async () => {
    const passenger = await makePassenger();
    const driverA = await makeDriver();
    const driverB = await makeDriver();

    const ride = await Ride.create({
      passenger: passenger._id,
      pickupLocation: { type: "Point", coordinates: [76.39, 30.65] },
      dropLocation: { type: "Point", coordinates: [76.7, 30.7] },
      pickupAddress: "A",
      dropAddress: "B",
      distanceKm: 10,
      estimatedDurationMin: 20,
      estimatedFare: 200,
      vehicleType: "car",
      rideStatus: RIDE_STATUS.SEARCHING_DRIVER,
      requestedDrivers: [
        { driver: driverA._id, requestedAt: new Date(), status: "PENDING" },
        { driver: driverB._id, requestedAt: new Date(), status: "PENDING" },
      ],
    });

    const [resultA, resultB] = await Promise.all([
      attemptAccept(ride._id, driverA._id),
      attemptAccept(ride._id, driverB._id),
    ]);

    const successes = [resultA, resultB].filter(Boolean);
    expect(successes).toHaveLength(1);

    const finalRide = await Ride.findById(ride._id);
    expect(finalRide.rideStatus).toBe(RIDE_STATUS.DRIVER_ASSIGNED);
    expect([driverA._id.toString(), driverB._id.toString()]).toContain(finalRide.driver.toString());
  });

  it("rejects acceptance from a driver who was never invited to the ride", async () => {
    const passenger = await makePassenger();
    const invitedDriver = await makeDriver();
    const uninvitedDriver = await makeDriver();

    const ride = await Ride.create({
      passenger: passenger._id,
      pickupLocation: { type: "Point", coordinates: [76.39, 30.65] },
      dropLocation: { type: "Point", coordinates: [76.7, 30.7] },
      pickupAddress: "A",
      dropAddress: "B",
      distanceKm: 10,
      estimatedDurationMin: 20,
      estimatedFare: 200,
      vehicleType: "car",
      rideStatus: RIDE_STATUS.SEARCHING_DRIVER,
      requestedDrivers: [{ driver: invitedDriver._id, requestedAt: new Date(), status: "PENDING" }],
    });

    const result = await attemptAccept(ride._id, uninvitedDriver._id);
    expect(result).toBeNull();

    const unchanged = await Ride.findById(ride._id);
    expect(unchanged.rideStatus).toBe(RIDE_STATUS.SEARCHING_DRIVER);
    expect(unchanged.driver).toBeNull();
  });

  it("rejects acceptance from a driver whose invitation already expired", async () => {
    const passenger = await makePassenger();
    const driver = await makeDriver();

    const ride = await Ride.create({
      passenger: passenger._id,
      pickupLocation: { type: "Point", coordinates: [76.39, 30.65] },
      dropLocation: { type: "Point", coordinates: [76.7, 30.7] },
      pickupAddress: "A",
      dropAddress: "B",
      distanceKm: 10,
      estimatedDurationMin: 20,
      estimatedFare: 200,
      vehicleType: "car",
      rideStatus: RIDE_STATUS.SEARCHING_DRIVER,
      requestedDrivers: [{ driver: driver._id, requestedAt: new Date(Date.now() - 10 * 60 * 1000), status: "PENDING" }],
    });

    const result = await attemptAccept(ride._id, driver._id);
    expect(result).toBeNull();
  });

  it("does not cancel the ride when one invited driver rejects — it stays SEARCHING_DRIVER", async () => {
    const passenger = await makePassenger();
    const driverA = await makeDriver();

    const ride = await Ride.create({
      passenger: passenger._id,
      pickupLocation: { type: "Point", coordinates: [76.39, 30.65] },
      dropLocation: { type: "Point", coordinates: [76.7, 30.7] },
      pickupAddress: "A",
      dropAddress: "B",
      distanceKm: 10,
      estimatedDurationMin: 20,
      estimatedFare: 200,
      vehicleType: "car",
      rideStatus: RIDE_STATUS.SEARCHING_DRIVER,
      requestedDrivers: [{ driver: driverA._id, requestedAt: new Date(), status: "PENDING" }],
    });

    const updated = await Ride.findOneAndUpdate(
      { _id: ride._id, rideStatus: RIDE_STATUS.SEARCHING_DRIVER, requestedDrivers: { $elemMatch: { driver: driverA._id, status: "PENDING" } } },
      { $addToSet: { rejectedDrivers: driverA._id }, $set: { "requestedDrivers.$.status": "REJECTED" } },
      { new: true }
    );

    expect(updated.rideStatus).toBe(RIDE_STATUS.SEARCHING_DRIVER);
    expect(updated.rejectedDrivers.map(String)).toContain(driverA._id.toString());
  });
});
