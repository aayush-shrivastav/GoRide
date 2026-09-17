const http = require("http");
const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { initSocket } = require("../../src/sockets");
const User = require("../../src/models/User");
const Driver = require("../../src/models/Driver");
const Ride = require("../../src/models/Ride");
const Payment = require("../../src/models/Payment");
const Rating = require("../../src/models/Rating");
const { RIDE_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } = require("../../src/constants/enums");
const { signAccessToken } = require("../../src/utils/tokens");
const paymentService = require("../../src/services/paymentService");
const fareConfig = require("../../src/config/fareConfig");

jest.setTimeout(30000);

let app;
let createOrderSpy;
let verifySigSpy;

beforeAll(async () => {
  await connect();
  app = require("../../src/app");
  const server = http.createServer(app);
  initSocket(server);
});

afterAll(async () => {
  if (createOrderSpy) createOrderSpy.mockRestore();
  if (verifySigSpy) verifySigSpy.mockRestore();
  await closeDatabase();
});

afterEach(async () => {
  jest.clearAllMocks();
  await clearDatabase();
});

async function makeDriver(overrides = {}) {
  return Driver.create({
    name: "Payment Test Driver",
    email: `driver-${Date.now()}-${Math.random()}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    password: "Password123",
    vehicleType: "car",
    vehicleModel: "Sedan LX",
    vehicleNumber: `MH${Math.floor(100000 + Math.random() * 899999)}`,
    licenseNumber: `LIC${Math.floor(100000 + Math.random() * 899999)}`,
    isOnline: true,
    isAvailable: true,
    totalEarnings: 0,
    totalRides: 0,
    rating: 5,
    ratingCount: 0,
    ...overrides,
  });
}

async function makePassenger(overrides = {}) {
  return User.create({
    name: "Payment Test Passenger",
    email: `passenger-${Date.now()}-${Math.random()}@test.com`,
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    password: "Password123",
    ...overrides,
  });
}

async function createTestRide(passenger, driver, overrides = {}) {
  return Ride.create({
    passenger: passenger._id,
    driver: driver ? driver._id : null,
    pickupLocation: { type: "Point", coordinates: [72.8777, 19.076] },
    dropLocation: { type: "Point", coordinates: [72.9781, 19.2183] },
    pickupAddress: "Bandra, Mumbai",
    dropAddress: "Thane, Mumbai",
    distanceKm: 15,
    estimatedDurationMin: 35,
    estimatedFare: 500,
    finalFare: null,
    vehicleType: "car",
    paymentMethod: PAYMENT_METHOD.CASH,
    paymentStatus: PAYMENT_STATUS.PENDING,
    rideStatus: RIDE_STATUS.RIDE_STARTED,
    otpVerified: true,
    startedAt: new Date(),
    ...overrides,
  });
}

describe("PHASE 1C — Payment, Earnings and Rating Integration Tests", () => {
  describe("1. Cash ride settlement", () => {
    it("completes a valid RIDE_STARTED ride using CASH, creates Payment, updates driver earnings, and splits fare correctly", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isOnline: true, isAvailable: false, totalEarnings: 0, totalRides: 0 });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const fareAmount = 500;
      const ride = await createTestRide(passenger, driver, {
        estimatedFare: fareAmount,
        paymentMethod: PAYMENT_METHOD.CASH,
        rideStatus: RIDE_STATUS.RIDE_STARTED,
      });

      const res = await request(app)
        .post(`/api/rides/${ride._id}/complete`)
        .set("Authorization", `Bearer ${driverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ride.rideStatus).toBe(RIDE_STATUS.RIDE_COMPLETED);

      // Verify ride status & fare split in DB
      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.RIDE_COMPLETED);
      expect(dbRide.paymentStatus).toBe(PAYMENT_STATUS.SUCCESS);
      expect(dbRide.finalFare).toBe(fareAmount);

      // Verify platform commission & driver earnings calculation based on fareConfig
      const expectedCommission = Math.round(fareAmount * (fareConfig.platformFeePercent / 100) * 100) / 100;
      const expectedDriverEarning = Math.round((fareAmount - expectedCommission) * 100) / 100;
      expect(dbRide.platformCommission).toBe(expectedCommission);
      expect(dbRide.driverEarning).toBe(expectedDriverEarning);

      // Verify Payment record was created correctly
      const payments = await Payment.find({ ride: ride._id });
      expect(payments).toHaveLength(1);
      const payment = payments[0];
      expect(payment.amount).toBe(fareAmount);
      expect(payment.method).toBe(PAYMENT_METHOD.CASH);
      expect(payment.status).toBe(PAYMENT_STATUS.SUCCESS);
      expect(payment.transactionId).toBe(`cash_${ride._id}`);
      expect(payment.gateway).toBe("cash");
      expect(payment.passenger.toString()).toBe(passenger._id.toString());
      expect(payment.driver.toString()).toBe(driver._id.toString());

      // Verify driver wallet/earnings and availability
      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.totalEarnings).toBe(expectedDriverEarning);
      expect(dbDriver.totalRides).toBe(1);
      expect(dbDriver.isAvailable).toBe(true);
    });

    it("prevents double-settlement and duplicate earnings when completing the same ride twice", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ isOnline: true, isAvailable: false, totalEarnings: 0, totalRides: 0 });
      const driverToken = signAccessToken({ id: driver._id.toString(), role: "driver" });

      const fareAmount = 400;
      const ride = await createTestRide(passenger, driver, {
        estimatedFare: fareAmount,
        paymentMethod: PAYMENT_METHOD.CASH,
        rideStatus: RIDE_STATUS.RIDE_STARTED,
      });

      // First completion
      const res1 = await request(app)
        .post(`/api/rides/${ride._id}/complete`)
        .set("Authorization", `Bearer ${driverToken}`);
      expect(res1.status).toBe(200);

      const expectedCommission = Math.round(fareAmount * (fareConfig.platformFeePercent / 100) * 100) / 100;
      const expectedDriverEarning = Math.round((fareAmount - expectedCommission) * 100) / 100;

      // Second completion attempt
      const res2 = await request(app)
        .post(`/api/rides/${ride._id}/complete`)
        .set("Authorization", `Bearer ${driverToken}`);

      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
      expect(res2.body.message).toMatch(/cannot be completed from its current state/i);

      // Verify driver stats were NOT double credited
      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.totalEarnings).toBe(expectedDriverEarning);
      expect(dbDriver.totalRides).toBe(1);

      // Verify Payment record was NOT duplicated
      const payments = await Payment.find({ ride: ride._id });
      expect(payments).toHaveLength(1);
    });
  });

  describe("2. Online payment settlement", () => {
    it("validates order creation preconditions (requires active or completed ride)", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver();
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      // Incomplete/unassigned ride in SEARCHING status
      const searchingRide = await createTestRide(passenger, null, {
        rideStatus: RIDE_STATUS.SEARCHING,
        paymentMethod: PAYMENT_METHOD.ONLINE,
      });

      const resSearching = await request(app)
        .post("/api/payments/create-order")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: searchingRide._id.toString() });

      expect(resSearching.status).toBe(400);
      expect(resSearching.body.message).toMatch(/Payment can only be initiated for an active or completed ride/i);

      // Cancelled ride
      const cancelledRide = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.CANCELLED,
        paymentMethod: PAYMENT_METHOD.ONLINE,
      });

      const resCancelled = await request(app)
        .post("/api/payments/create-order")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: cancelledRide._id.toString() });

      expect(resCancelled.status).toBe(400);
      expect(resCancelled.body.message).toMatch(/Payment can only be initiated for an active or completed ride/i);
    });

    it("creates a gateway order and pending Payment record for a completed online ride", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver();
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      const fareAmount = 450;
      const ride = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.RIDE_COMPLETED,
        paymentMethod: PAYMENT_METHOD.ONLINE,
        estimatedFare: fareAmount,
        finalFare: fareAmount,
        platformCommission: Math.round(fareAmount * (fareConfig.platformFeePercent / 100) * 100) / 100,
        driverEarning: Math.round((fareAmount - (fareAmount * (fareConfig.platformFeePercent / 100))) * 100) / 100,
      });

      // Mock paymentService.createOrder to avoid contacting Razorpay
      createOrderSpy = jest.spyOn(paymentService, "createOrder").mockResolvedValue({
        id: "order_mock_online_001",
        amount: fareAmount * 100,
        currency: "INR",
        receipt: `ride_${ride._id}`,
      });

      const res = await request(app)
        .post("/api/payments/create-order")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: ride._id.toString() });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe("order_mock_online_001");

      const payment = await Payment.findOne({ ride: ride._id });
      expect(payment).not.toBeNull();
      expect(payment.status).toBe(PAYMENT_STATUS.PENDING);
      expect(payment.amount).toBe(fareAmount);
      expect(payment.gatewayOrderId).toBe("order_mock_online_001");
    });

    it("rejects invalid payment signature, updates payment to FAILED, and does not credit driver", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ totalEarnings: 0 });
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      const fareAmount = 350;
      const ride = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.RIDE_COMPLETED,
        paymentMethod: PAYMENT_METHOD.ONLINE,
        finalFare: fareAmount,
      });

      const payment = await Payment.create({
        ride: ride._id,
        passenger: passenger._id,
        driver: driver._id,
        amount: fareAmount,
        currency: "INR",
        method: PAYMENT_METHOD.ONLINE,
        status: PAYMENT_STATUS.PENDING,
        gatewayOrderId: "order_mock_invalid_sig",
      });

      verifySigSpy = jest.spyOn(paymentService, "verifyPaymentSignature").mockReturnValue(false);

      const res = await request(app)
        .post("/api/payments/verify")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({
          razorpay_order_id: "order_mock_invalid_sig",
          razorpay_payment_id: "pay_mock_invalid",
          razorpay_signature: "forged_signature_123",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Payment signature verification failed/i);

      // Verify Payment record status is FAILED
      const dbPayment = await Payment.findById(payment._id);
      expect(dbPayment.status).toBe(PAYMENT_STATUS.FAILED);

      // Verify ride status remains unchanged and driver receives no earnings
      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.paymentStatus).toBe(PAYMENT_STATUS.PENDING);

      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.totalEarnings).toBe(0);
    });

    it("verifies valid payment signature, updates payment/ride to SUCCESS, and credits driver earnings", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ totalEarnings: 0 });
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      const fareAmount = 500;
      const driverEarning = 490;
      const ride = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.RIDE_COMPLETED,
        paymentMethod: PAYMENT_METHOD.ONLINE,
        finalFare: fareAmount,
        driverEarning,
        platformCommission: 10,
      });

      const payment = await Payment.create({
        ride: ride._id,
        passenger: passenger._id,
        driver: driver._id,
        amount: fareAmount,
        currency: "INR",
        method: PAYMENT_METHOD.ONLINE,
        status: PAYMENT_STATUS.PENDING,
        gatewayOrderId: "order_mock_valid_sig",
      });

      verifySigSpy = jest.spyOn(paymentService, "verifyPaymentSignature").mockReturnValue(true);

      const res = await request(app)
        .post("/api/payments/verify")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({
          razorpay_order_id: "order_mock_valid_sig",
          razorpay_payment_id: "pay_mock_success_777",
          razorpay_signature: "valid_hmac_signature_777",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/Payment verified/i);

      // Verify Payment record updated to SUCCESS
      const dbPayment = await Payment.findById(payment._id);
      expect(dbPayment.status).toBe(PAYMENT_STATUS.SUCCESS);
      expect(dbPayment.gatewayPaymentId).toBe("pay_mock_success_777");
      expect(dbPayment.transactionId).toBe("pay_mock_success_777");

      // Verify Ride paymentStatus updated to SUCCESS
      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.paymentStatus).toBe(PAYMENT_STATUS.SUCCESS);

      // Verify Driver earnings credited
      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.totalEarnings).toBe(driverEarning);
    });
  });

  describe("3. Payment idempotency", () => {
    it("reuses existing non-failed order on duplicate create-order requests without creating duplicate Payment records", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver();
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      const fareAmount = 400;
      const ride = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.RIDE_COMPLETED,
        paymentMethod: PAYMENT_METHOD.ONLINE,
        finalFare: fareAmount,
      });

      createOrderSpy = jest.spyOn(paymentService, "createOrder").mockResolvedValue({
        id: "order_idempotency_test",
        amount: fareAmount * 100,
        currency: "INR",
        receipt: `ride_${ride._id}`,
      });

      // First call -> creates order
      const res1 = await request(app)
        .post("/api/payments/create-order")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: ride._id.toString() });
      expect(res1.status).toBe(201);
      expect(res1.body.data.orderId).toBe("order_idempotency_test");

      // Second call -> reuses existing order
      const res2 = await request(app)
        .post("/api/payments/create-order")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: ride._id.toString() });
      expect(res2.status).toBe(200);
      expect(res2.body.message).toMatch(/Using existing order/i);
      expect(res2.body.data.orderId).toBe("order_idempotency_test");

      // Verify only 1 Payment record exists in DB
      const payments = await Payment.find({ ride: ride._id });
      expect(payments).toHaveLength(1);
    });

    it("verifying the same payment twice does not double-credit driver earnings", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ totalEarnings: 0 });
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      const fareAmount = 500;
      const driverEarning = 490;
      const ride = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.RIDE_COMPLETED,
        paymentMethod: PAYMENT_METHOD.ONLINE,
        finalFare: fareAmount,
        driverEarning,
      });

      const payment = await Payment.create({
        ride: ride._id,
        passenger: passenger._id,
        driver: driver._id,
        amount: fareAmount,
        currency: "INR",
        method: PAYMENT_METHOD.ONLINE,
        status: PAYMENT_STATUS.PENDING,
        gatewayOrderId: "order_verify_twice",
      });

      verifySigSpy = jest.spyOn(paymentService, "verifyPaymentSignature").mockReturnValue(true);

      // Verify call 1
      const res1 = await request(app)
        .post("/api/payments/verify")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({
          razorpay_order_id: "order_verify_twice",
          razorpay_payment_id: "pay_twice_123",
          razorpay_signature: "valid_sig",
        });
      expect(res1.status).toBe(200);

      // Verify call 2 (replay / duplicate confirmation)
      const res2 = await request(app)
        .post("/api/payments/verify")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({
          razorpay_order_id: "order_verify_twice",
          razorpay_payment_id: "pay_twice_123",
          razorpay_signature: "valid_sig",
        });
      expect(res2.status).toBe(200);

      // Driver earnings must be credited exactly once
      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.totalEarnings).toBe(driverEarning);
    });
  });

  describe("4. Rating flow", () => {
    it("passenger cannot rate an incomplete ride", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver();
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      const ride = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.RIDE_STARTED,
      });

      const res = await request(app)
        .post("/api/ratings")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({
          rideId: ride._id.toString(),
          stars: 5,
          review: "Great driving!",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/You can only rate a completed ride/i);

      const ratings = await Rating.find({ ride: ride._id });
      expect(ratings).toHaveLength(0);
    });

    it("rejects rating values outside the allowed range (1 to 5)", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver();
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      const ride = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.RIDE_COMPLETED,
      });

      // Rating < 1
      const resLow = await request(app)
        .post("/api/ratings")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: ride._id.toString(), stars: 0 });
      expect(resLow.status).toBe(400);

      // Rating > 5
      const resHigh = await request(app)
        .post("/api/ratings")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: ride._id.toString(), stars: 6 });
      expect(resHigh.status).toBe(400);

      // Non-integer rating
      const resDecimal = await request(app)
        .post("/api/ratings")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: ride._id.toString(), stars: 4.5 });
      expect(resDecimal.status).toBe(400);

      const ratings = await Rating.find({ ride: ride._id });
      expect(ratings).toHaveLength(0);
    });

    it("submits rating successfully for completed ride and updates driver running average and count", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ rating: 5, ratingCount: 0 });
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      const ride = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.RIDE_COMPLETED,
      });

      const res = await request(app)
        .post("/api/ratings")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({
          rideId: ride._id.toString(),
          stars: 4,
          review: "Smooth and clean car",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rating.stars).toBe(4);

      // Verify DB Rating
      const dbRating = await Rating.findOne({ ride: ride._id });
      expect(dbRating).not.toBeNull();
      expect(dbRating.stars).toBe(4);
      expect(dbRating.review).toBe("Smooth and clean car");
      expect(dbRating.passenger.toString()).toBe(passenger._id.toString());
      expect(dbRating.driver.toString()).toBe(driver._id.toString());

      // Verify Ride isRated flag
      const dbRide = await Ride.findById(ride._id);
      expect(dbRide.isRated).toBe(true);

      // Verify Driver rating stats: (5 * 0 + 4) / 1 = 4
      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.ratingCount).toBe(1);
      expect(dbDriver.rating).toBe(4);
    });

    it("prevents duplicate rating for the same ride according to backend rules", async () => {
      const passenger = await makePassenger();
      const driver = await makeDriver({ rating: 5, ratingCount: 0 });
      const passengerToken = signAccessToken({ id: passenger._id.toString(), role: "passenger" });

      const ride = await createTestRide(passenger, driver, {
        rideStatus: RIDE_STATUS.RIDE_COMPLETED,
      });

      // First rating
      const res1 = await request(app)
        .post("/api/ratings")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: ride._id.toString(), stars: 5, review: "Great trip" });
      expect(res1.status).toBe(201);

      // Second rating attempt for same ride
      const res2 = await request(app)
        .post("/api/ratings")
        .set("Authorization", `Bearer ${passengerToken}`)
        .send({ rideId: ride._id.toString(), stars: 3, review: "Changed my mind" });

      expect(res2.status).toBe(409);
      expect(res2.body.success).toBe(false);
      expect(res2.body.message).toMatch(/already been rated/i);

      // Verify driver rating count was not incremented again
      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.ratingCount).toBe(1);
      expect(dbDriver.rating).toBe(5);

      const ratings = await Rating.find({ ride: ride._id });
      expect(ratings).toHaveLength(1);
    });

    it("correctly computes driver running average over multiple rated rides", async () => {
      const passenger1 = await makePassenger();
      const passenger2 = await makePassenger();
      const driver = await makeDriver({ rating: 5, ratingCount: 0 });
      const token1 = signAccessToken({ id: passenger1._id.toString(), role: "passenger" });
      const token2 = signAccessToken({ id: passenger2._id.toString(), role: "passenger" });

      const ride1 = await createTestRide(passenger1, driver, { rideStatus: RIDE_STATUS.RIDE_COMPLETED });
      const ride2 = await createTestRide(passenger2, driver, { rideStatus: RIDE_STATUS.RIDE_COMPLETED });

      // First rating: 4 stars -> average = 4, count = 1
      await request(app)
        .post("/api/ratings")
        .set("Authorization", `Bearer ${token1}`)
        .send({ rideId: ride1._id.toString(), stars: 4 });

      // Second rating: 5 stars -> average = (4 * 1 + 5) / 2 = 4.5, count = 2
      await request(app)
        .post("/api/ratings")
        .set("Authorization", `Bearer ${token2}`)
        .send({ rideId: ride2._id.toString(), stars: 5 });

      const dbDriver = await Driver.findById(driver._id);
      expect(dbDriver.ratingCount).toBe(2);
      expect(dbDriver.rating).toBe(4.5);
    });
  });
});
