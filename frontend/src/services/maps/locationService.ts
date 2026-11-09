import * as Location from 'expo-location';
import { Platform } from 'react-native';

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  city?: string;
}

const DEFAULT_FALLBACK_LOCATION: UserLocation = {
  latitude: 28.6139,
  longitude: 77.2090,
  accuracy: 100,
};

// In-memory cache so subsequent taps/renders get instant location
let cachedUserLocation: UserLocation | null = null;

export function getLastKnownLocation(): UserLocation | null {
  return cachedUserLocation;
}

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status === 'granted') {
      return true;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (err) {
    console.warn('[Location] Error requesting permission:', err);
    return false;
  }
}

/**
 * Fallback to IP-based location (works on any browser, PC, or emulator without GPS).
 */
async function fetchIpLocation(): Promise<UserLocation | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('https://ipwho.is/', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success !== false && data.latitude && data.longitude) {
        return {
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          accuracy: 1000,
          city: data.city || data.region,
        };
      }
    }
  } catch (err) {
    // Silently proceed to second fallback
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('https://freeipapi.com/api/json', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.latitude && data.longitude) {
        return {
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          accuracy: 1000,
          city: data.cityName,
        };
      }
    }
  } catch (err) {
    // Ignore
  }

  return null;
}

/** Web-only helper to run navigator.geolocation with custom options */
function queryBrowserPosition(highAccuracy: boolean, timeoutMs: number): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 300000 }
    );
  });
}

/**
 * Robust web geolocation:
 * 1. Standard accuracy first (queries OS Wi-Fi positioning, fast on Windows desktop)
 * 2. If it times out or fails, try high accuracy
 * 3. Fallback to IP location
 * 4. Fallback to cached/default location
 */
async function getBrowserLocation(): Promise<UserLocation> {
  // Step 1: Standard accuracy first (works fast on desktop / Wi-Fi)
  try {
    const pos = await queryBrowserPosition(false, 3500);
    cachedUserLocation = pos;
    return pos;
  } catch (e1) {
    // Step 2: Low-power / standard accuracy
    try {
      const pos = await queryBrowserPosition(true, 3000);
      cachedUserLocation = pos;
      return pos;
    } catch (e2) {
      console.warn('[Location] Browser GPS unavailable, falling back to IP location...');
    }
  }

  // Step 3: IP-based location fallback
  const ipLoc = await fetchIpLocation();
  if (ipLoc) {
    cachedUserLocation = ipLoc;
    return ipLoc;
  }

  // Step 4: Return cached location or default fallback
  return cachedUserLocation || DEFAULT_FALLBACK_LOCATION;
}

export async function getCurrentUserLocation(): Promise<UserLocation | null> {
  // ── Web path ──────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    try {
      const loc = await getBrowserLocation();
      cachedUserLocation = loc;
      return loc;
    } catch (err) {
      console.warn('[Location] Web geolocation error:', err);
      return cachedUserLocation || DEFAULT_FALLBACK_LOCATION;
    }
  }

  // ── Native path (Android / iOS) ───────────────────────────────────────────
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      // If native permission was denied, fall back to IP location for dev
      const ipLoc = await fetchIpLocation();
      if (ipLoc) {
        cachedUserLocation = ipLoc;
        return ipLoc;
      }
      return cachedUserLocation || DEFAULT_FALLBACK_LOCATION;
    }

    // Step 1: Check last known position immediately (instant response, non-blocking)
    let lastKnownLoc: UserLocation | null = null;
    try {
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 3600000,
      });
      if (lastKnown?.coords) {
        lastKnownLoc = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          accuracy: lastKnown.coords.accuracy,
        };
        cachedUserLocation = lastKnownLoc;
      }
    } catch {
      // Proceed to fresh location
    }

    // Step 2: Race fresh position against a 5-second timeout
    // Prevents app freezing indefinitely indoors or in emulators
    try {
      const freshLocation = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Location request timed out after 5s')), 5000)
        ),
      ]);

      if (freshLocation?.coords) {
        const loc: UserLocation = {
          latitude: freshLocation.coords.latitude,
          longitude: freshLocation.coords.longitude,
          accuracy: freshLocation.coords.accuracy,
        };
        cachedUserLocation = loc;
        return loc;
      }
    } catch (freshErr) {
      console.warn('[Location] Fresh GPS timed out or failed, using fallback:', freshErr);
      if (lastKnownLoc) {
        return lastKnownLoc;
      }
    }

    // Return last known location if fresh GPS timed out
    if (lastKnownLoc) {
      return lastKnownLoc;
    }

    // Step 3: Fallback to IP location
    const ipLoc = await fetchIpLocation();
    if (ipLoc) {
      cachedUserLocation = ipLoc;
      return ipLoc;
    }

    return cachedUserLocation || DEFAULT_FALLBACK_LOCATION;
  } catch (err) {
    console.warn('[Location] Error getting current user location, trying fallback:', err);

    const ipLoc = await fetchIpLocation();
    if (ipLoc) {
      cachedUserLocation = ipLoc;
      return ipLoc;
    }

    return cachedUserLocation || DEFAULT_FALLBACK_LOCATION;
  }
}

export async function watchUserLocation(
  callback: (location: UserLocation) => void
): Promise<Location.LocationSubscription | { remove: () => void } | null> {
  // ── Web path ──────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc: UserLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        cachedUserLocation = loc;
        callback(loc);
      },
      (err) => console.warn('[Location] Web watch position error:', err.message),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10000 }
    );
    return { remove: () => navigator.geolocation.clearWatch(watchId) };
  }

  // ── Native path ───────────────────────────────────────────────────────────
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    return await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 3000,
        distanceInterval: 10,
      },
      (loc) => {
        const userLoc: UserLocation = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
        };
        cachedUserLocation = userLoc;
        callback(userLoc);
      }
    );
  } catch (err) {
    console.warn('[Location] Error watching position:', err);
    return null;
  }
}
