import React, { forwardRef, useImperativeHandle, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LatLng } from '../../services/maps/osrmService';

// ---------- Public ref API ----------
export interface MapContainerRef {
  flyTo: (center: [number, number], zoom?: number) => void;
  fitBounds: (coords: LatLng[], padding?: number) => void;
}

// ---------- Props ----------
export interface AlternativeRoute {
  coordinates: LatLng[];
  distanceKm: number;
  durationMin: number;
  label: string;
  diffMin?: number;
  diffKm?: number;
  isFastest?: boolean;
  isShortest?: boolean;
}

interface MapContainerProps {
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  region?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onRegionChangeComplete?: (region: any) => void;
  onPress?: (event: any) => void;
  onSelectRoute?: (index: number) => void;
  children?: React.ReactNode;
  routeCoordinates?: LatLng[];
  alternativeRoutes?: AlternativeRoute[];
  activeRouteIndex?: number;
  pickupLocation?: LatLng | null;
  dropLocation?: LatLng | null;
  stopLocations?: LatLng[];
  userLocation?: LatLng | null;
  driverLocation?: LatLng | null;
  drivers?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    vehicleType?: string;
  }>;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
}

function getLeafletWebHtml(initLat: number, initLng: number) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body, #map {
      width: 100%; height: 100%; margin: 0; padding: 0;
      background-color: #e5e3df;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .leaflet-control-zoom {
      border: none !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
      border-radius: 8px !important;
      overflow: hidden;
    }
    .leaflet-control-zoom a {
      width: 36px !important;
      height: 36px !important;
      line-height: 36px !important;
      font-size: 18px !important;
      color: #444 !important;
      background: #fff !important;
    }
    .leaflet-control-attribution { display: none !important; }
    .gmap-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 14px rgba(0,0,0,0.35);
      border: 3px solid white;
      cursor: pointer;
      transition: transform 0.2s ease;
    }
    .gmap-marker-inner {
      transform: rotate(45deg);
      font-size: 18px;
      line-height: 1;
    }
    .pickup-pin  { width: 40px; height: 40px; background: #34C759; }
    .drop-pin    { width: 40px; height: 40px; background: #FF3B30; }
    .driver-pin  { width: 44px; height: 44px; background: #007AFF; border-color: #fff; box-shadow: 0 3px 18px rgba(0,122,255,0.5); }
    .stop-pin    { width: 36px; height: 36px; background: #FF9500; }
    .nearby-pin  { width: 32px; height: 32px; background: #32ADE6; border-width: 2px; }
    .user-dot-outer {
      width: 20px; height: 20px;
      border-radius: 50%;
      background: rgba(0, 122, 255, 0.25);
      border: 2px solid rgba(0, 122, 255, 0.5);
      display: flex; align-items: center; justify-content: center;
      animation: pulse 2s infinite;
    }
    .user-dot-inner {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #007AFF;
      border: 2px solid white;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 6px rgba(0,122,255,0.12); }
      50%       { box-shadow: 0 0 0 14px rgba(0,122,255,0.06); }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    let map = null;
    let isInitialCameraSet = false;

    // Persistent markers to prevent reload flicker
    let userMarker = null;
    let pickupMarker = null;
    let dropMarker = null;
    let driverMarker = null;
    let stopMarkers = [];
    let nearbyMarkersMap = {};
    let activeRoutePolyline = null;
    let activeRouteShadow = null;
    let activeRouteBadge = null;
    let alternativePolylines = [];
    let alternativeBadges = [];

    function sendToParent(msg) {
      window.parent.postMessage(msg, '*');
    }

    function makePin(cls, emoji) {
      return L.divIcon({
        className: '',
        html: '<div class="gmap-marker ' + cls + '"><span class="gmap-marker-inner">' + emoji + '</span></div>',
        iconSize: [44, 44],
        iconAnchor: [20, 44],
        popupAnchor: [0, -44],
      });
    }

    function makeUserDot() {
      return L.divIcon({
        className: '',
        html: '<div class="user-dot-outer"><div class="user-dot-inner"></div></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
    }

    function makeNearbyPin(emoji) {
      return L.divIcon({
        className: '',
        html: '<div class="gmap-marker nearby-pin"><span class="gmap-marker-inner" style="font-size:14px">' + emoji + '</span></div>',
        iconSize: [34, 34],
        iconAnchor: [15, 34],
        popupAnchor: [0, -34],
      });
    }

    map = L.map('map', {
      zoomControl: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 80,
      attributionControl: false,
    }).setView([${initLat}, ${initLng}], 14);

    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    map.on('moveend', function() {
      const center = map.getCenter();
      const bounds = map.getBounds();
      sendToParent({
        type: 'regionChange',
        region: {
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: Math.abs(bounds.getNorth() - bounds.getSouth()),
          longitudeDelta: Math.abs(bounds.getEast() - bounds.getWest()),
        }
      });
    });

    map.on('click', function(e) {
      sendToParent({
        type: 'mapClick',
        coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng }
      });
    });

    function renderMap(data) {
      if (!data || !map) return;
      const bounds = [];

      // User location
      if (data.userLocation && data.userLocation.latitude && data.userLocation.longitude) {
        const latlng = [data.userLocation.latitude, data.userLocation.longitude];
        bounds.push(latlng);
        if (!userMarker) {
          userMarker = L.marker(latlng, { icon: makeUserDot(), zIndexOffset: 200 }).addTo(map);
        } else {
          userMarker.setLatLng(latlng);
        }
      } else if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
      }

      // Pickup
      if (data.pickupLocation && data.pickupLocation.latitude && data.pickupLocation.longitude) {
        const latlng = [data.pickupLocation.latitude, data.pickupLocation.longitude];
        bounds.push(latlng);
        if (!pickupMarker) {
          pickupMarker = L.marker(latlng, { icon: makePin('pickup-pin', '🧍'), zIndexOffset: 300 }).addTo(map);
        } else {
          pickupMarker.setLatLng(latlng);
        }
      } else if (pickupMarker) {
        map.removeLayer(pickupMarker);
        pickupMarker = null;
      }

      // Stops
      const stops = data.stopLocations || [];
      while (stopMarkers.length > stops.length) {
        const m = stopMarkers.pop();
        map.removeLayer(m);
      }
      stops.forEach((stop, i) => {
        const latlng = [stop.latitude, stop.longitude];
        bounds.push(latlng);
        if (stopMarkers[i]) {
          stopMarkers[i].setLatLng(latlng);
        } else {
          const m = L.marker(latlng, { icon: makePin('stop-pin', (i + 1).toString()), zIndexOffset: 250 }).addTo(map);
          stopMarkers.push(m);
        }
      });

      // Drop
      if (data.dropLocation && data.dropLocation.latitude && data.dropLocation.longitude) {
        const latlng = [data.dropLocation.latitude, data.dropLocation.longitude];
        bounds.push(latlng);
        if (!dropMarker) {
          dropMarker = L.marker(latlng, { icon: makePin('drop-pin', '🏁'), zIndexOffset: 300 }).addTo(map);
        } else {
          dropMarker.setLatLng(latlng);
        }
      } else if (dropMarker) {
        map.removeLayer(dropMarker);
        dropMarker = null;
      }

      // Live Driver Car Marker (Smooth movements without map reload)
      if (data.driverLocation && data.driverLocation.latitude && data.driverLocation.longitude) {
        const latlng = [data.driverLocation.latitude, data.driverLocation.longitude];
        bounds.push(latlng);
        if (!driverMarker) {
          driverMarker = L.marker(latlng, { icon: makePin('driver-pin', '🚗'), zIndexOffset: 500 }).addTo(map);
        } else {
          driverMarker.setLatLng(latlng);
        }
      } else if (driverMarker) {
        map.removeLayer(driverMarker);
        driverMarker = null;
      }

      // Nearby drivers
      const currentDrivers = data.drivers || [];
      const currentIds = new Set();
      currentDrivers.forEach(d => {
        currentIds.add(d.id);
        const latlng = [d.latitude, d.longitude];
        bounds.push(latlng);
        if (nearbyMarkersMap[d.id]) {
          nearbyMarkersMap[d.id].setLatLng(latlng);
        } else {
          const emoji = { bike: '🛵', auto: '🛺', car: '🚗', suv: '🚙' }[d.vehicleType] || '🚗';
          const m = L.marker(latlng, { icon: makeNearbyPin(emoji), zIndexOffset: 100 }).addTo(map);
          nearbyMarkersMap[d.id] = m;
        }
      });
      Object.keys(nearbyMarkersMap).forEach(id => {
        if (!currentIds.has(id)) {
          map.removeLayer(nearbyMarkersMap[id]);
          delete nearbyMarkersMap[id];
        }
      });

      // Routes
      renderRoutes(data, bounds);

      // Initial Camera Fit (Only once on first load)
      if (!isInitialCameraSet) {
        isInitialCameraSet = true;
        if (data.region) {
          map.setView([data.region.latitude, data.region.longitude], 14);
        } else if (bounds.length > 0) {
          if (bounds.length === 1) {
            map.setView(bounds[0], 15);
          } else {
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
          }
        }
      }
    }

    function renderRoutes(data, bounds) {
      alternativePolylines.forEach(p => map.removeLayer(p));
      alternativePolylines = [];
      alternativeBadges.forEach(b => map.removeLayer(b));
      alternativeBadges = [];

      if (data.alternativeRoutes && data.alternativeRoutes.length > 0) {
        const routeColors = ['#1A73E8', '#F97316', '#8B5CF6'];
        const activeIdx = data.activeRouteIndex ?? 0;

        // Inactive routes
        data.alternativeRoutes.forEach((route, idx) => {
          if (idx === activeIdx) return;
          if (!route.coordinates || route.coordinates.length < 2) return;
          const pts = route.coordinates.map(c => [c.latitude, c.longitude]);
          const poly = L.polyline(pts, {
            color: '#94A3B8',
            weight: 5,
            opacity: 0.8,
            lineJoin: 'round',
            lineCap: 'round',
            dashArray: '6 8'
          }).addTo(map);

          poly.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            sendToParent({ type: 'selectRoute', index: idx });
          });
          alternativePolylines.push(poly);

          if (pts.length > 0) {
            const mid = pts[Math.floor(pts.length / 2)];
            const labelText = route.diffMin ? ('+' + route.diffMin + ' min') : (Math.round(route.durationMin) + ' min');
            const badge = L.marker(mid, {
              icon: L.divIcon({
                className: '',
                html: '<div style="background:#475569;color:#fff;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer">' + labelText + '</div>',
                iconAnchor: [30, 12],
              }),
              zIndexOffset: 40,
            }).addTo(map);

            badge.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              sendToParent({ type: 'selectRoute', index: idx });
            });
            alternativeBadges.push(badge);
          }
        });

        // Active route
        const activeRoute = data.alternativeRoutes[activeIdx];
        if (activeRoute && activeRoute.coordinates && activeRoute.coordinates.length > 1) {
          const pts = activeRoute.coordinates.map(c => [c.latitude, c.longitude]);
          const color = routeColors[activeIdx] || '#1A73E8';

          if (!activeRouteShadow) {
            activeRouteShadow = L.polyline(pts, { color: '#FFFFFF', weight: 10, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);
          } else {
            activeRouteShadow.setLatLngs(pts);
          }

          if (!activeRoutePolyline) {
            activeRoutePolyline = L.polyline(pts, { color: color, weight: 6, opacity: 1.0, lineJoin: 'round', lineCap: 'round' }).addTo(map);
          } else {
            activeRoutePolyline.setStyle({ color: color });
            activeRoutePolyline.setLatLngs(pts);
          }

          if (activeRouteBadge) {
            map.removeLayer(activeRouteBadge);
            activeRouteBadge = null;
          }
          const mid = pts[Math.floor(pts.length / 2)];
          const mins = Math.round(activeRoute.durationMin);
          const km = activeRoute.distanceKm.toFixed(1);
          activeRouteBadge = L.marker(mid, {
            icon: L.divIcon({
              className: '',
              html: '<div style="background:' + color + ';color:#fff;padding:3px 9px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35)">' + mins + ' min · ' + km + ' km</div>',
              iconAnchor: [50, 14],
            }),
            zIndexOffset: 60,
          }).addTo(map);

          pts.forEach(p => bounds.push(p));
        }
      } else if (data.routeCoordinates && data.routeCoordinates.length > 1) {
        const pts = data.routeCoordinates.map(c => [c.latitude, c.longitude]);
        if (!activeRouteShadow) {
          activeRouteShadow = L.polyline(pts, { color: '#FFFFFF', weight: 10, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        } else {
          activeRouteShadow.setLatLngs(pts);
        }
        if (!activeRoutePolyline) {
          activeRoutePolyline = L.polyline(pts, { color: '#1A73E8', weight: 6, opacity: 1.0, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        } else {
          activeRoutePolyline.setStyle({ color: '#1A73E8' });
          activeRoutePolyline.setLatLngs(pts);
        }
        if (activeRouteBadge) {
          map.removeLayer(activeRouteBadge);
          activeRouteBadge = null;
        }
        pts.forEach(p => bounds.push(p));
      } else {
        if (activeRouteShadow) { map.removeLayer(activeRouteShadow); activeRouteShadow = null; }
        if (activeRoutePolyline) { map.removeLayer(activeRoutePolyline); activeRoutePolyline = null; }
        if (activeRouteBadge) { map.removeLayer(activeRouteBadge); activeRouteBadge = null; }
      }
    }

    window.addEventListener('message', function(e) {
      const msg = e.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'update') {
        renderMap(msg);
      } else if (msg.type === 'flyTo') {
        map.flyTo([msg.lat, msg.lng], msg.zoom, { duration: 1.0 });
      } else if (msg.type === 'fitBounds') {
        if (msg.coords && msg.coords.length > 0) {
          const pts = msg.coords.map(c => [c.latitude, c.longitude]);
          map.fitBounds(pts, { padding: [msg.padding || 60, msg.padding || 60] });
        }
      }
    });

    sendToParent({ type: 'mapReady' });
  </script>
</body>
</html>`;
}

// ---------- Component ----------
export const MapContainer = forwardRef<MapContainerRef, MapContainerProps>(
  (
    {
      initialRegion = {
        latitude: 28.6139,
        longitude: 77.209,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      region,
      onRegionChangeComplete,
      onPress,
      onSelectRoute,
      children,
      routeCoordinates = [],
      alternativeRoutes,
      activeRouteIndex = 0,
      pickupLocation,
      dropLocation,
      stopLocations = [],
      userLocation,
      driverLocation,
      drivers = [],
      showsUserLocation = false,
      showsMyLocationButton = false,
    },
    ref
  ) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const isReadyRef = useRef(false);

    // Static HTML string: created ONCE, never triggers iframe reload
    const leafletHtml = useMemo(() => {
      return getLeafletWebHtml(initialRegion.latitude, initialRegion.longitude);
    }, []);

    useImperativeHandle(ref, () => ({
      flyTo(center: [number, number], zoom = 14) {
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'flyTo', lat: center[1], lng: center[0], zoom },
          '*'
        );
      },
      fitBounds(coords: LatLng[], padding = 80) {
        if (!coords || coords.length === 0) return;
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'fitBounds', coords, padding },
          '*'
        );
      },
    }));

    const sendUpdate = () => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'update',
          pickupLocation,
          dropLocation,
          stopLocations,
          userLocation: showsUserLocation ? (userLocation || pickupLocation) : (userLocation || null),
          driverLocation,
          drivers,
          routeCoordinates,
          alternativeRoutes: alternativeRoutes ?? null,
          activeRouteIndex,
          region,
        },
        '*'
      );
    };

    // Re-send markers whenever props change
    useEffect(() => {
      sendUpdate();
    }, [
      pickupLocation,
      dropLocation,
      stopLocations,
      userLocation,
      driverLocation,
      drivers,
      routeCoordinates,
      alternativeRoutes,
      activeRouteIndex,
      region,
      showsUserLocation,
    ]);

    // Listen for messages posted from Leaflet map
    useEffect(() => {
      const handleMsg = (e: MessageEvent) => {
        if (!e.data) return;
        if (e.data.type === 'mapReady') {
          isReadyRef.current = true;
          sendUpdate();
        } else if (e.data.type === 'regionChange' && onRegionChangeComplete) {
          onRegionChangeComplete(e.data.region);
        } else if (e.data.type === 'selectRoute' && onSelectRoute) {
          onSelectRoute(e.data.index);
        } else if (e.data.type === 'mapClick' && onPress) {
          onPress({ nativeEvent: { coordinate: e.data.coordinate } });
        }
      };
      window.addEventListener('message', handleMsg);
      return () => window.removeEventListener('message', handleMsg);
    }, [onRegionChangeComplete, onSelectRoute, onPress, pickupLocation, dropLocation, userLocation, driverLocation, routeCoordinates]);

    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef as any}
          srcDoc={leafletHtml}
          style={{ width: '100%', height: '100%', border: 'none' } as any}
          title="GoRide Map"
          sandbox="allow-scripts allow-same-origin"
        />
        {children}
      </View>
    );
  }
);

MapContainer.displayName = 'MapContainer';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
