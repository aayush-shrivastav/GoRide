import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
  Platform,
  Animated,
  PanResponder,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { getAllEstimates, createRide } from '../../services/api/rideApi';
import { useRide } from '../../context/RideContext';
import { useAuth } from '../../context/AuthContext';
import { VEHICLE_TYPES, PAYMENT_METHOD, VehicleType, PaymentMethod } from '../../constants/enums';
import Button from '../../components/common/Button';
import { MapContainer, MapContainerRef } from '../../components/map/MapContainer';
import { fetchOSRMRouteThroughPoints, LatLng } from '../../services/maps/osrmService';
import { parseApiError, truncateAddress } from '../../utils/formatters';

type Props = NativeStackScreenProps<PassengerStackParamList, 'FareEstimate'>;
const { height: SCREEN_H } = Dimensions.get('window');

// ── Constants ──────────────────────────────────────────────────
const SHEET_SNAP_COLLAPSED = SCREEN_H * 0.42;  // 42% from bottom
const SHEET_SNAP_EXPANDED  = SCREEN_H * 0.75;  // 75% from bottom

const VEHICLE_META: Record<string, { icon: string; label: string; capacity: string; desc: string }> = {
  bike:  { icon: '🛵', label: 'Go Bike',  capacity: '1 person',  desc: 'Fastest & cheapest' },
  auto:  { icon: '🛺', label: 'Go Auto',  capacity: '3 persons', desc: 'Affordable & quick' },
  car:   { icon: '🚗', label: 'Go Mini',  capacity: '4 persons', desc: 'Comfortable sedan' },
  suv:   { icon: '🚙', label: 'Go Prime', capacity: '6 persons', desc: 'Spacious SUV' },
};

const PAYMENT_ICONS: Record<string, string> = {
  [PaymentMethod.CASH]:   '💵',
  [PaymentMethod.ONLINE]: '📱',
};

