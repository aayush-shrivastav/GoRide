import * as Location from 'expo-location';
import { Platform } from 'react-native';

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

const MAX_LAST_KNOWN_AGE_MS = 60 * 1000;
const MAX_ACCEPTABLE_ACCURACY_M = 100;

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    // On web, permission is granted via browser prompt automatically
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (err) {
    console.warn('Error requesting location permission:', err);
    return false;
  }
}

/** Web-only: wrap navigator.geolocation in a Promise */
function getBrowserLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
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
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

export async function getCurrentUserLocation(): Promise<UserLocation | null> {
  // ── Web path ──────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    try {
      return await getBrowserLocation();
    } catch (err) {
      console.warn('Web geolocation error:', err);
      return null;
    }
  }

  // ── Native path ───────────────────────────────────────────────────────────
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
      mayShowUserSettingsDialog: true,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };
  } catch (err) {
    console.warn('Error getting current user location:', err);

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: MAX_LAST_KNOWN_AGE_MS,
      requiredAccuracy: MAX_ACCEPTABLE_ACCURACY_M,
    });

    if (!lastKnown?.coords) return null;

    return {
      latitude: lastKnown.coords.latitude,
      longitude: lastKnown.coords.longitude,
      accuracy: lastKnown.coords.accuracy,
    };
  }
}


export async function watchUserLocation(
  callback: (location: UserLocation) => void
): Promise<Location.LocationSubscription | { remove: () => void } | null> {
  // ── Web path ──────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    if (!navigator?.geolocation) return null;
    const watchId = navigator.geolocation.watchPosition(
      (pos) =>
        callback({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => console.warn('Web watch position error:', err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    // Return an object with .remove() so callers can clean up
    return { remove: () => navigator.geolocation.clearWatch(watchId) };
  }

  // ── Native path ───────────────────────────────────────────────────────────
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    return await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 2000,
        distanceInterval: 5,
      },
      (loc) => {
        callback({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
        });
      }
    );
  } catch (err) {
    console.warn('Error watching position:', err);
    return null;
  }
}
