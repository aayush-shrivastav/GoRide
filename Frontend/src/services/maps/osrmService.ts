export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: LatLng[];
  distanceKm: number;
  durationMin: number;
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
