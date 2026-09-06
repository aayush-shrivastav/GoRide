import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Platform,
  Linking,
  Dimensions,
} from 'react-native';
import { MapContainer } from '../../components/map/MapContainer';
import { fetchOSRMRouteThroughPoints, LatLng } from '../../services/maps/osrmService';
import { MapContainerRef } from '../../components/map/MapContainer';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DriverStackParamList } from '../../navigation/DriverNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { useRide } from '../../context/RideContext';
import { updateRideStatus, verifyOtp, triggerSos, getRide, startRide } from '../../services/api/rideApi';
import { updateDriverLocation } from '../../services/api/driverApi';
import { socketService } from '../../services/socket';
import * as Location from 'expo-location';
import { RIDE_STATUS } from '../../constants/enums';
import { Ride, SosTriggeredPayload } from '../../types/ride.types';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { parseApiError } from '../../utils/formatters';

type Props = NativeStackScreenProps<DriverStackParamList, 'ActiveRide'>;

const STATUS_RANK: Record<string, number> = {
  SEARCHING_DRIVER: 1,
  DRIVER_ASSIGNED: 2,
  DRIVER_ARRIVING: 3,
  DRIVER_ARRIVED: 4,
  RIDE_STARTED: 5,
  RIDE_COMPLETED: 6,
  CANCELLED_BY_PASSENGER: 7,
  CANCELLED_BY_DRIVER: 7,
  NO_DRIVER_FOUND: 7,
};

function isStaleRide(current: Ride | null, incoming: Ride): boolean {
  if (!current) return false;
  if (current._id !== incoming._id) return false;

  // 1. Timestamp check: if incoming is older than current, it is stale
  if (current.updatedAt && incoming.updatedAt) {
    const currentTs = new Date(current.updatedAt).getTime();
    const incomingTs = new Date(incoming.updatedAt).getTime();
    if (incomingTs < currentTs) {
      return true;
    }
  }

  // 2. Rank progression check: incoming status cannot regress behind current status
  const currentRank = STATUS_RANK[current.rideStatus] || 0;
  const incomingRank = STATUS_RANK[incoming.rideStatus] || 0;
  if (incomingRank < currentRank) {
    return true;
  }

  return false;
}

