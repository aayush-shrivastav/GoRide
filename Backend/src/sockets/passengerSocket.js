const logger = require("../utils/logger");

function registerPassengerHandlers(io, socket) {
  const passengerId = socket.userId;

  // Passengers are largely recipients (driver_assigned, driver_location_update,
  // ride_started, ride_completed, notification, etc.) rather than emitters.
  // ride_accepted / ride_rejected are surfaced to the passenger as
  // `driver_assigned` once the REST accept endpoint atomically wins the race,
  // so no separate handler is needed here for those.

  socket.on("ping_location_request", () => {
    logger.debug({ passengerId }, "Passenger requested a fresh driver location ping");
  });
}

module.exports = registerPassengerHandlers;
