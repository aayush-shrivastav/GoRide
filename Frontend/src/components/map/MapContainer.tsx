import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
  useState,
  useEffect,
} from 'react';
import {
  StyleSheet,
  View,
  Text,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  UrlTile,
  Region,
  MapPressEvent,
} from 'react-native-maps';
import { LatLng } from '../../services/maps/osrmService';

// ---------- Types ----------

export interface MapContainerRef {
  flyTo: (center: [number, number], zoom?: number) => void;
  fitBounds: (coords: any[], padding?: number) => void;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapNearbyDriver {
  id: string;
  latitude: number;
  longitude: number;
  vehicleType?: string;
}

export interface MapContainerProps {
  style?: StyleProp<ViewStyle>;
  initialRegion?: MapRegion;
  region?: MapRegion;
  onRegionChangeComplete?: (region: MapRegion) => void;
  onPress?: (event: MapPressEvent) => void;
  children?: React.ReactNode;
  routeCoordinates?: any[];
  pickupLocation?: any;
  dropLocation?: any;
  stopLocations?: any[];
  userLocation?: any;
  driverLocation?: any;
  drivers?: MapNearbyDriver[];
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
}

// ---------- Coordinate Conversion & Validation ----------

/**
 * Safely converts any supported coordinate representation to { latitude, longitude }.
 * Handles:
 * - { latitude, longitude }
 * - { lat, lng } or { lat, lon }
 * - GeoJSON [longitude, latitude]
 * - [latitude, longitude]
 * - Stringified numerical values
 * Returns null if invalid or out-of-range (-90..90 for lat, -180..180 for lng).
 */
export function toLatLng(coord: any): LatLng | null {
  if (!coord) return null;

  let lat: number | undefined;
  let lng: number | undefined;

  if (Array.isArray(coord) && coord.length >= 2) {
    const first = Number(coord[0]);
    const second = Number(coord[1]);
    if (!isNaN(first) && !isNaN(second)) {
      // If first coordinate is clearly outside lat range (>90 or <-90), it's [lng, lat]
      if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
        lng = first;
        lat = second;
      } else if (Math.abs(second) > 90 && Math.abs(first) <= 90) {
        lat = first;
        lng = second;
      } else {
        // Standard GeoJSON convention: [longitude, latitude]
        lng = first;
        lat = second;
      }
    }
  } else if (typeof coord === 'object') {
    const rawLat = coord.latitude ?? coord.lat;
    const rawLng = coord.longitude ?? coord.lng ?? coord.lon;
    if (rawLat !== undefined && rawLng !== undefined) {
      lat = Number(rawLat);
      lng = Number(rawLng);
    }
  }

  if (
    lat !== undefined &&
    lng !== undefined &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    return { latitude: lat, longitude: lng };
  }

  return null;
}

const DEFAULT_REGION: MapRegion = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const OSM_TILE_TEMPLATE =
  process.env.EXPO_PUBLIC_OSM_TILE_URL ||
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function getVehicleEmoji(type?: string): string {
  switch (type?.toLowerCase()) {
    case 'bike':
      return '🛵';
    case 'auto':
      return '🛺';
    case 'suv':
      return '🚙';
    case 'car':
    default:
      return '🚗';
  }
}

// ---------- Component ----------

