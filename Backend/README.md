# Cab Booking System — Backend

A production-style MERN backend for an Uber/Ola-style cab booking system
with **Passenger** and **Driver** roles (Admin is intentionally out of
scope but the architecture is extensible to add it).

Built with the reference project (ankurdotio/uber-video) studied only for
architecture/flow understanding — this codebase is an original, from-scratch
implementation.

## Features

- JWT authentication (access + refresh tokens, httpOnly cookies) for
  Passenger and Driver, each with their own model
- Driver online/offline status, live GeoJSON location, vehicle info, rating,
  earnings
- Google Maps Platform integration (geocoding, distance/duration) behind a
  swappable service layer
- Server-side fare calculation (base + distance + time + platform fee),
  never trusts client-supplied fares
- Geospatial nearby-driver search (MongoDB `2dsphere`) with **female-driver
  priority** (configurable, radius-expanding, with fallback)
- Full ride lifecycle with atomic accept (prevents double-acceptance),
  OTP-gated ride start, cancellation rules, MongoDB transaction on completion
- Real-time Socket.io layer: authenticated sockets, ride requests, live
  driver tracking scoped to the active ride only, notifications, SOS
- Razorpay payment integration: order creation, signature verification,
  webhook handling — payment is only ever marked successful via signature
  or webhook, never by client claim
- Ratings, ride history (paginated/filterable), notifications, SOS
- Centralized error handling, Zod validation, rate limiting, Helmet, CORS,
  Mongo injection sanitization, structured logging (pino) with redaction

## Tech Stack

Node.js · Express · MongoDB/Mongoose · Socket.io · JWT · bcryptjs ·
Zod · Razorpay · Helmet · express-rate-limit · pino

## Folder Structure

```
src/
  config/       env, db connection, fare config
  constants/    shared enums (ride status, roles, etc.)
  models/       User, Driver, Ride, Payment, Rating, Notification, Sos
  middleware/   auth, error handler, rate limiter, validate
  utils/        AppError, catchAsync, apiResponse, tokens, otp, logger
  validators/   Zod schemas per route group
  services/     mapsService, fareService, driverMatchingService,
                rideMatchingService, otpService, paymentService,
                notificationService
  controllers/  thin controllers — business logic lives in services
  routes/       REST route definitions
  sockets/      Socket.io init, auth middleware, driver/passenger handlers
  seed/         development-only seed data
  app.js        Express app (middleware + routes)
  server.js     HTTP server + Socket.io bootstrap
tests/          Jest unit tests
postman/        Postman collection
docs/           Socket event reference
```

## Installation

```bash
cd cab-booking-backend
npm install
cp .env.example .env   # then fill in real values
npm run dev             # or: npm start
```

Requires Node.js 18+ (uses the built-in `fetch` for Google Maps calls) and
a running MongoDB instance.

## Environment Variables

