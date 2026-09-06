const { connect, closeDatabase, clearDatabase } = require("./setup");
const User = require("../../src/models/User");
const Driver = require("../../src/models/Driver");
const Ride = require("../../src/models/Ride");
const Payment = require("../../src/models/Payment");
const { RIDE_STATUS, PAYMENT_STATUS } = require("../../src/constants/enums");

jest.setTimeout(30000);

beforeAll(async () => connect());
afterAll(async () => closeDatabase());
afterEach(async () => clearDatabase());

// processSuccessfulPayment starts a mongoose session/transaction, which
// requires MongoDB to be running as a replica set. mongodb-memory-server's
// default single-node instance does NOT support transactions, so this
// suite is written but will only pass against a replica-set-enabled
// instance (e.g. `MongoMemoryReplSet`, or Atlas). See README "Testing".
const { processSuccessfulPayment } = require("../../src/controllers/paymentController");

async function makeDriver() {
  return Driver.create({
    name: "Test Driver",
    email: `driver-${Date.now()}-${Math.random()}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    password: "Password123",
    vehicleType: "car",
    vehicleModel: "Test Car",
    vehicleNumber: `PB${Math.floor(Math.random() * 999999)}`,
    licenseNumber: `LIC${Math.floor(Math.random() * 999999)}`,
    totalEarnings: 0,
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

describe("Payment success idempotency", () => {
  it("credits driver earnings exactly once even when verify + webhook race concurrently", async () => {
    const passenger = await makePassenger();
    const driver = await makeDriver();
    const ride = await Ride.create({
      passenger: passenger._id,
      driver: driver._id,
      pickupLocation: { type: "Point", coordinates: [76.39, 30.65] },
      dropLocation: { type: "Point", coordinates: [76.7, 30.7] },
      pickupAddress: "A",
      dropAddress: "B",
      distanceKm: 10,
      estimatedDurationMin: 20,
      estimatedFare: 500,
      finalFare: 500,
      vehicleType: "car",
      rideStatus: RIDE_STATUS.RIDE_COMPLETED,
      paymentMethod: "online",
    });

    const payment = await Payment.create({
      ride: ride._id,
      passenger: passenger._id,
      driver: driver._id,
      amount: 500,
      currency: "INR",
      method: "online",
      status: PAYMENT_STATUS.PENDING,
      gatewayOrderId: "order_test_123",
    });

    // Simulate the client-verify call and the webhook call landing at
    // nearly the same instant.
    const [resultA, resultB] = await Promise.all([
      processSuccessfulPayment(payment._id, "pay_test_A"),
      processSuccessfulPayment(payment._id, "pay_test_B"),
    ]);

    const finalPayment = await Payment.findById(payment._id);
    expect(finalPayment.status).toBe(PAYMENT_STATUS.SUCCESS);

    const finalDriver = await Driver.findById(driver._id);
    expect(finalDriver.totalEarnings).toBe(500); // NOT 1000

    const processedCount = [resultA, resultB].filter((r) => !r.alreadyProcessed).length;
    expect(processedCount).toBe(1);
  });

  it("a third call after success is a pure no-op (no further earnings credited)", async () => {
    const passenger = await makePassenger();
    const driver = await makeDriver();
    const ride = await Ride.create({
      passenger: passenger._id,
      driver: driver._id,
      pickupLocation: { type: "Point", coordinates: [76.39, 30.65] },
      dropLocation: { type: "Point", coordinates: [76.7, 30.7] },
      pickupAddress: "A",
      dropAddress: "B",
      distanceKm: 5,
      estimatedDurationMin: 10,
      estimatedFare: 100,
      finalFare: 100,
      vehicleType: "car",
      rideStatus: RIDE_STATUS.RIDE_COMPLETED,
      paymentMethod: "online",
    });

    const payment = await Payment.create({
      ride: ride._id,
      passenger: passenger._id,
      driver: driver._id,
      amount: 100,
      currency: "INR",
      method: "online",
      status: PAYMENT_STATUS.PENDING,
      gatewayOrderId: "order_test_456",
    });

    await processSuccessfulPayment(payment._id, "pay_first");
    await processSuccessfulPayment(payment._id, "pay_second"); // e.g. a duplicated webhook retry
    await processSuccessfulPayment(payment._id, "pay_third");

    const finalDriver = await Driver.findById(driver._id);
    expect(finalDriver.totalEarnings).toBe(100);
  });
});
