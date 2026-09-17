const Driver = require("../models/Driver");
const env = require("../config/env");
const { GENDER } = require("../constants/enums");

const getSafeNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeDriverIds = (driverIds = []) => {
  if (!Array.isArray(driverIds)) return [];

  return driverIds
    .filter(Boolean)
    .map((id) => String(id));
};

const buildRadii = () => {
  const initialRadius = getSafeNumber(
    env.INITIAL_DRIVER_RADIUS_KM,
    2
  );

  const maxRadius = getSafeNumber(
    env.MAX_DRIVER_RADIUS_KM,
    initialRadius
  );

  const expansionStep = getSafeNumber(
    env.RADIUS_EXPANSION_STEP_KM,
    1
  );

  const start = Math.max(0.1, initialRadius);
  const max = Math.max(start, maxRadius);
  const step = Math.max(0.1, expansionStep);

  const radii = [];

  for (let radius = start; radius < max; radius += step) {
    radii.push(Number(radius.toFixed(2)));
  }

  if (!radii.length || radii[radii.length - 1] !== max) {
    radii.push(Number(max.toFixed(2)));
  }

  return {
    radii,
    maxRadius: Number(max.toFixed(2)),
  };
};

/**
 * Finds online + available drivers of the requested vehicle type
 * within radiusKm of the pickup point.
 *
 * Excludes drivers that have already rejected/timed out for this ride.
 *
 * When genderFilter is supplied, only drivers of that gender are returned.
 */
async function findNearbyDrivers({
  pickup,
  vehicleType,
  radiusKm,
  excludeDriverIds = [],
  genderFilter = null,
}) {
  if (
    !pickup ||
    !Number.isFinite(Number(pickup.latitude)) ||
    !Number.isFinite(Number(pickup.longitude))
  ) {
    return [];
  }

  const latitude = Number(pickup.latitude);
  const longitude = Number(pickup.longitude);
  const maxDistanceKm = Number(radiusKm);

  if (
    !Number.isFinite(maxDistanceKm) ||
    maxDistanceKm <= 0 ||
    !vehicleType
  ) {
    return [];
  }

  const normalizedExcludeIds =
    normalizeDriverIds(excludeDriverIds);

  const query = {
    isOnline: true,
    isAvailable: true,
    vehicleType,

    ...(normalizedExcludeIds.length
      ? {
        _id: {
          $nin: normalizedExcludeIds,
        },
      }
      : {}),

    // Don't consider the default/unset [0, 0] location.
    $nor: [
      {
        "currentLocation.coordinates": [0, 0],
      },
    ],

    currentLocation: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistanceKm * 1000,
      },
    },
  };

  if (genderFilter) {
    query.gender = genderFilter;
  }

  return Driver.find(query)
    .limit(20)
    .lean();
}

/**
 * Searches for suitable drivers.
 *
 * If female-driver preference is enabled:
 *
 * 1. Search only female drivers.
 * 2. Expand the radius progressively.
 * 3. Stop female-only search when FEMALE_DRIVER_SEARCH_TIMEOUT
 *    is reached.
 * 4. If no female driver is found, return noFemaleDriverFound=true.
 *
 * The caller is responsible for deciding whether to ask the passenger
 * before falling back to all eligible drivers.
 */
async function searchDriversForRide({
  pickup,
  vehicleType,
  passengerGender,
  preferFemaleDriver = false,
  excludeDriverIds = [],
  elapsedSeconds = 0,
}) {
  const {
    radii,
    maxRadius,
  } = buildRadii();

  const femaleSearchTimeout = Math.max(
    0,
    getSafeNumber(
      env.FEMALE_DRIVER_SEARCH_TIMEOUT,
      60
    )
  );

  const elapsed = Math.max(
    0,
    getSafeNumber(elapsedSeconds, 0)
  );

  const isFemalePriorityRequested =
    Boolean(preferFemaleDriver) &&
    env.FEMALE_DRIVER_PRIORITY === true;

  /*
   * Female-driver priority search
   */
  if (isFemalePriorityRequested) {
    const withinFemaleTimeout =
      elapsed < femaleSearchTimeout;

    if (withinFemaleTimeout) {
      for (const radiusKm of radii) {
        const femaleDrivers =
          await findNearbyDrivers({
            pickup,
            vehicleType,
            radiusKm,
            excludeDriverIds,
            genderFilter: GENDER.FEMALE,
          });

        if (femaleDrivers.length > 0) {
          return {
            drivers: femaleDrivers,
            radiusKm,
            matchedFemalePriority: true,
            noFemaleDriverFound: false,
          };
        }
      }
    }

    /*
     * No female driver found.
     *
     * IMPORTANT:
     * We intentionally do NOT return male drivers here.
     * rideMatchingService should decide whether to:
     *
     * - ask passenger for permission to search all drivers, or
     * - cancel/stop the search.
     */
    return {
      drivers: [],
      radiusKm: maxRadius,
      matchedFemalePriority: false,
      noFemaleDriverFound: true,
    };
  }

  /*
   * Normal search:
   * Search all eligible drivers with progressive radius.
   */
  for (const radiusKm of radii) {
    const drivers = await findNearbyDrivers({
      pickup,
      vehicleType,
      radiusKm,
      excludeDriverIds,
    });

    if (drivers.length > 0) {
      return {
        drivers,
        radiusKm,
        matchedFemalePriority: false,
        noFemaleDriverFound: false,
      };
    }
  }

  return {
    drivers: [],
    radiusKm: maxRadius,
    matchedFemalePriority: false,
    noFemaleDriverFound: false,
  };
}

module.exports = {
  findNearbyDrivers,
  searchDriversForRide,
};