See `.env.example` for the full list with descriptions. Key ones:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` / `REFRESH_TOKEN_SECRET` | Token signing secrets — use long random values |
| `GOOGLE_MAPS_API_KEY` | Enables Geocoding + Distance Matrix APIs |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Payment gateway |
| `FEMALE_DRIVER_PRIORITY` | Toggle the female-driver-priority matching behavior |
| `INITIAL_DRIVER_RADIUS_KM` / `MAX_DRIVER_RADIUS_KM` / `RADIUS_EXPANSION_STEP_KM` | Driver search radius expansion |
| `DRIVER_REQUEST_TIMEOUT_SECONDS` | How long a driver has to respond to a ride offer |
| `OTP_LENGTH` / `OTP_EXPIRES_MINUTES` / `OTP_MAX_ATTEMPTS` | Ride-start OTP behavior |

## MongoDB Setup

1. Install MongoDB locally or use Atlas.
2. Set `MONGODB_URI` in `.env`.
3. Geospatial (`2dsphere`) indexes on `Driver.currentLocation` and
   `Ride.pickupLocation` are created automatically by Mongoose from the
   schema definitions on first connection — no manual step needed.

## Google Maps Setup

1. In Google Cloud Console, enable: **Geocoding API** and **Distance
   Matrix API**.
2. Create an API key, restrict it to those APIs (and to your server's
   IP/referrer in production).
3. Set `GOOGLE_MAPS_API_KEY` in `.env`. The key is used server-side only —
   it is never sent to the client.

## Payment Gateway Setup (Razorpay)

1. Create a Razorpay account, grab the test **Key ID** / **Key Secret**.
2. Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
3. In the Razorpay dashboard, add a webhook pointing to
   `POST /api/payments/webhook`, subscribe to `payment.captured` and
   `payment.failed`, and set `RAZORPAY_WEBHOOK_SECRET` to the secret shown
   there.

## Running Locally

```bash
npm run dev       # nodemon, auto-restart
npm run seed       # optional: creates two passengers + two drivers (one of each gender) for testing female-driver priority
```

Health check: `GET /health`

## API Documentation

All responses follow:

```json
{ "success": true, "message": "...", "data": {} }
{ "success": false, "message": "...", "error": {} }
```

See the full endpoint list in the code (`src/routes/*.js`) — grouped as
`/api/auth`, `/api/drivers`, `/api/rides`, `/api/payments`,
`/api/ratings`, `/api/notifications` — or import the Postman collection
below for a ready-to-run reference.

`POST /api/auth/refresh` (also aliased at `POST /api/drivers/refresh`)
reads the refresh token from the httpOnly cookie (or `refreshToken` in
the JSON body, for clients that can't use cookies), verifies it, and
rotates it — the old refresh token is invalidated the moment a new one
is issued. Role (passenger vs driver) is resolved from the token itself,
never from the URL or a client-supplied value.

## Socket.io Events

See [`docs/SOCKET_EVENTS.md`](docs/SOCKET_EVENTS.md) for the full event
table (sender, receiver, payload, auth, purpose).

## Postman

Import `postman/cab-booking.postman_collection.json`. Set `baseUrl` and,
after logging in, paste the returned `accessToken` into `passengerToken`
/ `driverToken` collection variables.

## Testing

```bash
npm test
```

Included:
- `tests/fareService.test.js`, `tests/otpService.test.js` — dependency-free unit tests
- `tests/integration/rideAcceptanceRace.test.js` — proves two simultaneous accepts on the same ride never both succeed, and that an uninvited/expired-invitation driver is rejected
- `tests/integration/paymentIdempotency.test.js` — proves driver earnings are credited exactly once even when verify + webhook race
- `tests/integration/authRefresh.test.js` — refresh token issuance, rotation, invalid/missing token, post-logout rejection

The integration tests use `mongodb-memory-server`, which downloads a MongoDB
binary on first run (needs network access once). **The payment idempotency
test specifically requires a MongoDB replica set**, because
`processSuccessfulPayment` uses a Mongoose transaction — a default
single-node `mongodb-memory-server` instance does not support transactions.
Either switch that test's setup to `MongoMemoryReplSet`, or run it against
a real replica-set-enabled MongoDB (Atlas is one by default).

## Common Errors

- **"Google Maps API key is not configured"** — set `GOOGLE_MAPS_API_KEY`.
- **"Payment gateway is not configured"** — set the two Razorpay env vars.
- **`E11000 duplicate key`** — email/phone/vehicle number/license already
  registered; the API returns a clean 409 for this.
- **Ride stuck in `SEARCHING_DRIVER`** — no online+available driver of the
  requested vehicle type exists within `MAX_DRIVER_RADIUS_KM`; seed a
  driver or widen the radius env vars.

## Production Considerations

- Put JWT secrets, Mongo URI, and gateway keys in a real secrets manager,
  not `.env`, in production.
- The in-memory location-write throttle in `sockets/driverSocket.js` is
  per-process — move to Redis before scaling to multiple server instances
  (also needed for Socket.io's own multi-instance adapter).
- Add an Admin module (flagged as out of scope here) for dispute handling,
  driver verification/document review, and manual SOS response.
- Consider a dead-letter/retry mechanism for the Razorpay webhook handler.
