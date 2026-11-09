export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: LatLng[];
  distanceKm: number;
  durationMin: number;
}

export interface RouteAlternative {
  coordinates: LatLng[];
  distanceKm: number;
  durationMin: number;
  label: string; // e.g. "Fastest", "Shortest", "Alternative", "Longer Route"
  diffMin?: number;
  diffKm?: number;
  isShortest?: boolean;
  isFastest?: boolean;
}

const OSRM_BASE = process.env.EXPO_PUBLIC_OSRM_URL || 'https://router.project-osrm.org';

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function fetchOSRMRoute(origin: LatLng, destination: LatLng): Promise<RouteResult> {
  return fetchOSRMRouteThroughPoints([origin, destination]);
}

export async function fetchOSRMRouteThroughPoints(points: LatLng[]): Promise<RouteResult> {
  const routePoints = points.filter(Boolean);
  if (routePoints.length < 2) {
    return {
      coordinates: routePoints,
      distanceKm: 0,
      durationMin: 0,
    };
  }

  try {
    const coordinatesParam = routePoints.map((p) => `${p.longitude},${p.latitude}`).join(';');
    const url = `${OSRM_BASE}/route/v1/driving/${coordinatesParam}?overview=full&geometries=geojson`;
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const rawCoords: [number, number][] = route.geometry.coordinates;

        const coordinates: LatLng[] = rawCoords.map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        }));

        const distanceKm = Number((route.distance / 1000).toFixed(2));
        const durationMin = Number((route.duration / 60).toFixed(1));

        return {
          coordinates,
          distanceKm: Math.max(0.5, distanceKm),
          durationMin: Math.max(1, durationMin),
        };
      }
    }
  } catch (err) {
    console.warn('OSRM routing failed, falling back to direct straight line:', err);
  }

  // Fallback straight-line polyline if OSRM endpoint is temporarily unreachable
  let roadKm = 0;
  for (let i = 0; i < routePoints.length - 1; i += 1) {
    roadKm += haversineKm(routePoints[i], routePoints[i + 1]) * 1.3;
  }
  const durationMin = (roadKm / 30) * 60;

  return {
    coordinates: routePoints,
    distanceKm: Number(Math.max(0.5, roadKm).toFixed(2)),
    durationMin: Number(Math.max(1, durationMin).toFixed(1)),
  };
}

/**
 * Fetches multiple route alternatives from OSRM (up to 3 routes).
 * Guarantees shortest route vs fastest / longer alternative comparisons (like Google Maps).
 * If OSRM returns only 1 route, intelligently queries alternative corridor detours.
 */
export async function fetchAllOSRMRoutes(
  origin: LatLng,
  destination: LatLng
): Promise<RouteAlternative[]> {
  try {
    const coordParam = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${OSRM_BASE}/route/v1/driving/${coordParam}?overview=full&geometries=geojson&alternatives=3`;
    const res = await fetch(url);

    let parsedRoutes: Array<{ coordinates: LatLng[]; distanceKm: number; durationMin: number }> = [];

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        parsedRoutes = data.routes.map((route: any) => {
          const rawCoords: [number, number][] = route.geometry.coordinates;
          const coordinates: LatLng[] = rawCoords.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }));
          return {
            coordinates,
            distanceKm: Number(Math.max(0.5, route.distance / 1000).toFixed(2)),
            durationMin: Number(Math.max(1, route.duration / 60).toFixed(1)),
          };
        });
      }
    }

    // If OSRM returned only 1 route, synthesize realistic alternative corridors via perpendicular waypoints
    if (parsedRoutes.length <= 1) {
      const directDist = haversineKm(origin, destination);
      if (directDist > 0.8) {
        const dLat = destination.latitude - origin.latitude;
        const dLng = destination.longitude - origin.longitude;

        // Offset 1: North/West detour
        const midLat1 = (origin.latitude + destination.latitude) / 2 + (-dLng * 0.12);
        const midLng1 = (origin.longitude + destination.longitude) / 2 + (dLat * 0.12);

        // Offset 2: South/East detour
        const midLat2 = (origin.latitude + destination.latitude) / 2 - (-dLng * 0.12);
        const midLng2 = (origin.longitude + destination.longitude) / 2 - (dLat * 0.12);

        const [altRes1, altRes2] = await Promise.all([
          fetchOSRMRouteThroughPoints([origin, { latitude: midLat1, longitude: midLng1 }, destination]).catch(() => null),
          fetchOSRMRouteThroughPoints([origin, { latitude: midLat2, longitude: midLng2 }, destination]).catch(() => null),
        ]);

        if (altRes1 && altRes1.coordinates.length > 2) {
          parsedRoutes.push(altRes1);
        }
        if (altRes2 && altRes2.coordinates.length > 2) {
          parsedRoutes.push(altRes2);
        }
      }
    }

    if (parsedRoutes.length > 0) {
      // Find minimum duration & minimum distance
      const minDuration = Math.min(...parsedRoutes.map(r => r.durationMin));
      const minDistance = Math.min(...parsedRoutes.map(r => r.distanceKm));

      // Sort with fastest first
      const sorted = [...parsedRoutes].sort((a, b) => a.durationMin - b.durationMin);

      return sorted.slice(0, 3).map((route, idx) => {
        const isFastest = Math.abs(route.durationMin - minDuration) < 0.5;
        const isShortest = Math.abs(route.distanceKm - minDistance) < 0.2;
        const diffMin = Math.max(0, Math.round(route.durationMin - minDuration));
        const diffKm = Number(Math.max(0, route.distanceKm - minDistance).toFixed(1));

        let label = 'Alternative Route';
        if (isFastest && isShortest) {
          label = '⚡ Fastest & Shortest';
        } else if (isFastest) {
          label = '⚡ Fastest Route';
        } else if (isShortest) {
          label = '📏 Shortest Route';
        } else if (idx === 1) {
          label = '🛣️ Alternative Route';
        } else {
          label = '🔄 Longer Route';
        }

        return {
          coordinates: route.coordinates,
          distanceKm: route.distanceKm,
          durationMin: route.durationMin,
          label,
          diffMin,
          diffKm,
          isFastest,
          isShortest,
        };
      });
    }
  } catch (err) {
    console.warn('[OSRM] Alternative routes fetch failed:', err);
  }

  // Final fallback: single direct route
  const single = await fetchOSRMRouteThroughPoints([origin, destination]);
  return [{ ...single, label: '⚡ Fastest Route', diffMin: 0, diffKm: 0, isFastest: true, isShortest: true }];
}
