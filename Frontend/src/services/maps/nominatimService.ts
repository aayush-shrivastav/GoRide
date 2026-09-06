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

  try {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];

    const data: NominatimPlace[] = await res.json();
    return data.map((item) => ({
      address: item.display_name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    }));
  } catch (err) {
    console.warn('Nominatim location search failed:', err);
    return [];
  }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return `Location near (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

    const data = await res.json();
    return data.display_name || `Location near (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
  } catch (err) {
    console.warn('Nominatim reverse geocoding failed:', err);
    return `Location near (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
  }
}
