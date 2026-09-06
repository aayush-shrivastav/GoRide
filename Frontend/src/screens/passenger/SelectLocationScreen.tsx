import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import Button from '../../components/common/Button';
import { GeoLocation } from '../../types/ride.types';
import { reverseGeocode, searchLocation } from '../../services/maps/nominatimService';
import { getCurrentUserLocation } from '../../services/maps/locationService';
import { MapContainer, MapContainerRef } from '../../components/map/MapContainer';
import { fetchOSRMRouteThroughPoints, LatLng } from '../../services/maps/osrmService';
import { getNearbyDrivers, NearbyDriver } from '../../services/api/rideApi';

type Props = NativeStackScreenProps<PassengerStackParamList, 'SelectLocation'>;

const { height: SCREEN_H } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_H * 0.48;  // Search/list panel height

const POPULAR_LOCATIONS = [
  { address: 'Connaught Place, New Delhi', latitude: 28.6315, longitude: 77.2167 },
  { address: 'India Gate, New Delhi', latitude: 28.6129, longitude: 77.2295 },
  { address: 'BKC, Mumbai', latitude: 19.0648, longitude: 72.8657 },
  { address: 'Andheri Station, Mumbai', latitude: 19.1197, longitude: 72.8464 },
  { address: 'MG Road, Bengaluru', latitude: 12.9756, longitude: 77.6066 },
  { address: 'Koramangala, Bengaluru', latitude: 12.9352, longitude: 77.6245 },
];

