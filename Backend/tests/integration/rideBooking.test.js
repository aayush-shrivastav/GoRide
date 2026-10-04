const http = require("http");
const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { initSocket } = require("../../src/sockets");
const User = require("../../src/models/User");
const Ride = require("../../src/models/Ride");
const { RIDE_STATUS, VEHICLE_TYPES, PAYMENT_METHOD } = require("../../src/constants/enums");
const mapsService = require("../../src/services/mapsService");
const rideMatchingService = require("../../src/services/rideMatchingService");

jest.setTimeout(30000);

let app;
let matchRideSpy;
let mapsServiceSpy;

beforeAll(async () => {
  await connect();
  app = require("../../src/app");
  const server = http.createServer(app);
  initSocket(server);

  // Mock mapsService routing so tests are fast, deterministic, and 100% offline
  mapsServiceSpy = jest.spyOn(mapsService, "getDistanceAndDurationForRoute").mockResolvedValue({
    distanceKm: 12.5,
    durationMin: 25.0,
  });

  // Mock rideMatchingService.matchRide so background matching loop does not race against lifecycle tests
  matchRideSpy = jest.spyOn(rideMatchingService, "matchRide").mockImplementation(async () => {});
});

afterAll(async () => {
  if (mapsServiceSpy) mapsServiceSpy.mockRestore();
  if (matchRideSpy) matchRideSpy.mockRestore();
  await closeDatabase();
});

afterEach(async () => {
  await clearDatabase();
});

async function registerAndLoginPassenger() {
  const agent = request.agent(app);
  const email = `passenger-${Date.now()}-${Math.random()}@test.com`;
  const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  const password = "Password123";

  const res = await agent.post("/api/auth/register").send({
    name: "Booking Test Passenger",
    email,
    phone,
    password,
  });

  const accessToken = res.body.data?.accessToken;
  const user = res.body.data?.user;

  return { agent, accessToken, user, email, phone, password };
}

const sampleRidePayload = {
  pickup: {
    latitude: 19.076,
    longitude: 72.877,
    address: "Bandra West, Mumbai",
  },
  drop: {
    latitude: 19.218,
    longitude: 72.978,
    address: "Thane West, Mumbai",
  },
  vehicleType: "car",
  paymentMethod: "cash",
};

