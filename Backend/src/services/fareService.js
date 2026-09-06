const fareConfig = require("../config/fareConfig");
const AppError = require("../utils/AppError");

/**
 * Server-authoritative fare calculation.
 * Client-supplied fare values must NEVER be trusted — this is the only
 * place a ride's price is computed.
 */
function estimateFare({ vehicleType, distanceKm, durationMin }) {
  const rates = fareConfig.vehicles[vehicleType];
  if (!rates) throw new AppError(`Unsupported vehicle type: ${vehicleType}`, 400);

  const distanceFare = distanceKm * rates.perKm;
  const timeFare = durationMin * rates.perMinute;
  const subtotal = (rates.baseFare + distanceFare + timeFare) * rates.surgeMultiplier;
  const platformFee = subtotal * (fareConfig.platformFeePercent / 100);

  const total = Math.max(subtotal + platformFee, rates.minimumFare);

  return {
    currency: fareConfig.currency,
    baseFare: round2(rates.baseFare),
    distanceFare: round2(distanceFare),
    timeFare: round2(timeFare),
    platformFee: round2(platformFee),
    surgeMultiplier: rates.surgeMultiplier,
    totalFare: round2(total),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { estimateFare };
