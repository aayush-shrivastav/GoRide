# Socket.io Event Reference

All connections must authenticate: pass the JWT access token as
`socket.handshake.auth.token` (preferred) or rely on the `accessToken`
cookie. Every socket auto-joins a personal room `passenger:<id>` or
`driver:<id>` based on the token's role — this is how the server targets
events to the right user. Client-sent IDs are never trusted for identity.

| Event | Sender → Receiver | Payload | Auth required | Purpose |
|---|---|---|---|---|
| `driver_online` | Driver → Server | `{}` | Yes (driver) | Marks driver online + available |
| `driver_offline` | Driver → Server | `{}` | Yes (driver) | Marks driver offline + unavailable |
| `driver_location_update` | Driver → Server → Passenger | `{ latitude, longitude, rideId? }` | Yes (driver) | Updates driver GPS; if `rideId` given, forwarded live to that ride's passenger |
| `ride_request` | Server → Driver | `{ rideId, pickupAddress, dropAddress, distanceKm, estimatedFare, vehicleType, expiresInSeconds }` | Server-pushed | New ride offered to a candidate driver; driver must call `POST /rides/:id/accept` within `expiresInSeconds` |
| `driver_assigned` | Server → Passenger | `{ rideId, driver, otp }` | Server-pushed | A driver accepted the ride; OTP is delivered here (never sent to the driver) |
| `driver_arriving` | Server → Passenger | `{ rideId }` | Server-pushed | Driver marked en route |
| `driver_arrived` | Server → Passenger | `{ rideId }` | Server-pushed | Driver marked arrived at pickup |
| `ride_started` | Server → Passenger | `{ rideId }` | Server-pushed | OTP verified, ride in progress |
| `ride_completed` | Server → Passenger | `{ rideId, finalFare }` | Server-pushed | Ride finished |
| `ride_cancelled` | Server → Passenger/Driver | `{ rideId, reason, cancelledBy }` | Server-pushed | Other party cancelled the ride |
| `payment_updated` | Server → Passenger/Driver | `{ rideId, status }` | Server-pushed | Payment status changed |
| `notification` | Server → Passenger/Driver | `{ id, type, title, message, rideId, createdAt }` | Server-pushed | Generic notification (mirrors `GET /notifications`) |
| `sos_triggered` | Server → Driver | `{ rideId, sosId, location }` | Server-pushed | Passenger triggered SOS during an active ride |

Ride acceptance/rejection itself is done via REST (`POST /rides/:id/accept`,
`/reject`) rather than a socket event — this lets the server use an atomic
conditional database update to guarantee only one driver ever wins a race
to accept the same ride. Socket.io is used purely to *push* the offer and
subsequent status changes in real time.