export default function FareEstimateScreen({ navigation, route }: Props) {
  const { pickup, drop, stops = [] } = route.params;
  const { setCurrentRide, clearRide } = useRide();
  const { user } = useAuth();
  const mapRef = useRef<MapContainerRef>(null);

  // ── Data State ─────────────────────────────────────────────
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>(VehicleType.CAR);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [preferFemaleDriver, setPreferFemaleDriver] = useState(user?.gender === 'female');
  const [estimates, setEstimates] = useState<Record<string, any>>({});
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [showFareBreakdown, setShowFareBreakdown] = useState(false);

  // ── Bottom Sheet Animation ─────────────────────────────────
  const sheetHeight = useRef(new Animated.Value(SHEET_SNAP_COLLAPSED)).current;
  const isExpanded = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 8,
      onPanResponderMove: (_, gs) => {
        const current = isExpanded.current ? SHEET_SNAP_EXPANDED : SHEET_SNAP_COLLAPSED;
        const next = current - gs.dy;
        const clamped = Math.max(SHEET_SNAP_COLLAPSED, Math.min(SHEET_SNAP_EXPANDED, next));
        sheetHeight.setValue(clamped);
      },
      onPanResponderRelease: (_, gs) => {
        const midPoint = (SHEET_SNAP_COLLAPSED + SHEET_SNAP_EXPANDED) / 2;
        const currentH = isExpanded.current ? SHEET_SNAP_EXPANDED : SHEET_SNAP_COLLAPSED;
        const projected = currentH - gs.dy;
        const target = projected > midPoint ? SHEET_SNAP_EXPANDED : SHEET_SNAP_COLLAPSED;
        isExpanded.current = target === SHEET_SNAP_EXPANDED;
        Animated.spring(sheetHeight, {
          toValue: target,
          useNativeDriver: false,
          tension: 60,
          friction: 12,
        }).start();
      },
    })
  ).current;

  // ── Load estimates + route ─────────────────────────────────
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [estimateData, routeData] = await Promise.all([
        getAllEstimates(pickup, drop, stops),
        fetchOSRMRouteThroughPoints([
          { latitude: pickup.latitude, longitude: pickup.longitude },
          ...stops.map(stop => ({ latitude: stop.latitude, longitude: stop.longitude })),
          { latitude: drop.latitude, longitude: drop.longitude },
        ]),
      ]);
      setEstimates(estimateData.estimates || {});
      setDistanceKm(estimateData.distanceKm);
      setDurationMin(estimateData.durationMin);
      setRouteCoords(routeData.coordinates);

      // Fit map to route after a small delay
      setTimeout(() => {
        const all: LatLng[] = [
          { latitude: pickup.latitude, longitude: pickup.longitude },
          { latitude: drop.latitude, longitude: drop.longitude },
        ];
        mapRef.current?.fitBounds(all, 80);
      }, 500);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleBookRide() {
    setBooking(true);
    setError('');
    try {
      const ride = await createRide({
        pickup,
        drop,
        stops,
        vehicleType: selectedVehicle,
        paymentMethod: selectedPayment,
        preferFemaleDriver,
      });
      setCurrentRide(ride);
      navigation.replace('SearchingDriver', { rideId: ride._id });
    } catch (err: any) {
      const statusCode = err?.response?.status;
      const msg = parseApiError(err);

      // 409 = passenger already has an active ride in DB
      if (statusCode === 409) {
        if (Platform.OS === 'web') {
          const cancelAndRebook = typeof window !== 'undefined' && window.confirm
            ? window.confirm(
                'Active Ride Found!\n\nYou already have a ride in progress.\n\nClick OK to Cancel the previous ride and book this new one,\nor Cancel to return to your current active ride.'
              )
            : false;

          if (cancelAndRebook) {
            try {
              const { getActiveRide: fetchActive, cancelRide: doCancel } = await import('../../services/api/rideApi');
              const activeRide = await fetchActive();
              if (activeRide) {
                await doCancel(activeRide._id, 'Passenger cancelled to rebook');
              }
              clearRide();
              setBooking(false);
              return handleBookRide();
            } catch (cancelErr: any) {
              const cancelMsg = parseApiError(cancelErr);
              setError(`Could not cancel existing ride: ${cancelMsg}`);
              if (typeof window !== 'undefined') window.alert(`Could not cancel existing ride: ${cancelMsg}`);
              setBooking(false);
              return;
            }
          } else {
            try {
              const { getActiveRide: fetchActive } = await import('../../services/api/rideApi');
              const activeRide = await fetchActive();
              if (activeRide) {
                setCurrentRide(activeRide);
                if (activeRide.rideStatus === 'SEARCHING_DRIVER' || activeRide.rideStatus === 'REQUESTED') {
                  navigation.replace('SearchingDriver', { rideId: activeRide._id });
                } else {
                  navigation.replace('ActiveRide', { rideId: activeRide._id });
                }
                return;
              }
            } catch {
              navigation.navigate('HomeTabs' as any);
            }
            setBooking(false);
            return;
          }
        }

        Alert.alert(
          'Active Ride Found',
          'You already have a ride in progress. Would you like to go to that ride or cancel it and book a new one?',
          [
            {
              text: 'View Existing Ride',
              onPress: async () => {
                try {
                  const { getActiveRide: fetchActive } = await import('../../services/api/rideApi');
                  const activeRide = await fetchActive();
                  if (activeRide) {
                    setCurrentRide(activeRide);
                    if (activeRide.rideStatus === 'SEARCHING_DRIVER' || activeRide.rideStatus === 'REQUESTED') {
                      navigation.replace('SearchingDriver', { rideId: activeRide._id });
                    } else {
                      navigation.replace('ActiveRide', { rideId: activeRide._id });
                    }
                  }
                } catch {
                  navigation.navigate('HomeTabs' as any);
                }
              },
            },
            {
              text: 'Cancel & Rebook',
              style: 'destructive',
              onPress: async () => {
                try {
                  const { getActiveRide: fetchActive, cancelRide: doCancel } = await import('../../services/api/rideApi');
                  const activeRide = await fetchActive();
                  if (activeRide) {
                    await doCancel(activeRide._id, 'Passenger cancelled to rebook');
                  }
                  clearRide();
                  // Retry booking immediately
                  setBooking(false);
                  handleBookRide();
                } catch {
                  setError('Failed to cancel existing ride. Please try again.');
                  setBooking(false);
                }
              },
            },
            { text: 'Back', style: 'cancel' },
          ]
        );
        setBooking(false);
        return;
      }

      setError(msg);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(`Booking Failed: ${msg}`);
      } else {
        Alert.alert('Booking Failed', msg);
      }
    } finally {
      setBooking(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────
  const selectedEst = estimates[selectedVehicle];
  const selectedFare = selectedEst
    ? (typeof selectedEst === 'number' ? selectedEst : selectedEst.totalFare)
    : null;

  const pickupCoord: LatLng = { latitude: pickup.latitude, longitude: pickup.longitude };
  const dropCoord: LatLng   = { latitude: drop.latitude, longitude: drop.longitude };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── Map ─────────────────────────────────────────────── */}
      <View style={styles.mapContainer}>
        <MapContainer
          ref={mapRef}
          initialRegion={{
            latitude: pickup.latitude,
            longitude: pickup.longitude,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
          pickupLocation={pickupCoord}
          dropLocation={dropCoord}
          stopLocations={stops.map(stop => ({ latitude: stop.latitude, longitude: stop.longitude }))}
          routeCoordinates={routeCoords}
          showsUserLocation={false}
        />

        {/* Back button overlay */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        {/* Route info overlay (distance + ETA) */}
        {distanceKm && durationMin && (
          <View style={styles.routeInfoOverlay}>
            <Text style={styles.routeInfoText}>
              📍 {distanceKm} km  •  ⏱ {Math.round(durationMin)} min
            </Text>
          </View>
        )}
      </View>

      {/* ── Draggable Bottom Sheet ───────────────────────────── */}
      <Animated.View style={[styles.sheet, { height: sheetHeight }]}>
        {/* Drag Handle */}
        <View {...panResponder.panHandlers} style={styles.dragArea}>
          <View style={styles.dragHandle} />
          <Text style={styles.sheetTitle}>Choose Your Ride</Text>
        </View>

        <ScrollView
          style={styles.sheetScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Route Summary ──────────────────────────── */}
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
              <Text style={styles.routeAddr} numberOfLines={1}>
                {truncateAddress(pickup.address, 38)}
              </Text>
            </View>
            <View style={styles.routeConnector} />
            {stops.map((stop, index) => (
              <React.Fragment key={`${stop.latitude}-${stop.longitude}-${index}`}>
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: Colors.warning }]} />
                  <Text style={styles.routeAddr} numberOfLines={1}>
                    Stop {index + 1}: {truncateAddress(stop.address, 34)}
                  </Text>
                </View>
                <View style={styles.routeConnector} />
              </React.Fragment>
            ))}
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#E11D48' }]} />
              <Text style={styles.routeAddr} numberOfLines={1}>
                {truncateAddress(drop.address, 38)}
              </Text>
            </View>
          </View>

          {/* ── Loading / Error ────────────────────────── */}
          {loading && (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.centerStateText}>Getting best fares…</Text>
            </View>
          )}
          {error !== '' && !loading && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={loadAll} style={styles.retryBtn}>
                <Text style={styles.retryText}>↻ Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Vehicle List ───────────────────────────── */}
          {!loading && error === '' && (
            <View style={styles.vehicleList}>
              {(VEHICLE_TYPES as string[]).map((vt) => {
                const meta = VEHICLE_META[vt] || { icon: '🚗', label: vt, capacity: '4 persons', desc: '' };
                const est  = estimates[vt];
                const fare = est ? (typeof est === 'number' ? est : est.totalFare) : null;
                const isSelected = selectedVehicle === (vt as VehicleType);

                return (
                  <TouchableOpacity
                    key={vt}
                    style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
                    onPress={() => {
                      setSelectedVehicle(vt as VehicleType);
                      setShowFareBreakdown(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.vehicleIcon}>{meta.icon}</Text>
                    <View style={styles.vehicleInfo}>
                      <View style={styles.vehicleNameRow}>
                        <Text style={[styles.vehicleName, isSelected && styles.vehicleNameSelected]}>
                          {meta.label}
                        </Text>
                        {vt === 'car' && (
                          <View style={styles.recommendedBadge}>
                            <Text style={styles.recommendedText}>⭐ Popular</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.vehicleDesc}>
                        {meta.capacity}  •  {meta.desc}
                      </Text>
                    </View>
                    <View style={styles.vehiclePriceCol}>
                      {fare ? (
                        <>
                          <Text style={[styles.vehicleFare, isSelected && styles.vehicleFareSelected]}>
                            ₹{Math.round(fare)}
                          </Text>
                          <Text style={styles.vehicleEta}>~ 3 min</Text>
                        </>
                      ) : (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Fare Breakdown (expandable) ────────────── */}
          {!loading && selectedEst && selectedEst.baseFare !== undefined && (
            <View style={styles.breakdownSection}>
              <TouchableOpacity
                style={styles.breakdownHeader}
                onPress={() => setShowFareBreakdown(!showFareBreakdown)}
              >
                <Text style={styles.breakdownLabel}>Fare Breakdown  {showFareBreakdown ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showFareBreakdown && (
                <View style={styles.breakdownBody}>
                  <BreakdownRow label="Base Fare" value={`₹${selectedEst.baseFare}`} />
                  <BreakdownRow
                    label={`Distance (${distanceKm} km)`}
                    value={`₹${selectedEst.distanceFare}`}
                  />
                  <BreakdownRow
                    label={`Time (${Math.round(durationMin || 0)} min)`}
                    value={`₹${selectedEst.timeFare}`}
                  />
                  <BreakdownRow label="Platform Fee" value={`₹${selectedEst.platformFee}`} />
                  {selectedEst.surgeMultiplier > 1 && (
                    <BreakdownRow
                      label={`Surge (×${selectedEst.surgeMultiplier})`}
                      value="applied"
                      highlight
                    />
                  )}
                  <View style={styles.breakdownDivider} />
                  <BreakdownRow
                    label="Total"
                    value={`₹${Math.round(selectedEst.totalFare)}`}
                    bold
                  />
                </View>
              )}
            </View>
          )}

          {/* ── Female Driver Preference ───────────────── */}
          {user?.gender === 'female' && (
            <View style={[styles.femaleCard, preferFemaleDriver && styles.femaleCardActive]}>
              <View style={styles.femaleInfo}>
                <Text style={styles.femaleTitle}>👩‍✈️ Prefer Female Driver</Text>
                <Text style={styles.femaleSub}>
                  We'll try to match you with a verified female driver first.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, preferFemaleDriver && styles.toggleOn]}
                onPress={() => setPreferFemaleDriver(!preferFemaleDriver)}
                activeOpacity={0.8}
              >
                <View style={[styles.toggleDot, preferFemaleDriver && styles.toggleDotOn]} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Payment Method ─────────────────────────── */}
          <Text style={styles.sectionLabel}>Payment Method</Text>
          <View style={styles.paymentRow}>
            <TouchableOpacity
              style={[styles.payBtn, selectedPayment === PaymentMethod.ONLINE && styles.payBtnSelected]}
              onPress={() => setSelectedPayment(PaymentMethod.ONLINE)}
            >
              <Text style={styles.payIcon}>💳</Text>
              <Text style={[styles.payText, selectedPayment === PaymentMethod.ONLINE && styles.payTextSelected]}>
                Online (Stripe/UPI)
              </Text>
              {selectedPayment === PaymentMethod.ONLINE && (
                <View style={styles.paySelectedBadge}>
                  <Text style={styles.paySelectedBadgeText}>✓ Selected</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payBtn, selectedPayment === PaymentMethod.CASH && styles.payBtnSelected]}
              onPress={() => setSelectedPayment(PaymentMethod.CASH)}
            >
              <Text style={styles.payIcon}>💵</Text>
              <Text style={[styles.payText, selectedPayment === PaymentMethod.CASH && styles.payTextSelected]}>
                Cash to Driver
              </Text>
              {selectedPayment === PaymentMethod.CASH && (
                <View style={styles.paySelectedBadge}>
                  <Text style={styles.paySelectedBadgeText}>✓ Selected</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* ── Sticky Book Button ─────────────────────────── */}
        <View style={styles.bookFooter}>
          {error !== '' && (
            <View style={[styles.errorBox, { marginBottom: Spacing.sm, padding: Spacing.sm }]}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <Button
            title={
              selectedFare
                ? `Confirm ${VEHICLE_META[selectedVehicle]?.label || selectedVehicle} · ₹${Math.round(selectedFare)}`
                : 'Loading fares…'
            }
            onPress={handleBookRide}
            loading={booking}
            fullWidth
            size="lg"
            disabled={!selectedFare || loading || booking}
          />
        </View>
      </Animated.View>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────
function BreakdownRow({
  label,
  value,
  bold = false,
  highlight = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={bdStyles.row}>
      <Text style={[bdStyles.label, bold && bdStyles.bold, highlight && bdStyles.highlight]}>
        {label}
      </Text>
      <Text style={[bdStyles.value, bold && bdStyles.bold, highlight && bdStyles.highlight]}>
        {value}
      </Text>
    </View>
  );
}
const bdStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary },
  value: { fontSize: FontSize.sm, color: Colors.textPrimary },
  bold: { fontWeight: FontWeight.bold, color: Colors.textPrimary, fontSize: FontSize.base },
  highlight: { color: Colors.warning },
});

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  mapContainer: { ...StyleSheet.absoluteFill, zIndex: 0 },

  // Overlays on map
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 44 : 58,
    left: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  backIcon: { fontSize: 20, color: Colors.textPrimary },
  routeInfoOverlay: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 44 : 58,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  routeInfoText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },

  // Bottom Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 20,
    zIndex: 10,
  },
  dragArea: {
    paddingTop: 12,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    alignSelf: 'flex-start',
  },
  sheetScroll: { flex: 1, paddingHorizontal: Spacing.lg },

  // Route Card
  routeCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeConnector: {
    width: 1.5,
    height: 14,
    backgroundColor: Colors.border,
    marginLeft: 4,
    marginVertical: 3,
  },
  routeAddr: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },

  // States
  centerState: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.md },
  centerStateText: { fontSize: FontSize.sm, color: Colors.textMuted },
  errorBox: {
    backgroundColor: Colors.errorFaint,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  errorText: { fontSize: FontSize.sm, color: Colors.error, textAlign: 'center' },
  retryBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  retryText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },

  // Vehicle list
  vehicleList: { gap: Spacing.sm, marginTop: Spacing.sm },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  vehicleCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
  },
  vehicleIcon: { fontSize: 30, width: 36, textAlign: 'center' },
  vehicleInfo: { flex: 1, gap: 2 },
  vehicleNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  vehicleName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  vehicleNameSelected: { color: Colors.primary },
  vehicleDesc: { fontSize: FontSize.xs, color: Colors.textMuted },
  recommendedBadge: {
    backgroundColor: Colors.warningFaint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.warning },
  vehiclePriceCol: { alignItems: 'flex-end', minWidth: 60 },
  vehicleFare: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  vehicleFareSelected: { color: Colors.primary },
  vehicleEta: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Fare Breakdown
  breakdownSection: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  breakdownLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  breakdownBody: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  breakdownDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.sm },

  // Female preference
  femaleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  femaleCardActive: { borderColor: '#EC4899', backgroundColor: 'rgba(236,72,153,0.06)' },
  femaleInfo: { flex: 1, gap: 3 },
  femaleTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  femaleSub: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: 'center',
    padding: 3,
  },
  toggleOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.textMuted },
  toggleDotOn: { backgroundColor: Colors.white, alignSelf: 'flex-end' },

  // Payment
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  paymentRow: { flexDirection: 'row', gap: Spacing.md },
  payBtn: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  payBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryFaint },
  payIcon: { fontSize: 26 },
  payText: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },
  payTextSelected: { color: Colors.primary, fontWeight: FontWeight.bold },
  paySelectedBadge: {
    marginTop: 2,
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
  },
  paySelectedBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: FontWeight.bold,
  },

  // Book footer
  bookFooter: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
