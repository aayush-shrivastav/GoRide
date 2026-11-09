/**
 * placeSearchService.ts
 *
 * Enhanced place search for Voice Destination feature.
 *
 * Priority chain:
 *   1. LocationIQ Free API   (5,000 req/day free — very fast, great India accuracy)
 *   2. Mapbox Free API       (100,000 req/month free — fuzzy match, proximity bias)
 *   3. GoRide Backend Proxy  (existing /api/maps/search → Nominatim)
 *   4. Direct Nominatim      (final fallback for native mobile)
 *
 * No API key = graceful fallback to existing nominatimService behaviour.
 * Keys are optional EXPO_PUBLIC_* env vars — no backend restart required.
 */

import { Config } from '../../constants/config';
import { searchLocation } from './nominatimService';

export interface PlaceResult {
  address: string;
  latitude: number;
  longitude: number;
}

// ── Optional free API keys ─────────────────────────────────────────────────
// Set EXPO_PUBLIC_LOCATIONIQ_KEY in Frontend/.env for LocationIQ (5k/day free)
// Set EXPO_PUBLIC_MAPBOX_KEY in Frontend/.env for Mapbox (100k/month free)
const LOCATIONIQ_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY || '';
const MAPBOX_KEY = process.env.EXPO_PUBLIC_MAPBOX_KEY || '';

const NOMINATIM_BASE =
  process.env.EXPO_PUBLIC_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

const OSM_HEADERS = {
  'User-Agent': 'GoRideMobileApp/1.0 (contact@goride.app)',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── 1. LocationIQ ─────────────────────────────────────────────────────────
async function searchLocationIQ(
  query: string,
  userLat?: number,
  userLng?: number
): Promise<PlaceResult[]> {
  if (!LOCATIONIQ_KEY) return [];
  try {
    // proximity param biases results towards user's current GPS position
    const proximityParam =
      userLat != null && userLng != null
        ? `&lat=${userLat}&lon=${userLng}`
        : '';
    const url =
      `https://us1.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_KEY}` +
      `&q=${encodeURIComponent(query)}&countrycodes=in&limit=5&dedupe=1${proximityParam}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any) => ({
      address: item.display_name || item.display_place || '',
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    })).filter(r => r.address && !isNaN(r.latitude));
  } catch {
    return [];
  }
}

// ── 2. Mapbox ─────────────────────────────────────────────────────────────
async function searchMapbox(
  query: string,
  userLat?: number,
  userLng?: number
): Promise<PlaceResult[]> {
  if (!MAPBOX_KEY) return [];
  try {
    const proximityParam =
      userLat != null && userLng != null
        ? `&proximity=${userLng},${userLat}`
        : '';
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?country=in&limit=5&access_token=${MAPBOX_KEY}${proximityParam}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.features)) return [];

    return data.features.map((f: any) => ({
      address: f.place_name || '',
      latitude: f.center?.[1] ?? 0,
      longitude: f.center?.[0] ?? 0,
    })).filter((r: PlaceResult) => !!r.address);
  } catch {
    return [];
  }
}

// ── 3. Backend Autocomplete Proxy (keys kept server-side safely) ──────────
async function searchViaBackendAutocomplete(
  query: string,
  userLat?: number,
  userLng?: number
): Promise<PlaceResult[]> {
  try {
    const coordsParam =
      userLat != null && userLng != null ? `&lat=${userLat}&lng=${userLng}` : '';
    const url = `${Config.API_BASE_URL}/maps/places-autocomplete?q=${encodeURIComponent(query.trim())}${coordsParam}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return [];
    const json = await res.json();
    if (Array.isArray(json?.data) && json.data.length > 0) {
      return json.data as PlaceResult[];
    }
    return [];
  } catch {
    return [];
  }
}

// ── 4. Backend Proxy (existing /api/maps/search → Nominatim) ─────────────
async function searchViaBackend(query: string): Promise<PlaceResult[]> {
  try {
    const url = `${Config.API_BASE_URL}/maps/search?q=${encodeURIComponent(query.trim())}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return [];
    const json = await res.json();
    if (Array.isArray(json?.data) && json.data.length > 0) {
      return json.data as PlaceResult[];
    }
    return [];
  } catch {
    return [];
  }
}

// ── 4. Direct Nominatim ───────────────────────────────────────────────────
async function searchNominatimDirect(query: string): Promise<PlaceResult[]> {
  try {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=in`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { headers: OSM_HEADERS, signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any) => ({
      address: item.display_name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    }));
  } catch {
    return [];
  }
}

/**
 * Main search function for Voice Destination Search.
 *
 * @param query       - Clean place name (after carrier phrase removal)
 * @param userLat     - User's current latitude (for proximity bias)
 * @param userLng     - User's current longitude (for proximity bias)
 * @returns           - Sorted list of PlaceResult (best match first)
 */
export async function searchPlacesFast(
  query: string,
  userLat?: number,
  userLng?: number
): Promise<PlaceResult[]> {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();

  // Priority 1: Backend proxy (LocationIQ / Mapbox keys kept server-side securely)
  const backendAutoResults = await searchViaBackendAutocomplete(q, userLat, userLng);
  if (backendAutoResults.length > 0) return backendAutoResults;

  // Priority 2: Client-side LocationIQ (if EXPO_PUBLIC_LOCATIONIQ_KEY set)
  const locationIQResults = await searchLocationIQ(q, userLat, userLng);
  if (locationIQResults.length > 0) return locationIQResults;

  // Priority 3: Client-side Mapbox (if EXPO_PUBLIC_MAPBOX_KEY set)
  const mapboxResults = await searchMapbox(q, userLat, userLng);
  if (mapboxResults.length > 0) return mapboxResults;

  // Priority 4: Backend Nominatim proxy (existing route)
  const backendResults = await searchViaBackend(q);
  if (backendResults.length > 0) return backendResults;

  // Priority 5: Direct Nominatim (native only, no CORS)
  const nominatimResults = await searchNominatimDirect(q);
  if (nominatimResults.length > 0) return nominatimResults;

  // Priority 6: Absolute last resort — existing nominatimService
  return await searchLocation(q);
}

export interface VoiceTranscribeResult {
  transcript: string;
  cleanQuery: string;
  places: PlaceResult[];
  provider?: string;
  message?: string;
}

/**
 * Transcribe recorded voice audio via backend Whisper API
 * and simultaneously retrieve matching destination places in one single roundtrip!
 */
export async function transcribeVoiceAndSearch(
  audioBase64: string,
  language: string = 'hi',
  userLat?: number,
  userLng?: number
): Promise<VoiceTranscribeResult> {
  try {
    const url = `${Config.API_BASE_URL}/maps/voice-transcribe`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64,
        language,
        lat: userLat,
        lng: userLng,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { transcript: '', cleanQuery: '', places: [] };
    }
    const json = await res.json();
    return {
      transcript: json?.data?.transcript || '',
      cleanQuery: json?.data?.cleanQuery || '',
      places: Array.isArray(json?.data?.places) ? json.data.places : [],
      provider: json?.data?.provider,
      message: json?.message,
    };
  } catch (err) {
    console.warn('[placeSearchService] transcribeVoiceAndSearch error:', err);
    return { transcript: '', cleanQuery: '', places: [] };
  }
}