describe("Phase 1A — Ride Booking Integration Tests", () => {
  describe("1. Passenger creates a ride successfully", () => {
    it("creates a ride with valid authentication and data, returning status SEARCHING_DRIVER", async () => {
      const { agent, accessToken, user } = await registerAndLoginPassenger();

      const res = await agent
        .post("/api/rides")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(sampleRidePayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/searching for a driver/i);

      const ride = res.body.data.ride;
      expect(ride).toBeDefined();
      expect(ride._id).toBeDefined();
      expect(ride.passenger.toString()).toBe(user._id.toString());
      expect(ride.vehicleType).toBe("car");
      expect(ride.paymentMethod).toBe("cash");
      expect(ride.distanceKm).toBe(12.5);
      expect(ride.estimatedDurationMin).toBe(25);
      expect(ride.estimatedFare).toBeGreaterThan(0);
      expect(ride.rideStatus).toBe(RIDE_STATUS.SEARCHING_DRIVER);

      // Verify persisted state in MongoDB
      const dbRide = await Ride.findById(ride._id);
      expect(dbRide).not.toBeNull();
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.SEARCHING_DRIVER);
      expect(dbRide.pickupLocation.coordinates).toEqual([
        sampleRidePayload.pickup.longitude,
        sampleRidePayload.pickup.latitude,
      ]);
      expect(dbRide.dropLocation.coordinates).toEqual([
        sampleRidePayload.drop.longitude,
        sampleRidePayload.drop.latitude,
      ]);

      // Verify rideMatchingService.matchRide was triggered with ride ID
      expect(matchRideSpy).toHaveBeenCalledWith(ride._id.toString());
    });
  });

  describe("2. Prevent creating another active ride when passenger already has one", () => {
    it("rejects ride creation with 409 Conflict when an active ride already exists", async () => {
      const { agent, accessToken } = await registerAndLoginPassenger();

      // Create the first ride
      const firstRes = await agent
        .post("/api/rides")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(sampleRidePayload);

      expect(firstRes.status).toBe(201);
      expect(firstRes.body.data.ride.rideStatus).toBe(RIDE_STATUS.SEARCHING_DRIVER);

      // Attempt to create a second ride while first is still SEARCHING_DRIVER
      const secondRes = await agent
        .post("/api/rides")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(sampleRidePayload);

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.message).toMatch(/already have an active ride in progress/i);

      // Verify only one ride document exists in the database for this user
      const userRides = await Ride.find({ passenger: firstRes.body.data.ride.passenger });
      expect(userRides).toHaveLength(1);
    });
  });

  describe("2A. Restore an active ride with multiple status filters", () => {
    it("accepts the comma-separated status list sent by the mobile app", async () => {
      const { agent, accessToken } = await registerAndLoginPassenger();

      const createRes = await agent
        .post("/api/rides")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(sampleRidePayload);

      const rideId = createRes.body.data.ride._id;
      await Ride.findByIdAndUpdate(rideId, { rideStatus: RIDE_STATUS.DRIVER_ASSIGNED });

      const historyRes = await agent
        .get("/api/rides/my-rides?status=SEARCHING_DRIVER,DRIVER_ASSIGNED&limit=1")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data.total).toBe(1);
      expect(historyRes.body.data.rides).toHaveLength(1);
      expect(historyRes.body.data.rides[0]._id).toBe(rideId);
    });
  });

  describe("3. Cancel a ride while status is SEARCHING_DRIVER", () => {
    it("allows cancellation during SEARCHING_DRIVER and transitions status to CANCELLED_BY_PASSENGER", async () => {
      const { agent, accessToken } = await registerAndLoginPassenger();

      // Create ride
      const createRes = await agent
        .post("/api/rides")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(sampleRidePayload);

      expect(createRes.status).toBe(201);
      const rideId = createRes.body.data.ride._id;

      // Cancel the ride while searching
      const cancelRes = await agent
        .post(`/api/rides/${rideId}/cancel`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ reason: "Passenger found another ride" });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.message).toMatch(/ride cancelled/i);
      expect(cancelRes.body.data.ride.rideStatus).toBe(RIDE_STATUS.CANCELLED_BY_PASSENGER);
      expect(cancelRes.body.data.ride.cancelledBy).toBe("passenger");
      expect(cancelRes.body.data.ride.cancellationReason).toBe("Passenger found another ride");

      // Verify database reflects the cancellation
      const dbRide = await Ride.findById(rideId);
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.CANCELLED_BY_PASSENGER);
      expect(dbRide.cancelledAt).toBeDefined();

      // Verify passenger can now book a new ride without 409 active ride conflict
      const rebookRes = await agent
        .post("/api/rides")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(sampleRidePayload);

      expect(rebookRes.status).toBe(201);
      expect(rebookRes.body.data.ride.rideStatus).toBe(RIDE_STATUS.SEARCHING_DRIVER);
    });
  });

  describe("4. Try cancelling a ride after status RIDE_STARTED", () => {
    it("rejects cancellation with 400 Bad Request and preserves RIDE_STARTED status", async () => {
      const { agent, accessToken } = await registerAndLoginPassenger();

      // Create ride
      const createRes = await agent
        .post("/api/rides")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(sampleRidePayload);

      expect(createRes.status).toBe(201);
      const rideId = createRes.body.data.ride._id;

      // Manually transition ride to RIDE_STARTED (simulating driver verified OTP and started trip)
      await Ride.findByIdAndUpdate(rideId, {
        rideStatus: RIDE_STATUS.RIDE_STARTED,
        startedAt: new Date(),
        otpVerified: true,
      });

      // Attempt to cancel during an active in-progress trip
      const cancelRes = await agent
        .post(`/api/rides/${rideId}/cancel`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ reason: "Attempt cancel mid-trip" });

      expect(cancelRes.status).toBe(400);
      expect(cancelRes.body.success).toBe(false);
      expect(cancelRes.body.message).toMatch(/cannot be cancelled from status/i);

      // Verify database status is unchanged
      const dbRide = await Ride.findById(rideId);
      expect(dbRide.rideStatus).toBe(RIDE_STATUS.RIDE_STARTED);
      expect(dbRide.cancelledAt).toBeFalsy();
    });
  });
});
