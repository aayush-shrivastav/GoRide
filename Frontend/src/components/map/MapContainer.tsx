import React, { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { LatLng } from '../../services/maps/osrmService';

// ---------- Public ref API ----------
export interface MapContainerRef {
  flyTo: (center: [number, number], zoom?: number) => void;
  fitBounds: (coords: LatLng[], padding?: number) => void;
}

// ---------- Props ----------
interface MapContainerProps {
  style?: any;
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

export const MapContainer = forwardRef<MapContainerRef, MapContainerProps>(
  (
    {
      style,
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
    const webviewRef = useRef<WebView>(null);
    const isReadyRef = useRef(false);

    const postToMap = (data: any) => {
      const js = `
        if (window.handleNativeMessage) {
          window.handleNativeMessage(${JSON.stringify(data)});
        }
        true;
      `;
      webviewRef.current?.injectJavaScript(js);
    };

    useImperativeHandle(ref, () => ({
      flyTo(center: [number, number], zoom = 14) {
        postToMap({ type: 'flyTo', lat: center[1], lng: center[0], zoom });
      },
      fitBounds(coords: LatLng[], padding = 80) {
        if (!coords || coords.length === 0) return;
        postToMap({ type: 'fitBounds', coords, padding });
      },
    }));

    // Update map state when props change
    useEffect(() => {
      if (!isReadyRef.current) return;
      postToMap({
        type: 'update',
        pickupLocation,
        dropLocation,
        stopLocations,
        userLocation: showsUserLocation ? userLocation : null,
        driverLocation,
        drivers,
        routeCoordinates,
        region,
      });
    }, [
      pickupLocation,
      dropLocation,
      stopLocations,
      userLocation,
      driverLocation,
      drivers,
      routeCoordinates,
      region,
      showsUserLocation,
    ]);

    const handleMessage = (event: any) => {
      try {
        const raw = event.nativeEvent.data;
        const msg = JSON.parse(raw);
        if (msg.type === 'mapReady') {
          isReadyRef.current = true;
          // Initial sync on ready
          postToMap({
            type: 'update',
            pickupLocation,
            dropLocation,
            stopLocations,
            userLocation: showsUserLocation ? userLocation : null,
            driverLocation,
            drivers,
            routeCoordinates,
            region,
          });
        } else if (msg.type === 'regionChange' && onRegionChangeComplete) {
          onRegionChangeComplete(msg.region);
        } else if (msg.type === 'mapClick' && onPress) {
          onPress({ nativeEvent: { coordinate: msg.coordinate } });
        }
      } catch (err) {
        // Ignore JSON parse errors from other sources
      }
    };

    const centerLat =
      region?.latitude ??
      driverLocation?.latitude ??
      pickupLocation?.latitude ??
      userLocation?.latitude ??
      initialRegion.latitude;
    const centerLng =
      region?.longitude ??
      driverLocation?.longitude ??
      pickupLocation?.longitude ??
      userLocation?.longitude ??
      initialRegion.longitude;

    const leafletHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body, #map {
      width: 100%; height: 100%; margin: 0; padding: 0;
      background-color: #e5e3df;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .leaflet-control-zoom {
      border: none !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
      border-radius: 8px !important;
      overflow: hidden;
      margin-bottom: 24px !important;
      margin-right: 16px !important;
    }
    .leaflet-control-zoom a {
      width: 40px !important;
      height: 40px !important;
      line-height: 40px !important;
      font-size: 20px !important;
      color: #333 !important;
      background: #ffffff !important;
    }
    .leaflet-control-attribution {
      font-size: 9px !important;
      background: rgba(255,255,255,0.7) !important;
      padding: 1px 4px !important;
    }
    .gmap-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 12px rgba(0,0,0,0.35);
      border: 2.5px solid white;
      cursor: pointer;
    }
    .gmap-marker-inner {
      transform: rotate(45deg);
      font-size: 16px;
      line-height: 1;
    }
    .pickup-pin { width: 38px; height: 38px; background: #10B981; }
    .drop-pin   { width: 38px; height: 38px; background: #EF4444; }
    .stop-pin   { width: 34px; height: 34px; background: #F59E0B; }
    .driver-pin {
      width: 42px; height: 42px;
      background: #2563EB;
      border-color: #fff;
      box-shadow: 0 3px 14px rgba(37,99,235,0.5);
    }
    .nearby-pin {
      width: 32px; height: 32px;
      background: #FFFFFF;
      border: 2px solid #06B6D4;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .user-dot-outer {
      width: 22px; height: 22px;
      border-radius: 50%;
      background: rgba(26, 115, 232, 0.25);
      border: 2px solid rgba(26, 115, 232, 0.6);
      display: flex; align-items: center; justify-content: center;
      animation: pulse 2s infinite;
    }
    .user-dot-inner {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #1A73E8;
      border: 1.5px solid white;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 4px rgba(26,115,232,0.15); }
      50%      { box-shadow: 0 0 0 10px rgba(26,115,232,0.05); }
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
      attributionControl: true,
    }).setView([${centerLat}, ${centerLng}], 14);

    // High-resolution OpenStreetMap tiles (100% free, zero API key required, zero watermark)
    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    let markersLayer = L.layerGroup().addTo(map);
    let routeLayer   = L.layerGroup().addTo(map);

    function sendToNative(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    }

    map.on('moveend', function() {
      const center = map.getCenter();
      const bounds = map.getBounds();
      sendToNative({
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
      sendToNative({
        type: 'mapClick',
        coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng }
      });
    });

    function makePin(cls, emoji) {
      return L.divIcon({
        className: '',
        html: '<div class="gmap-marker ' + cls + '"><span class="gmap-marker-inner">' + emoji + '</span></div>',
        iconSize: [40, 40],
        iconAnchor: [19, 40],
        popupAnchor: [0, -40],
      });
    }

    function makeUserDot() {
      return L.divIcon({
        className: '',
        html: '<div class="user-dot-outer"><div class="user-dot-inner"></div></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
    }

    function makeNearbyPin(emoji) {
      return L.divIcon({
        className: '',
        html: '<div class="gmap-marker nearby-pin"><span class="gmap-marker-inner" style="font-size:13px">' + emoji + '</span></div>',
        iconSize: [32, 32],
        iconAnchor: [15, 32],
        popupAnchor: [0, -32],
      });
    }

    function renderMap(data) {
      if (!data) return;
      markersLayer.clearLayers();
      routeLayer.clearLayers();

      const bounds = [];

      // User location dot
      if (data.userLocation) {
        L.marker([data.userLocation.latitude, data.userLocation.longitude], {
          icon: makeUserDot(),
          zIndexOffset: 200
        }).addTo(markersLayer);
        bounds.push([data.userLocation.latitude, data.userLocation.longitude]);
      }

      // Pickup pin
      if (data.pickupLocation) {
        L.marker([data.pickupLocation.latitude, data.pickupLocation.longitude], {
          icon: makePin('pickup-pin', '🧍'),
          zIndexOffset: 300
        }).addTo(markersLayer);
        bounds.push([data.pickupLocation.latitude, data.pickupLocation.longitude]);
      }

      // Stops
      (data.stopLocations || []).forEach((stop, i) => {
        L.marker([stop.latitude, stop.longitude], {
          icon: makePin('stop-pin', (i + 1).toString()),
          zIndexOffset: 250
        }).addTo(markersLayer);
        bounds.push([stop.latitude, stop.longitude]);
      });

      // Dropoff pin
      if (data.dropLocation) {
        L.marker([data.dropLocation.latitude, data.dropLocation.longitude], {
          icon: makePin('drop-pin', '🏁'),
          zIndexOffset: 300
        }).addTo(markersLayer);
        bounds.push([data.dropLocation.latitude, data.dropLocation.longitude]);
      }

      // Active driver
      if (data.driverLocation) {
        L.marker([data.driverLocation.latitude, data.driverLocation.longitude], {
          icon: makePin('driver-pin', '🚗'),
          zIndexOffset: 500
        }).addTo(markersLayer);
        bounds.push([data.driverLocation.latitude, data.driverLocation.longitude]);
      }

      // Nearby drivers
      (data.drivers || []).forEach(d => {
        const emoji = { bike: '🛵', auto: '🛺', car: '🚗', suv: '🚙' }[d.vehicleType?.toLowerCase()] || '🚗';
        L.marker([d.latitude, d.longitude], {
          icon: makeNearbyPin(emoji),
          zIndexOffset: 100
        }).addTo(markersLayer);
        bounds.push([d.latitude, d.longitude]);
      });

      // Route polyline (high-contrast dual stroke)
      if (data.routeCoordinates && data.routeCoordinates.length > 1) {
        const pts = data.routeCoordinates.map(c => [c.latitude, c.longitude]);
        L.polyline(pts, { color: '#FFFFFF', weight: 8, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(routeLayer);
        L.polyline(pts, { color: '#1A73E8', weight: 5, opacity: 1.0, lineJoin: 'round', lineCap: 'round' }).addTo(routeLayer);
      }

      // Auto camera
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

    window.handleNativeMessage = function(data) {
      if (!data) return;
      if (data.type === 'update') {
        renderMap(data);
      } else if (data.type === 'flyTo') {
        map.flyTo([data.lat, data.lng], data.zoom || 14, { duration: 1.0 });
      } else if (data.type === 'fitBounds') {
        if (data.coords && data.coords.length > 0) {
          const pts = data.coords.map(c => [c.latitude, c.longitude]);
          map.fitBounds(pts, { padding: [data.padding || 60, data.padding || 60] });
        }
      }
    };

    // Notify native that Leaflet map is ready
    sendToNative({ type: 'mapReady' });
  </script>
</body>
</html>`;

    return (
      <View style={[styles.container, style]}>
        <WebView
          ref={webviewRef}
          source={{ html: leafletHtml }}
          originWhitelist={['*']}
          style={styles.webview}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
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
    backgroundColor: '#E5E3DF',
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E3DF',
  },
});
