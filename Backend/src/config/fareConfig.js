/**
 * Centralized fare configuration.
 * Never hard-code fare numbers inside controllers/services — read from here.
 * In a real production system this could be moved to a DB collection so
 * fares can be updated without a redeploy.
 */
module.exports = {
  currency: process.env.CURRENCY || "INR",
  platformFeePercent: 2, // % of base+distance+time fare
  vehicles: {
    bike: { baseFare: 12, perKm: 5, perMinute: 0.8, minimumFare: 20, surgeMultiplier: 1 },
    auto: { baseFare: 20, perKm: 7, perMinute: 1.0, minimumFare: 35, surgeMultiplier: 1 },
    car:  { baseFare: 25, perKm: 10, perMinute: 1.2, minimumFare: 50, surgeMultiplier: 1 },
    suv:  { baseFare: 55, perKm: 14, perMinute: 1.8, minimumFare: 85, surgeMultiplier: 1 },
  },
};