export const MapContainer = forwardRef<MapContainerRef, MapContainerProps>(
  (
    {
      style,
      initialRegion = DEFAULT_REGION,
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
    const mapRef = useRef<MapView | null>(null);
    const isMapReadyRef = useRef(false);
    const pendingActionRef = useRef<(() => void) | null>(null);
    const [tracksViewChanges, setTracksViewChanges] = useState(true);

    // Turn off tracksViewChanges after initial render for performance,
    // but re-enable briefly if marker positions update
    useEffect(() => {
      setTracksViewChanges(true);
      const timer = setTimeout(() => {
        setTracksViewChanges(false);
      }, 600);
      return () => clearTimeout(timer);
    }, [pickupLocation, dropLocation, driverLocation, drivers.length]);

    // Handle map ready event & execute any pending camera actions
    const handleMapReady = useCallback(() => {
      isMapReadyRef.current = true;
      if (pendingActionRef.current) {
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action();
      }
    }, []);

    // ---------- Public Ref Methods ----------
    useImperativeHandle(ref, () => ({
      flyTo(center: [number, number], zoom = 14) {
        if (!center || center.length < 2) return;
        const normalized = toLatLng(center);
        if (!normalized) return;

        const action = () => {
          const latDelta = Math.max(0.005, 360 / Math.pow(2, zoom));
          mapRef.current?.animateToRegion(
            {
              latitude: normalized.latitude,
              longitude: normalized.longitude,
              latitudeDelta: latDelta,
              longitudeDelta: latDelta,
            },
            1000
          );
        };

        if (isMapReadyRef.current && mapRef.current) {
          action();
        } else {
          pendingActionRef.current = action;
        }
      },

      fitBounds(coords: any[], padding = 80) {
        if (!coords || !Array.isArray(coords) || coords.length === 0) return;

        const validCoords: LatLng[] = [];
        for (const c of coords) {
          const pt = toLatLng(c);
          if (pt) validCoords.push(pt);
        }

        if (validCoords.length === 0) return;

        const action = () => {
          if (!mapRef.current) return;
          if (validCoords.length === 1) {
            mapRef.current.animateToRegion(
              {
                latitude: validCoords[0].latitude,
                longitude: validCoords[0].longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              },
              800
            );
          } else {
            const pad = typeof padding === 'number' ? padding : 80;
            mapRef.current.fitToCoordinates(validCoords, {
              edgePadding: { top: pad, right: pad, bottom: pad, left: pad },
              animated: true,
            });
          }
        };

        if (isMapReadyRef.current && mapRef.current) {
          action();
        } else {
          pendingActionRef.current = action;
        }
      },
    }));

    // ---------- Normalized Locations (Memoized) ----------
    const normalizedPickup = useMemo(
      () => toLatLng(pickupLocation),
      [pickupLocation]
    );

    const normalizedDrop = useMemo(
      () => toLatLng(dropLocation),
      [dropLocation]
    );

    const normalizedStops = useMemo(() => {
      if (!stopLocations || !Array.isArray(stopLocations)) return [];
      const result: LatLng[] = [];
      for (const stop of stopLocations) {
        const pt = toLatLng(stop);
        if (pt) result.push(pt);
      }
      return result;
    }, [stopLocations]);

    const normalizedDriverLocation = useMemo(
      () => toLatLng(driverLocation),
      [driverLocation]
    );

    const normalizedUserLocation = useMemo(
      () => toLatLng(userLocation),
      [userLocation]
    );

    const normalizedRoute = useMemo(() => {
      if (!routeCoordinates || !Array.isArray(routeCoordinates)) return [];
      const result: LatLng[] = [];
      for (const pt of routeCoordinates) {
        const valid = toLatLng(pt);
        if (valid) result.push(valid);
      }
      return result;
    }, [routeCoordinates]);

    const normalizedDrivers = useMemo(() => {
      if (!drivers || !Array.isArray(drivers)) return [];
      const result: Array<MapNearbyDriver> = [];
      for (const d of drivers) {
        const pt = toLatLng(d);
        if (pt) {
          result.push({
            id: String(d.id || Math.random()),
            latitude: pt.latitude,
            longitude: pt.longitude,
            vehicleType: d.vehicleType,
          });
        }
      }
      return result;
    }, [drivers]);

    // Handle Region Change Complete safely
    const handleRegionChangeComplete = useCallback(
      (newRegion: Region) => {
        if (onRegionChangeComplete) {
          onRegionChangeComplete({
            latitude: newRegion.latitude,
            longitude: newRegion.longitude,
            latitudeDelta: newRegion.latitudeDelta,
            longitudeDelta: newRegion.longitudeDelta,
          });
        }
      },
      [onRegionChangeComplete]
    );

    return (
      <View style={[styles.container, style]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          region={region}
          onMapReady={handleMapReady}
          onRegionChangeComplete={handleRegionChangeComplete}
          onPress={onPress}
          showsUserLocation={showsUserLocation}
          showsMyLocationButton={showsMyLocationButton}
          mapType={Platform.OS === 'android' ? 'standard' : 'standard'}
          rotateEnabled={true}
          pitchEnabled={true}
          scrollEnabled={true}
          zoomEnabled={true}
        >
          {/* OpenStreetMap Tile Layer */}
          <UrlTile
            urlTemplate={OSM_TILE_TEMPLATE}
            maximumZ={19}
            maximumNativeZ={19}
            flipY={false}
            zIndex={-1}
            shouldReplaceMapContent={Platform.OS === 'ios'}
          />

          {/* Route Polyline (High-contrast dual layer) */}
          {normalizedRoute.length > 1 && (
            <>
              <Polyline
                coordinates={normalizedRoute}
                strokeColor="#FFFFFF"
                strokeWidth={7}
                lineJoin="round"
                lineCap="round"
                zIndex={10}
              />
              <Polyline
                coordinates={normalizedRoute}
                strokeColor="#1A73E8"
                strokeWidth={4}
                lineJoin="round"
                lineCap="round"
                zIndex={11}
              />
            </>
          )}

          {/* Pickup Marker */}
          {normalizedPickup && (
            <Marker
              key="pickup-marker"
              coordinate={normalizedPickup}
              title="Pickup Location"
              identifier="pickup"
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={tracksViewChanges}
              zIndex={50}
            >
              <View style={styles.pinWrapper}>
                <View style={[styles.pinBadge, styles.pickupBadge]}>
                  <Text style={styles.pinEmoji}>🧍</Text>
                </View>
                <View style={[styles.pinStem, styles.pickupStem]} />
              </View>
            </Marker>
          )}

          {/* Stop Markers */}
          {normalizedStops.map((stop, idx) => (
            <Marker
              key={`stop-marker-${idx}`}
              coordinate={stop}
              title={`Stop ${idx + 1}`}
              identifier={`stop-${idx}`}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={tracksViewChanges}
              zIndex={45}
            >
              <View style={styles.pinWrapper}>
                <View style={[styles.pinBadge, styles.stopBadge]}>
                  <Text style={styles.stopNumber}>{idx + 1}</Text>
                </View>
                <View style={[styles.pinStem, styles.stopStem]} />
              </View>
            </Marker>
          ))}

          {/* Destination / Dropoff Marker */}
          {normalizedDrop && (
            <Marker
              key="drop-marker"
              coordinate={normalizedDrop}
              title="Dropoff Location"
              identifier="drop"
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={tracksViewChanges}
              zIndex={50}
            >
              <View style={styles.pinWrapper}>
                <View style={[styles.pinBadge, styles.dropBadge]}>
                  <Text style={styles.pinEmoji}>🏁</Text>
                </View>
                <View style={[styles.pinStem, styles.dropStem]} />
              </View>
            </Marker>
          )}

          {/* Active Driver Marker */}
          {normalizedDriverLocation && (
            <Marker
              key="active-driver-marker"
              coordinate={normalizedDriverLocation}
              title="Your Driver"
              identifier="active-driver"
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracksViewChanges}
              zIndex={60}
            >
              <View style={styles.driverContainer}>
                <View style={styles.driverHalo} />
                <View style={styles.driverCore}>
                  <Text style={styles.driverEmoji}>🚗</Text>
                </View>
              </View>
            </Marker>
          )}

          {/* Nearby Drivers Markers */}
          {normalizedDrivers.map((driver) => (
            <Marker
              key={`nearby-${driver.id}`}
              coordinate={{
                latitude: driver.latitude,
                longitude: driver.longitude,
              }}
              title={`Driver (${driver.vehicleType || 'cab'})`}
              identifier={`nearby-${driver.id}`}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracksViewChanges}
              zIndex={30}
            >
              <View style={styles.nearbyContainer}>
                <Text style={styles.nearbyEmoji}>
                  {getVehicleEmoji(driver.vehicleType)}
                </Text>
              </View>
            </Marker>
          ))}

          {/* User Location Marker (if not using native showsUserLocation) */}
          {normalizedUserLocation && !showsUserLocation && (
            <Marker
              key="user-marker"
              coordinate={normalizedUserLocation}
              title="Your Location"
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracksViewChanges}
              zIndex={20}
            >
              <View style={styles.userDotOuter}>
                <View style={styles.userDotInner} />
              </View>
            </Marker>
          )}

          {children}
        </MapView>

        {/* OpenStreetMap Attribution Badge */}
        <View style={styles.attributionContainer} pointerEvents="none">
          <Text style={styles.attributionText}>
            © OpenStreetMap contributors
          </Text>
        </View>
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
    overflow: 'hidden',
    backgroundColor: '#E5E3DF', // Neutral map tile background
  },

  // Pin base
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  pinStem: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
  pinEmoji: {
    fontSize: 16,
  },

  // Pickup variant
  pickupBadge: {
    backgroundColor: '#10B981',
  },
  pickupStem: {
    borderTopColor: '#10B981',
  },

  // Dropoff variant
  dropBadge: {
    backgroundColor: '#EF4444',
  },
  dropStem: {
    borderTopColor: '#EF4444',
  },

  // Stop variant
  stopBadge: {
    backgroundColor: '#F59E0B',
  },
  stopStem: {
    borderTopColor: '#F59E0B',
  },
  stopNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },

  // Driver marker
  driverContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverHalo: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.4)',
  },
  driverCore: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 6,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  driverEmoji: {
    fontSize: 16,
  },

  // Nearby drivers
  nearbyContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#06B6D4',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  nearbyEmoji: {
    fontSize: 14,
  },

  // User location marker fallback
  userDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(26, 115, 232, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(26, 115, 232, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1A73E8',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  // OpenStreetMap Attribution badge
  attributionContainer: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.15)',
  },
  attributionText: {
    fontSize: 9,
    color: '#333333',
    fontWeight: '500',
  },
});
