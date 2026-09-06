import React, { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { LatLng } from '../../services/maps/osrmService';

// ---------- Public ref API ----------
export interface MapContainerRef {
  flyTo: (center: [number, number], zoom?: number) => void;
  fitBounds: (coords: LatLng[], padding?: number) => void;
}

// ---------- Props ----------
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
  children?: React.ReactNode;
  routeCoordinates?: LatLng[];
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
      children,
      routeCoordinates = [],
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

    // Re-send markers whenever props change
    useEffect(() => {
      const frame = iframeRef.current;
      if (!frame) return;
      const send = () => {
        frame.contentWindow?.postMessage(
          {
            type: 'update',
            pickupLocation,
            dropLocation,
            stopLocations,
            userLocation,
            driverLocation,
            drivers,
            routeCoordinates,
            region,
          },
          '*'
        );
      };
      // Wait for iframe to be ready
      frame.addEventListener('load', send);
      // Also send immediately in case already loaded
      send();
      return () => frame.removeEventListener('load', send);
    }, [
      pickupLocation,
      dropLocation,
      stopLocations,
      userLocation,
      driverLocation,
      drivers,
      routeCoordinates,
      region,
    ]);

    // Listen for region changes posted from Leaflet map
    useEffect(() => {
      const handleMsg = (e: MessageEvent) => {
        if (e.data && e.data.type === 'regionChange' && onRegionChangeComplete) {
          onRegionChangeComplete(e.data.region);
        }
      };
      window.addEventListener('message', handleMsg);
      return () => window.removeEventListener('message', handleMsg);
    }, [onRegionChangeComplete]);

    const centerLat = region?.latitude ?? pickupLocation?.latitude ?? userLocation?.latitude ?? initialRegion.latitude;
    const centerLng = region?.longitude ?? pickupLocation?.longitude ?? userLocation?.longitude ?? initialRegion.longitude;

    const leafletHtml = `<!DOCTYPE html>
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    /* Google-Maps-style zoom control */
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
    .leaflet-control-zoom a:hover { background: #f5f5f5 !important; }
    .leaflet-control-attribution {
      font: 10px/1.2 system-ui, sans-serif;
      background: rgba(255,255,255,0.8) !important;
    }
    /* Popup styling */
    .leaflet-popup-content-wrapper {
      border-radius: 12px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2) !important;
      padding: 0 !important;
    }
    .leaflet-popup-content {
      margin: 12px 16px !important;
      font-size: 13px;
      font-weight: 600;
      color: #1a1a2e;
    }
    /* Marker base */
    .gmap-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 14px rgba(0,0,0,0.35);
      border: 3px solid white;
      cursor: pointer;
    }
    .gmap-marker-inner {
      transform: rotate(45deg);
      font-size: 18px;
      line-height: 1;
    }
    /* Pin variants */
    .pickup-pin  { width: 40px; height: 40px; background: #34C759; }
    .drop-pin    { width: 40px; height: 40px; background: #FF3B30; }
    .driver-pin  { width: 44px; height: 44px; background: #007AFF; border-color: #fff; box-shadow: 0 3px 18px rgba(0,122,255,0.5); }
    .stop-pin    { width: 36px; height: 36px; background: #FF9500; }
    .nearby-pin  { width: 32px; height: 32px; background: #32ADE6; border-width: 2px; }
    /* User dot */
    .user-dot-outer {
      width: 20px; height: 20px;
      border-radius: 50%;
      background: rgba(0, 122, 255, 0.25);
      border: 2px solid rgba(0, 122, 255, 0.5);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 0 6px rgba(0, 122, 255, 0.12);
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
    const map = L.map('map', {
      zoomControl: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 80,
    }).setView([${centerLat}, ${centerLng}], 14);

    // OpenStreetMap tiles — free, no API key required
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Notify parent on map pan/zoom
    map.on('moveend', function() {
      const center = map.getCenter();
      const bounds = map.getBounds();
      window.parent.postMessage({
        type: 'regionChange',
        region: {
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: Math.abs(bounds.getNorth() - bounds.getSouth()),
          longitudeDelta: Math.abs(bounds.getEast() - bounds.getWest()),
        }
      }, '*');
    });

    // Layer groups for easy re-render
    let markersLayer = L.layerGroup().addTo(map);
    let routeLayer   = L.layerGroup().addTo(map);

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

    function renderMap(data) {
      markersLayer.clearLayers();
      routeLayer.clearLayers();

      const bounds = [];

      // User location dot
      if (data.userLocation) {
        L.marker([data.userLocation.latitude, data.userLocation.longitude], { icon: makeUserDot(), zIndexOffset: 200 }).addTo(markersLayer);
        bounds.push([data.userLocation.latitude, data.userLocation.longitude]);
      }

      // Pickup
      if (data.pickupLocation) {
        L.marker([data.pickupLocation.latitude, data.pickupLocation.longitude], { icon: makePin('pickup-pin', '🧍'), zIndexOffset: 300 })
          .addTo(markersLayer).bindPopup('<b>Pickup Location</b>');
        bounds.push([data.pickupLocation.latitude, data.pickupLocation.longitude]);
      }

      // Stops
      (data.stopLocations || []).forEach((stop, i) => {
        L.marker([stop.latitude, stop.longitude], { icon: makePin('stop-pin', (i + 1).toString()), zIndexOffset: 250 })
          .addTo(markersLayer).bindPopup('<b>Stop ' + (i + 1) + '</b>');
        bounds.push([stop.latitude, stop.longitude]);
      });

      // Drop
      if (data.dropLocation) {
        L.marker([data.dropLocation.latitude, data.dropLocation.longitude], { icon: makePin('drop-pin', '🏁'), zIndexOffset: 300 })
          .addTo(markersLayer).bindPopup('<b>Dropoff Location</b>');
        bounds.push([data.dropLocation.latitude, data.dropLocation.longitude]);
      }

      // Active driver
      if (data.driverLocation) {
        L.marker([data.driverLocation.latitude, data.driverLocation.longitude], { icon: makePin('driver-pin', '🚗'), zIndexOffset: 500 })
          .addTo(markersLayer).bindPopup('<b>Your Driver</b>');
        bounds.push([data.driverLocation.latitude, data.driverLocation.longitude]);
      }

      // Nearby drivers
      (data.drivers || []).forEach(d => {
        const emoji = { bike: '🛵', auto: '🛺', car: '🚗', suv: '🚙' }[d.vehicleType] || '🚗';
        L.marker([d.latitude, d.longitude], { icon: makeNearbyPin(emoji), zIndexOffset: 100 })
          .addTo(markersLayer).bindPopup('<b>Driver available</b>');
        bounds.push([d.latitude, d.longitude]);
      });

      // Route polyline (shadow + primary)
      if (data.routeCoordinates && data.routeCoordinates.length > 1) {
        const pts = data.routeCoordinates.map(c => [c.latitude, c.longitude]);
        L.polyline(pts, { color: '#fff',     weight: 10, opacity: 0.9, lineJoin: 'round', lineCap: 'round' }).addTo(routeLayer);
        L.polyline(pts, { color: '#1A73E8',  weight: 6,  opacity: 1.0, lineJoin: 'round', lineCap: 'round' }).addTo(routeLayer);
      }

      // Region override
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

    // postMessage bridge
    window.addEventListener('message', function(e) {
      const msg = e.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'update') {
        renderMap(msg);
      } else if (msg.type === 'flyTo') {
        map.flyTo([msg.lat, msg.lng], msg.zoom, { duration: 1.2 });
      } else if (msg.type === 'fitBounds') {
        if (msg.coords && msg.coords.length > 0) {
          const pts = msg.coords.map(c => [c.latitude, c.longitude]);
          map.fitBounds(pts, { padding: [msg.padding || 60, msg.padding || 60] });
        }
      }
    });

    // Initial render with inline data
    renderMap({
      pickupLocation:  ${JSON.stringify(pickupLocation ?? null)},
      dropLocation:    ${JSON.stringify(dropLocation ?? null)},
      stopLocations:   ${JSON.stringify(stopLocations ?? [])},
      userLocation:    ${JSON.stringify(userLocation ?? null)},
      driverLocation:  ${JSON.stringify(driverLocation ?? null)},
      drivers:         ${JSON.stringify(drivers ?? [])},
      routeCoordinates:${JSON.stringify(routeCoordinates ?? [])},
      region:          ${JSON.stringify(region ?? null)},
    });
  </script>
</body>
</html>`;

    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef as any}
          srcDoc={leafletHtml}
          style={{ width: '100%', height: '100%', border: 'none' } as any}
          title="GoRide Map"
          sandbox="allow-scripts allow-same-origin"
        />
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
