const Driver = require("../models/Driver");
const env = require("../config/env");
const { GENDER } = require("../constants/enums");

/**
 * Finds online + available drivers of the requested vehicle type within
 * `radiusKm` of the pickup point, excluding any driver IDs already
 * rejected/timed-out for this ride.
 *
 * genderFilter, when set to GENDER.FEMALE, restricts results to female
 * drivers — used for the female-driver-priority search round.
 */
async function findNearbyDrivers({ pickup, vehicleType, radiusKm, excludeDriverIds = [], genderFilter = null }) {
  const query = {
    isOnline: true,
    isAvailable: true,
    vehicleType,
    _id: { $nin: excludeDriverIds },
    // Only include drivers who have set a real location (not the model default [0,0]).
    // We check both coordinates individually since MongoDB $near can't be combined with $ne.
    "currentLocation.coordinates": { $ne: [0, 0] },
    currentLocation: {
      $near: {
        $geometry: { type: "Point", coordinates: [pickup.longitude, pickup.latitude] },
        $maxDistance: radiusKm * 1000,
      },
    },
  };

  if (genderFilter) query.gender = genderFilter;

  // $near already sorts by distance ascending.
  return Driver.find(query).limit(20);
}

/**
 * Orchestrates the nearby-driver search with female-driver priority and
 * progressive radius expansion.
 *
 * Female priority is bounded by BOTH configured limits, per spec:
 *   - FEMALE_DRIVER_SEARCH_TIMEOUT (seconds since the ride started
 *     searching) — once elapsed, priority is dropped even if radius
 *     hasn't reached MAX_DRIVER_RADIUS_KM yet.
 *   - MAX_DRIVER_RADIUS_KM — once radius is exhausted, priority is
 *     dropped even if the timeout hasn't elapsed yet.
 * Whichever limit is hit first ends the female-only search and opens
 * matching to all eligible drivers. This was previously radius-only;
 * FEMALE_DRIVER_SEARCH_TIMEOUT was defined in config but never read.
 */
async function searchDriversForRide({ pickup, vehicleType, passengerGender, preferFemaleDriver = false, excludeDriverIds = [], elapsedSeconds = 0 }) {
  const radii = [];
  for (let r = env.INITIAL_DRIVER_RADIUS_KM; r <= env.MAX_DRIVER_RADIUS_KM; r += env.RADIUS_EXPANSION_STEP_KM) {
    radii.push(r);
  }
  if (radii[radii.length - 1] !== env.MAX_DRIVER_RADIUS_KM) radii.push(env.MAX_DRIVER_RADIUS_KM);

  const withinFemaleTimeout = elapsedSeconds < env.FEMALE_DRIVER_SEARCH_TIMEOUT;
  const isFemalePriorityRequested = Boolean(preferFemaleDriver) || passengerGender === GENDER.FEMALE;
  const wantsFemalePriority = env.FEMALE_DRIVER_PRIORITY && isFemalePriorityRequested && withinFemaleTimeout;

  if (wantsFemalePriority) {
    for (const radiusKm of radii) {
      const femaleDrivers = await findNearbyDrivers({
        pickup,
        vehicleType,
        radiusKm,
        excludeDriverIds,
        genderFilter: GENDER.FEMALE,
      });
      if (femaleDrivers.length) return { drivers: femaleDrivers, radiusKm, matchedFemalePriority: true };
    }
    // Radius exhausted while still within the female-search timeout —
    // fall through to an all-gender search at max radius below.
  }

  for (const radiusKm of radii) {
    const drivers = await findNearbyDrivers({ pickup, vehicleType, radiusKm, excludeDriverIds });
    if (drivers.length) return { drivers, radiusKm, matchedFemalePriority: false };
  }

  return { drivers: [], radiusKm: env.MAX_DRIVER_RADIUS_KM, matchedFemalePriority: false };
}

module.exports = { findNearbyDrivers, searchDriversForRide };
