// Uses Node 18+ global fetch — OpenStreetMap (Nominatim & OSRM) mapping service.
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const env = require("../config/env");

const NOMINATIM_BASE = env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";
const OSRM_BASE = env.OSRM_BASE_URL || "http://router.project-osrm.org";


const HEADERS = {
  "User-Agent": "GoRideApp/1.0 (contact@goride.app)",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Great-circle distance in km between two lat/lng points. */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Forward geocode a free-text address into { latitude, longitude, formattedAddress } using Nominatim. */
async function geocodeAddress(address) {
  try {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new AppError("Failed to reach Nominatim geocoding service", 502);

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new AppError("Address could not be geocoded", 422);
    }

    return {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
      formattedAddress: data[0].display_name,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err }, "Nominatim geocoding failed");
    throw new AppError("Geocoding service unavailable", 502);
  }
}

/** Reverse geocode coordinates into a human-readable address using Nominatim. */
async function reverseGeocode(latitude, longitude) {
  try {
    const url = `${NOMINATIM_BASE}/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return `Location near (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

    const data = await res.json();
    return data.display_name || `Location near (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
  } catch (err) {
    logger.warn({ err }, "Nominatim reverse geocoding fallback used");
    return `Location near (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
  }
}

/**
 * Get driving distance (km) and duration (minutes) between two points
 * using OSRM API (with Haversine fallback).
 */
async function getDistanceAndDuration(origin, destination) {
  try {
    const url = `${OSRM_BASE}/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=false`;
    const res = await fetch(url, { headers: HEADERS });

    if (res.ok) {
      const data = await res.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceKm = Number((route.distance / 1000).toFixed(2));
        const durationMin = Number((route.duration / 60).toFixed(1));
        return { distanceKm: Math.max(0.5, distanceKm), durationMin: Math.max(1, durationMin) };
      }
    }
  } catch (err) {
    logger.warn({ err }, "OSRM routing failed, calculating via Haversine fallback");
  }

  // Haversine fallback if OSRM service is unreachable
  const straightKm = haversineKm(origin, destination);
  const roadKm = straightKm * 1.3; // Road correction factor
  const durationMin = (roadKm / 30) * 60; // Assumed 30 km/h average speed in city
  return {
    distanceKm: Number(Math.max(0.5, roadKm).toFixed(2)),
    durationMin: Number(Math.max(1, durationMin).toFixed(1)),
  };
}

async function getDistanceAndDurationForRoute(points) {
  const routePoints = (points || []).filter(Boolean);
  if (routePoints.length < 2) {
    throw new AppError("At least two route points are required", 400);
  }

  try {
    const coordinates = routePoints.map((p) => `${p.longitude},${p.latitude}`).join(";");
    const url = `${OSRM_BASE}/route/v1/driving/${coordinates}?overview=false`;
    const res = await fetch(url, { headers: HEADERS });

    if (res.ok) {
      const data = await res.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceKm = Number((route.distance / 1000).toFixed(2));
        const durationMin = Number((route.duration / 60).toFixed(1));
        return { distanceKm: Math.max(0.5, distanceKm), durationMin: Math.max(1, durationMin) };
      }
    }
  } catch (err) {
    logger.warn({ err }, "OSRM multi-point routing failed, using segmented fallback");
  }

  let distanceKm = 0;
  let durationMin = 0;
  for (let i = 0; i < routePoints.length - 1; i += 1) {
    const leg = await getDistanceAndDuration(routePoints[i], routePoints[i + 1]);
    distanceKm += leg.distanceKm;
    durationMin += leg.durationMin;
  }

  return {
    distanceKm: Number(Math.max(0.5, distanceKm).toFixed(2)),
    durationMin: Number(Math.max(1, durationMin).toFixed(1)),
  };
}

function isMockMode() {
  return false;
}

module.exports = { geocodeAddress, reverseGeocode, getDistanceAndDuration, getDistanceAndDurationForRoute, haversineKm, isMockMode };