export default function ActiveRideScreen({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { currentRide, setCurrentRide, driverLocation, setDriverLocation, clearRide } = useRide();
  const mapRef = useRef<MapContainerRef>(null);
  
  const [loading, setLoading] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [sosLoading, setSosLoading] = useState(false);
  const [sosReceived, setSosReceived] = useState(false);
  const handledSosIds = useRef<Set<string>>(new Set());
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);

  const currentRideRef = useRef(currentRide);
  useEffect(() => {
    currentRideRef.current = currentRide;
  }, [currentRide]);

  const hasHandledTerminal = useRef(false);

  // ── Periodic Status Recovery Polling (Socket Fallback) ────────
  useEffect(() => {
    const terminalStatuses = [
      RIDE_STATUS.RIDE_COMPLETED,
      RIDE_STATUS.CANCELLED_BY_PASSENGER,
      RIDE_STATUS.CANCELLED_BY_DRIVER,
      RIDE_STATUS.NO_DRIVER_FOUND,
    ];

    if (!rideId || (currentRide && terminalStatuses.includes(currentRide.rideStatus as RIDE_STATUS))) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const latestRide = await getRide(rideId);
        if (!latestRide) return;

        // Ensure we do not overwrite newer local state with a stale response
        if (currentRideRef.current && isStaleRide(currentRideRef.current, latestRide)) {
          return;
        }

        // Only update state if something meaningful changed
        if (
          !currentRideRef.current ||
          currentRideRef.current.rideStatus !== latestRide.rideStatus ||
          currentRideRef.current.paymentStatus !== latestRide.paymentStatus
        ) {
          setCurrentRide(latestRide);
        }
      } catch (err) {
        // Transient network error; retry on next tick
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [rideId, currentRide?.rideStatus]);

  // Live Location Tracking for Driver during active ride
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    async function startTracking() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const initialPos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        handleLocation(initialPos.coords.latitude, initialPos.coords.longitude);

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Highest,
            distanceInterval: 5,
            timeInterval: 3000,
          },
          pos => handleLocation(pos.coords.latitude, pos.coords.longitude)
        );
      } catch (e) {}
    }

    async function handleLocation(lat: number, lng: number) {
      setDriverLocation({ latitude: lat, longitude: lng, timestamp: Date.now() });
      try {
        await updateDriverLocation(lat, lng);
        socketService.emitLocationUpdate(lat, lng, rideId);
      } catch (e) {}
    }

    startTracking();
    return () => {
      if (sub) sub.remove();
    };
  }, [rideId]);

  // OSRM Route Calculation
  useEffect(() => {
    if (!currentRide) return;
    const pickup = {
      latitude: currentRide.pickupLocation.coordinates[1],
      longitude: currentRide.pickupLocation.coordinates[0],
    };
    const dest = {
      latitude: currentRide.dropLocation.coordinates[1],
      longitude: currentRide.dropLocation.coordinates[0],
    };
    const stopCoords = (currentRide.stops || [])
      .sort((a, b) => a.order - b.order)
      .map(stop => ({ latitude: stop.location.coordinates[1], longitude: stop.location.coordinates[0] }));
    const routePoints = currentRide.rideStatus === RIDE_STATUS.RIDE_STARTED
      ? [pickup, ...stopCoords, dest]
      : [driverLocation || pickup, pickup];
    fetchOSRMRouteThroughPoints(routePoints).then(res => setRouteCoords(res.coordinates));
  }, [currentRide?.pickupLocation, currentRide?.dropLocation, currentRide?.rideStatus, driverLocation?.latitude, driverLocation?.longitude]);

  useEffect(() => {
    if (!currentRide) return;
    
    // Fit map
    const coords = [];
    if (driverLocation) coords.push(driverLocation);
    if (currentRide.pickupLocation) coords.push({ latitude: currentRide.pickupLocation.coordinates[1], longitude: currentRide.pickupLocation.coordinates[0] });
    if (currentRide.rideStatus === RIDE_STATUS.RIDE_STARTED) {
      (currentRide.stops || []).forEach(stop => coords.push({ latitude: stop.location.coordinates[1], longitude: stop.location.coordinates[0] }));
      if (currentRide.dropLocation) coords.push({ latitude: currentRide.dropLocation.coordinates[1], longitude: currentRide.dropLocation.coordinates[0] });
    }
    
    mapRef.current?.fitBounds(coords, 80);

    // Handle terminal ride statuses (passenger cancellation, remote cancellation, completion)
    if (hasHandledTerminal.current) return;

    if (currentRide.rideStatus === RIDE_STATUS.CANCELLED_BY_PASSENGER) {
      hasHandledTerminal.current = true;
      clearRide();
      Alert.alert('Ride Cancelled', 'The passenger cancelled the ride.', [
        { text: 'OK', onPress: () => navigation.replace('DriverTabs') }
      ]);
    } else if (currentRide.rideStatus === RIDE_STATUS.CANCELLED_BY_DRIVER) {
      hasHandledTerminal.current = true;
      clearRide();
      Alert.alert('Ride Cancelled', 'The ride has been cancelled.', [
        { text: 'OK', onPress: () => navigation.replace('DriverTabs') }
      ]);
    } else if (currentRide.rideStatus === RIDE_STATUS.RIDE_COMPLETED) {
      hasHandledTerminal.current = true;
      clearRide();
      navigation.replace('DriverTabs');
    }
  }, [currentRide?.rideStatus, driverLocation]);

  async function handleStatusUpdate(status: string) {
    setLoading(true);
    try {
      if (status === RIDE_STATUS.RIDE_COMPLETED && currentRide?.paymentMethod === 'cash') {
        Alert.alert(
          'Collect Cash',
          `Please collect ₹${Math.round(currentRide.finalFare || currentRide.estimatedFare)} from the passenger before ending the ride.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setLoading(false) },
            { 
              text: 'Cash Collected & End Ride', 
              onPress: async () => {
                try {
                  const res = await updateRideStatus(rideId, status);
                  hasHandledTerminal.current = true;
                  setCurrentRide(res);
                  clearRide();
                  navigation.replace('DriverTabs');
                } catch (err) {
                  Alert.alert('Update Failed', parseApiError(err));
                } finally {
                  setLoading(false);
                }
              }
            }
          ]
        );
        return;
      }

      const res = await updateRideStatus(rideId, status);
      hasHandledTerminal.current = true;
      setCurrentRide(res);
      
      if (status === RIDE_STATUS.RIDE_COMPLETED || status === RIDE_STATUS.CANCELLED_BY_DRIVER) {
        clearRide();
        navigation.replace('DriverTabs');
      }
    } catch (err) {
      Alert.alert('Update Failed', parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otpInput.length !== 4) {
      Alert.alert('Invalid OTP', 'OTP must be 4 digits.');
      return;
    }
    setLoading(true);
    try {
      if (
        currentRide?.rideStatus === RIDE_STATUS.DRIVER_ASSIGNED ||
        currentRide?.rideStatus === RIDE_STATUS.DRIVER_ARRIVING
      ) {
        await updateRideStatus(rideId, RIDE_STATUS.DRIVER_ARRIVED);
      }
      await verifyOtp(rideId, otpInput);
      const started = await startRide(rideId);
      setCurrentRide(started);
    } catch (err) {
      Alert.alert('Verification Failed', parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSos() {
    setSosLoading(true);
    try {
      const lat = driverLocation?.latitude ?? currentRide?.pickupLocation.coordinates[1] ?? 0;
      const lng = driverLocation?.longitude ?? currentRide?.pickupLocation.coordinates[0] ?? 0;
      await triggerSos(rideId, lat, lng);
      Alert.alert('SOS Triggered', 'The passenger has been notified.');
    } catch (err) {
      Alert.alert('SOS Failed', parseApiError(err));
    } finally {
      setSosLoading(false);
    }
  }

  function handleNavigateToMap() {
    if (!currentRide) return;
    const dest = currentRide.rideStatus === RIDE_STATUS.RIDE_STARTED 
      ? `${currentRide.dropLocation.coordinates[1]},${currentRide.dropLocation.coordinates[0]}`
      : `${currentRide.pickupLocation.coordinates[1]},${currentRide.pickupLocation.coordinates[0]}`;
    
    const url = Platform.select({
      ios: `maps:0,0?q=${dest}`,
      android: `geo:0,0?q=${dest}`,
    });
    if (url) Linking.openURL(url);
  }

  // Ensure ride details are loaded on mount
  useEffect(() => {
    if (!currentRide) {
      getRide(rideId)
        .then(ride => setCurrentRide(ride))
        .catch(err => {
          Alert.alert('Error', 'Failed to load ride details.');
          navigation.replace('DriverTabs');
        });
    }
  }, [rideId]);

  // ── Direct SOS Emergency Alert Handling ────────────────────
  useEffect(() => {
    const handleSosTriggered = (payload: SosTriggeredPayload) => {
      if (!payload?.rideId || payload.rideId !== rideId) return;

      const sosIdentifier = payload.sosId || `${payload.rideId}_${Date.now()}`;
      if (handledSosIds.current.has(sosIdentifier)) return;
      handledSosIds.current.add(sosIdentifier);

      setSosReceived(true);

      Alert.alert(
        '🚨 EMERGENCY ALERT: SOS TRIGGERED',
        'An emergency SOS alert has been triggered for this active ride. If you or the passenger are in immediate danger, please contact local emergency authorities (112 / 100) immediately.',
        [
          {
            text: 'Call Police (112)',
            onPress: () => Linking.openURL('tel:112'),
            style: 'destructive',
          },
          { text: 'I Understand', style: 'default' },
        ],
        { cancelable: false }
      );
    };

    socketService.on('sos_triggered', handleSosTriggered);
    return () => {
      socketService.off('sos_triggered', handleSosTriggered);
    };
  }, [rideId]);

  if (!currentRide) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle="dark-content" />
        <Text style={{ color: Colors.textSecondary, fontSize: FontSize.base }}>Loading ride details...</Text>
      </View>
    );
  }

  const passenger = typeof currentRide.passenger === 'object' ? currentRide.passenger : null;
  const isStarted = currentRide.rideStatus === RIDE_STATUS.RIDE_STARTED;
  const canEnterOtp = [
    RIDE_STATUS.DRIVER_ASSIGNED,
    RIDE_STATUS.DRIVER_ARRIVING,
    RIDE_STATUS.DRIVER_ARRIVED,
  ].includes(currentRide.rideStatus as RIDE_STATUS);

  const pickupCoord = {
    latitude: currentRide.pickupLocation.coordinates[1],
    longitude: currentRide.pickupLocation.coordinates[0],
  };

  const dropCoord = {
    latitude: currentRide.dropLocation.coordinates[1],
    longitude: currentRide.dropLocation.coordinates[0],
  };
  const stopCoords = (currentRide.stops || [])
    .sort((a, b) => a.order - b.order)
    .map(stop => ({ latitude: stop.location.coordinates[1], longitude: stop.location.coordinates[0] }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      <MapContainer
        ref={mapRef}
        initialRegion={{
          latitude: pickupCoord.latitude,
          longitude: pickupCoord.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        pickupLocation={pickupCoord}
        dropLocation={dropCoord}
        stopLocations={stopCoords}
        routeCoordinates={routeCoords}
        driverLocation={driverLocation || undefined}
        drivers={driverLocation ? [{ id: 'you', latitude: driverLocation.latitude, longitude: driverLocation.longitude, vehicleType: currentRide.vehicleType }] : []}
      />


      <View style={styles.topBar}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{currentRide.rideStatus.replace(/_/g, ' ')}</Text>
        </View>
        <TouchableOpacity style={styles.sosBtn} onPress={handleSos} disabled={sosLoading}>
          <Text style={styles.sosText}>SOS</Text>
        </TouchableOpacity>
      </View>

      {sosReceived && (
        <View style={styles.emergencyBanner}>
          <Text style={styles.emergencyBannerText}>🚨 EMERGENCY SOS ACTIVE ON THIS RIDE</Text>
        </View>
      )}

      <View style={styles.bottomSheet}>
        {/* Passenger Info */}
        <View style={styles.passengerBox}>
          <View style={styles.passengerInfo}>
            <Text style={styles.passengerName}>{passenger?.name ?? 'Passenger'}</Text>
            <View style={styles.paymentBadge}>
              <Text style={styles.paymentText}>
                {currentRide.paymentMethod === 'cash' ? '💵 Cash' : '📱 Online'}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.callBtn}
            onPress={() => passenger?.phone && Linking.openURL(`tel:${passenger.phone}`)}>
            <Text style={styles.callIcon}>📞</Text>
          </TouchableOpacity>
        </View>

        {/* Action Flow */}
        {(currentRide.stops?.length || 0) > 0 && (
          <View style={styles.stopsBox}>
            <Text style={styles.stopsTitle}>{currentRide.stops?.length} stop{currentRide.stops?.length === 1 ? '' : 's'} before destination</Text>
            {currentRide.stops?.sort((a, b) => a.order - b.order).map((stop, index) => (
              <Text key={`${stop.location.coordinates.join('-')}-${index}`} style={styles.stopItem} numberOfLines={1}>
                {index + 1}. {stop.address}
              </Text>
            ))}
          </View>
        )}

        {/* Action Flow */}
        <View style={styles.actionFlow}>
          {currentRide.rideStatus === RIDE_STATUS.DRIVER_ASSIGNED && (
            <Button
              title="I'm Arriving"
              onPress={() => handleStatusUpdate(RIDE_STATUS.DRIVER_ARRIVING)}
              loading={loading}
              fullWidth
            />
          )}

          {currentRide.rideStatus === RIDE_STATUS.DRIVER_ARRIVING && (
            <Button
              title="I've Arrived"
              onPress={() => handleStatusUpdate(RIDE_STATUS.DRIVER_ARRIVED)}
              loading={loading}
              fullWidth
            />
          )}

          {canEnterOtp && (
            <View style={styles.otpSection}>
              <Input
                label="Enter Passenger OTP"
                value={otpInput}
                onChangeText={setOtpInput}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="4-digit OTP"
              />
              <Button
                title="Verify OTP & Start Ride"
                onPress={handleVerifyOtp}
                loading={loading}
                disabled={otpInput.length !== 4}
                fullWidth
                style={{ marginTop: Spacing.sm }}
              />
            </View>
          )}

          {currentRide.rideStatus === RIDE_STATUS.RIDE_STARTED && (
            <View style={styles.activeSection}>
              <TouchableOpacity style={styles.navBtn} onPress={handleNavigateToMap}>
                <Text style={styles.navBtnText}>🧭 Open Google Maps</Text>
              </TouchableOpacity>
              <Button
                title="End Ride"
                onPress={() => handleStatusUpdate(RIDE_STATUS.RIDE_COMPLETED)}
                loading={loading}
                fullWidth
                variant="primary"
                style={styles.endRideBtn}
              />
            </View>
          )}

          {/* Cancel option if not started */}
          {!isStarted && currentRide.rideStatus !== RIDE_STATUS.RIDE_COMPLETED && (
            <TouchableOpacity 
              style={styles.cancelLink}
              onPress={() => {
                Alert.alert('Cancel Ride', 'Are you sure?', [
                  { text: 'No' },
                  { text: 'Yes, Cancel', style: 'destructive', onPress: () => handleStatusUpdate(RIDE_STATUS.CANCELLED_BY_DRIVER) }
                ]);
              }}>
              <Text style={styles.cancelLinkText}>Cancel Ride</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  map: StyleSheet.absoluteFill,
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 60,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  statusText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.secondary,
  },
  sosBtn: {
    backgroundColor: Colors.sos,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  sosText: { color: Colors.white, fontWeight: FontWeight.bold },
  emergencyBanner: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 95 : 115,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.error,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 8,
  },
  emergencyBannerText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
    letterSpacing: 0.5,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  passengerBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  passengerInfo: { gap: Spacing.xs },
  passengerName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  paymentBadge: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  paymentText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  callBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.successFaint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.success,
  },
  callIcon: { fontSize: 24 },
  actionFlow: {
    gap: Spacing.md,
  },
  stopsBox: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stopsTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  stopItem: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  otpSection: { gap: Spacing.xs },
  activeSection: { gap: Spacing.md },
  navBtn: {
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  navBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  endRideBtn: {
    backgroundColor: Colors.error, // End ride is usually red/primary
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  cancelLinkText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    fontWeight: FontWeight.semibold,
  },
});
