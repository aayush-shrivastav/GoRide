import { Config } from '../../constants/config';

export interface NominatimPlace {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: string[];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
}

const NOMINATIM_BASE = process.env.EXPO_PUBLIC_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

const HEADERS = {
  'User-Agent': 'GoRideMobileApp/1.0 (contact@goride.app)',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function searchLocation(query: string): Promise<Array<{ address: string; latitude: number; longitude: number }>> {
  if (!query || query.trim().length < 2) return [];

  // 1. Try via backend proxy (avoids browser CORS & Nominatim 403 Forbidden on Web)
  try {
    const backendUrl = `${Config.API_BASE_URL}/maps/search?q=${encodeURIComponent(query.trim())}`;
    const res = await fetch(backendUrl);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data) && json.data.length > 0) {
        return json.data;
      }
    }
  } catch (err) {
    // Silently fallback to direct Nominatim
  }

  // 2. Direct Nominatim fallback (works on native iOS/Android)
  try {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const data: NominatimPlace[] = await res.json();
      if (Array.isArray(data)) {
        return data.map((item) => ({
          address: item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        }));
      }
    }
  } catch (err) {
    console.warn('[Nominatim] Search failed:', err);
  }

  return [];
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const fallbackStr = `Location near (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

  // 1. Try via backend proxy
  try {
    const backendUrl = `${Config.API_BASE_URL}/maps/reverse-geocode?lat=${latitude}&lon=${longitude}`;
    const res = await fetch(backendUrl);
    if (res.ok) {
      const json = await res.json();
      if (json?.data?.address) {
        return json.data.address;
      }
    }
  } catch (err) {
    // Proceed to next fallback
  }

  // 2. Client-side reverse geocoding via BigDataCloud (works in all browsers without 403)
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}`;
    const res = await fetch(bdcUrl);
    if (res.ok) {
      const data = await res.json();
      const parts = [data.locality, data.city, data.principalSubdivision, data.countryName].filter(Boolean);
      if (parts.length > 0) {
        return parts.join(', ');
      }
    }
  } catch (err) {
    // Proceed to next fallback
  }

  // 3. Direct Nominatim fallback
  try {
    const url = `${NOMINATIM_BASE}/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const data = await res.json();
      if (data.display_name) return data.display_name;
    }
  } catch (err) {
    console.warn('[Nominatim] Reverse geocoding failed:', err);
  }

  return fallbackStr;
}