export default function SelectLocationScreen({ navigation }: Props) {
  const mapRef = useRef<MapContainerRef>(null);

  // ── Location state ─────────────────────────────────────────
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropAddress, setDropAddress]     = useState('');
  const [activeField, setActiveField]     = useState<'pickup' | 'drop' | 'stop'>('pickup');
  const [pickupCoords, setPickupCoords]   = useState<GeoLocation | null>(null);
  const [dropCoords, setDropCoords]       = useState<GeoLocation | null>(null);
  const [stops, setStops]                 = useState<GeoLocation[]>([]);
  const [routeCoords, setRouteCoords]     = useState<LatLng[]>([]);
  const [userLocation, setUserLocation]   = useState<LatLng | null>(null);

  // ── Search state ───────────────────────────────────────────
  const [pickupQuery, setPickupQuery]     = useState('');
  const [dropQuery, setDropQuery]         = useState('');
  const [stopQuery, setStopQuery]         = useState('');
  const searchQuery = activeField === 'pickup' ? pickupQuery : activeField === 'drop' ? dropQuery : stopQuery;
  const setSearchQuery = activeField === 'pickup' ? setPickupQuery : activeField === 'drop' ? setDropQuery : setStopQuery;
  const [searchResults, setSearchResults] = useState<Array<{ address: string; latitude: number; longitude: number }>>([]);
  const [searching, setSearching]         = useState(false);
  const [locatingCurrent, setLocatingCurrent] = useState(false);

  // ── Map picker mode ────────────────────────────────────────
  const [isMapMode, setIsMapMode]           = useState(false);
  const [mapRegion, setMapRegion]           = useState({
    latitude: 28.6139,
    longitude: 77.209,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  });
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // ── Nearby drivers ─────────────────────────────────────────
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);

  // ── Panel slide animation ──────────────────────────────────
  const panelY = useRef(new Animated.Value(0)).current;

  // ── Fetch user location on mount ───────────────────────────
  useEffect(() => {
    (async () => {
      const loc = await getCurrentUserLocation();
      if (loc) {
        setUserLocation({ latitude: loc.latitude, longitude: loc.longitude });
        setMapRegion({
          latitude: loc.latitude,
          longitude: loc.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        });
        // Fetch nearby drivers around user
        try {
          const drivers = await getNearbyDrivers(loc.latitude, loc.longitude);
          setNearbyDrivers(drivers);
        } catch {
          // Silently ignore if API not reachable
        }
      }
    })();
  }, []);

  // ── Search debounce ────────────────────────────────────────
  useEffect(() => {
    if (isMapMode || !searchQuery || searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const results = await searchLocation(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, isMapMode]);

  // ── Draw route when both locations set ─────────────────────
  useEffect(() => {
    if (!pickupCoords || !dropCoords) {
      setRouteCoords([]);
      return;
    }
    fetchOSRMRouteThroughPoints([
      { latitude: pickupCoords.latitude, longitude: pickupCoords.longitude },
      ...stops.map(stop => ({ latitude: stop.latitude, longitude: stop.longitude })),
      { latitude: dropCoords.latitude, longitude: dropCoords.longitude },
    ]).then(r => {
      setRouteCoords(r.coordinates);
      // Fit map to show full route
      const pts: LatLng[] = [
        { latitude: pickupCoords.latitude, longitude: pickupCoords.longitude },
        { latitude: dropCoords.latitude, longitude: dropCoords.longitude },
        ...r.coordinates.slice(0, 10),
      ];
      setTimeout(() => mapRef.current?.fitBounds(pts, 80), 300);
    }).catch(() => {});
  }, [pickupCoords?.latitude, pickupCoords?.longitude, dropCoords?.latitude, dropCoords?.longitude, stops.length]);

  // ── Select a location from list ────────────────────────────
  function selectLocation(loc: { address: string; latitude: number; longitude: number }) {
    const geoLoc: GeoLocation = { latitude: loc.latitude, longitude: loc.longitude, address: loc.address };
    Keyboard.dismiss();
    if (activeField === 'pickup') {
      setPickupAddress(loc.address);
      setPickupCoords(geoLoc);
      setPickupQuery(loc.address);
      setActiveField('drop');
      setDropQuery('');
      // Fly map to pickup
      mapRef.current?.flyTo([loc.longitude, loc.latitude], 14);
    } else if (activeField === 'drop') {
      setDropAddress(loc.address);
      setDropCoords(geoLoc);
      setDropQuery(loc.address);
      mapRef.current?.flyTo([loc.longitude, loc.latitude], 14);
    } else {
      setStops(prev => [...prev, geoLoc]);
      setStopQuery('');
      setActiveField('drop');
      mapRef.current?.flyTo([loc.longitude, loc.latitude], 14);
    }
    setIsMapMode(false);
  }

  // ── Use current location as pickup ─────────────────────────
  async function handleUseCurrentLocation() {
    setLocatingCurrent(true);
    try {
      const loc = await getCurrentUserLocation();
      if (!loc) {
        Alert.alert('Location Unavailable', 'Please enable location permissions and try again.');
        return;
      }
      const address = await reverseGeocode(loc.latitude, loc.longitude);
      selectLocation({ address, latitude: loc.latitude, longitude: loc.longitude });
    } finally {
      setLocatingCurrent(false);
    }
  }

  // ── Confirm map picker location ─────────────────────────────
  async function handleConfirmMapLocation() {
    setIsReverseGeocoding(true);
    try {
      const address = await reverseGeocode(mapRegion.latitude, mapRegion.longitude);
      selectLocation({ address, latitude: mapRegion.latitude, longitude: mapRegion.longitude });
    } catch {
      Alert.alert('Error', 'Could not get address for this location. Try again.');
    } finally {
      setIsReverseGeocoding(false);
    }
  }

  // ── Continue to fare estimate ───────────────────────────────
  function handleContinue() {
    if (!pickupCoords || !dropCoords) {
      Alert.alert('Missing Location', 'Please select both pickup and drop locations.');
      return;
    }
    navigation.navigate('FareEstimate', { pickup: pickupCoords, drop: dropCoords, stops });
  }

  const locationsToDisplay = searchResults.length > 0 ? searchResults : POPULAR_LOCATIONS;
  const pickupLng: LatLng | null = pickupCoords
    ? { latitude: pickupCoords.latitude, longitude: pickupCoords.longitude }
    : null;
  const dropLng: LatLng | null = dropCoords
    ? { latitude: dropCoords.latitude, longitude: dropCoords.longitude }
    : null;

  const driversForMap = nearbyDrivers.map(d => ({
    id: d._id,
    latitude: d.latitude,
    longitude: d.longitude,
    vehicleType: d.vehicleType,
  }));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── MAP (only visible in map mode) ─────────────────── */}
      {isMapMode && (
        <View style={styles.mapFull}>
          <MapContainer
            ref={mapRef}
            initialRegion={mapRegion}
            onRegionChangeComplete={setMapRegion}
            pickupLocation={pickupLng}
            dropLocation={dropLng}
            stopLocations={stops.map(stop => ({ latitude: stop.latitude, longitude: stop.longitude }))}
            userLocation={userLocation}
            routeCoordinates={routeCoords}
            drivers={[]}
            showsUserLocation={true}
            showsMyLocationButton={true}
          />

          {/* Fixed center pin for map picker mode */}
          <View style={styles.centerPinContainer} pointerEvents="none">
            <View style={[styles.centerPin, activeField === 'pickup' ? styles.pickupCenterPin : styles.dropCenterPin]}>
              <View style={styles.centerPinDot} />
            </View>
            <View style={[styles.pinStem, { backgroundColor: activeField === 'pickup' ? Colors.primary : '#E11D48' }]} />
          </View>
        </View>
      )}

      {/* ── SEARCH MODE HEADER & INPUTS ───────────────────── */}
      {!isMapMode && (
        <View style={styles.searchHeader}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnPlain}>
              <Text style={styles.backIconPlain}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitlePlain}>Plan your ride</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.uberInputContainer}>
            <View style={styles.connectingLine} />
            
            <View style={[styles.uberInputRow, activeField === 'pickup' && styles.uberInputRowActive]}>
              <View style={[styles.inputDot, { backgroundColor: Colors.primary }]} />
              <TextInput
                style={styles.uberTextInput}
                placeholder="Pickup location"
                value={pickupQuery}
                onChangeText={setPickupQuery}
                onFocus={() => setActiveField('pickup')}
                placeholderTextColor={Colors.textMuted}
              />
              {searching && activeField === 'pickup' && <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />}
            </View>

            <View style={styles.uberInputDivider} />

            {stops.map((stop, index) => (
              <View key={`${stop.latitude}-${stop.longitude}-${index}`}>
                <View style={styles.uberInputRow}>
                  <View style={[styles.inputDot, { backgroundColor: Colors.warning }]} />
                  <Text style={styles.stopText} numberOfLines={1}>
                    Stop {index + 1}: {stop.address}
                  </Text>
                  <TouchableOpacity onPress={() => setStops(prev => prev.filter((_, i) => i !== index))}>
                    <Text style={styles.removeStopText}>Remove</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.uberInputDivider} />
              </View>
            ))}

            {activeField === 'stop' && (
              <>
                <View style={[styles.uberInputRow, styles.uberInputRowActive]}>
                  <View style={[styles.inputDot, { backgroundColor: Colors.warning }]} />
                  <TextInput
                    style={styles.uberTextInput}
                    placeholder="Add stop"
                    value={stopQuery}
                    onChangeText={setStopQuery}
                    placeholderTextColor={Colors.textMuted}
                  />
                  {searching && <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />}
                </View>
                <View style={styles.uberInputDivider} />
              </>
            )}

            <View style={[styles.uberInputRow, activeField === 'drop' && styles.uberInputRowActive]}>
              <View style={[styles.inputSquare, { backgroundColor: '#E11D48' }]} />
              <TextInput
                style={styles.uberTextInput}
                placeholder="Where to?"
                value={dropQuery}
                onChangeText={setDropQuery}
                onFocus={() => setActiveField('drop')}
                placeholderTextColor={Colors.textMuted}
              />
              {searching && activeField === 'drop' && <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />}
            </View>
          </View>
        </View>
      )}

      {/* ── BOTTOM PANEL / SEARCH BODY ───────────────────── */}
      {isMapMode ? (
        <>
          <View style={styles.headerBarMap}>
            <TouchableOpacity onPress={() => setIsMapMode(false)} style={styles.backBtn}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.mapPickerFooter}>
            <Button
              title={isReverseGeocoding ? 'Getting address…' : `Confirm ${activeField === 'pickup' ? 'Pickup' : 'Drop'} Point`}
              onPress={handleConfirmMapLocation}
              disabled={isReverseGeocoding}
              fullWidth
              size="lg"
            />
          </View>
        </>
      ) : (
        /* Search body (white screen) */
        <View style={styles.searchBody}>
          
          {/* Action Row */}
          <View style={styles.actionRow}>
            {activeField === 'pickup' && (
              <TouchableOpacity style={styles.actionItem} onPress={handleUseCurrentLocation} disabled={locatingCurrent}>
                <View style={[styles.actionIconBg, { backgroundColor: Colors.primary + '15' }]}>
                  {locatingCurrent ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.actionIconText}>⌖</Text>}
                </View>
                <Text style={styles.actionText}>{locatingCurrent ? 'Locating…' : 'Current Location'}</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity style={styles.actionItem} onPress={() => { setIsMapMode(true); Keyboard.dismiss(); }}>
              <View style={[styles.actionIconBg, { backgroundColor: '#f3f4f6' }]}>
                <Text style={styles.actionIconText}>📍</Text>
              </View>
              <Text style={styles.actionText}>Set on map</Text>
            </TouchableOpacity>
            {activeField !== 'stop' && stops.length < 5 && (
              <TouchableOpacity style={styles.actionItem} onPress={() => { setActiveField('stop'); setStopQuery(''); }}>
                <View style={[styles.actionIconBg, { backgroundColor: Colors.warning + '20' }]}>
                  <Text style={styles.actionIconText}>+</Text>
                </View>
                <Text style={styles.actionText}>Add stop</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.dividerFull} />

          {/* Location List */}
          <ScrollView style={styles.locationList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {locationsToDisplay.map((loc, idx) => (
              <TouchableOpacity
                key={`${loc.latitude}-${idx}`}
                style={styles.uberListItem}
                onPress={() => selectLocation(loc)}
                activeOpacity={0.7}
              >
                <View style={styles.uberListIcon}>
                  <Text style={{ fontSize: 16 }}>📍</Text>
                </View>
                <View style={styles.uberListTextWrap}>
                  <Text style={styles.uberListTitle} numberOfLines={1}>{loc.address.split(',')[0]}</Text>
                  <Text style={styles.uberListSub} numberOfLines={1}>{loc.address}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Continue Button at bottom */}
          {pickupCoords && dropCoords && (
            <View style={styles.continueFooter}>
              <Button title="Continue →" onPress={handleContinue} fullWidth size="lg" />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.white },
  mapFull: { ...StyleSheet.absoluteFill },

  // Map Header
  headerBarMap: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 36 : 52,
    left: Spacing.lg,
    zIndex: 20,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  backIcon: { fontSize: 20, color: Colors.textPrimary },

  // Search Header
  searchHeader: {
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  backBtnPlain: { padding: Spacing.sm, marginLeft: -Spacing.sm },
  backIconPlain: { fontSize: 24, color: Colors.textPrimary },
  headerTitlePlain: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },

  // Uber Style Inputs
  uberInputContainer: {
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  connectingLine: {
    position: 'absolute',
    left: 27,
    top: 24,
    bottom: 24,
    width: 2,
    backgroundColor: Colors.textMuted + '40',
    zIndex: 1,
  },
  uberInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 48,
  },
  uberInputRowActive: {
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '50',
  },
  uberTextInput: {
    flex: 1,
    height: '100%',
    marginLeft: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  uberInputDivider: {
    height: Spacing.md,
  },
  inputDot: { width: 8, height: 8, borderRadius: 4, zIndex: 2 },
  inputSquare: { width: 8, height: 8, borderRadius: 1, zIndex: 2 },
  stopText: {
    flex: 1,
    marginLeft: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  removeStopText: {
    fontSize: FontSize.xs,
    color: Colors.error,
    fontWeight: FontWeight.semibold,
  },

  // Search Body
  searchBody: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  actionRow: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  actionIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconText: { fontSize: 16, color: Colors.textPrimary },
  actionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  dividerFull: { height: 6, backgroundColor: Colors.background },

  locationList: { flex: 1 },
  uberListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  uberListIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  uberListTextWrap: { flex: 1 },
  uberListTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.textPrimary, marginBottom: 2 },
  uberListSub: { fontSize: FontSize.sm, color: Colors.textMuted },

  continueFooter: {
    padding: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xxxl : Spacing.xl,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },

  // Map Center Pin
  centerPinContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -14,
    marginTop: -40,
    alignItems: 'center',
  },
  centerPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  pickupCenterPin: { backgroundColor: Colors.primary },
  dropCenterPin: { backgroundColor: '#E11D48' },
  centerPinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.white },
  pinStem: { width: 3, height: 16, marginTop: -2 },

  // Map Picker Footer
  mapPickerFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xxxl : Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.md,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  }
});
