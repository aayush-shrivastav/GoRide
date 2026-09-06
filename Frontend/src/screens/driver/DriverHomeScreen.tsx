import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { MapContainer } from '../../components/map/MapContainer';
import { MapContainerRef } from '../../components/map/MapContainer';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DriverStackParamList } from '../../navigation/DriverNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useRide } from '../../context/RideContext';
import { useNotifications } from '../../context/NotificationContext';
import { socketService } from '../../services/socket';
import { updateDriverLocation, toggleDriverStatus, rejectRide } from '../../services/api/driverApi';
import { acceptRide } from '../../services/api/rideApi';
import RideRequestCard from '../../components/driver/RideRequestCard';
import Avatar from '../../components/common/Avatar';
import { parseApiError } from '../../utils/formatters';
import { Ride, PaymentUpdatedPayload } from '../../types/ride.types';
import { RIDE_STATUS } from '../../constants/enums';

type Props = NativeStackScreenProps<DriverStackParamList, 'DriverTabs'>;

const DEFAULT_REGION = {
  latitude: 19.076,
  longitude: 72.877,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function DriverHomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { currentRide, setCurrentRide, driverLocation, setDriverLocation, pendingRequest, clearPendingRequest } = useRide();
  const { unreadCount } = useNotifications();
  const mapRef = useRef<MapContainerRef>(null);

  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [processingRequest, setProcessingRequest] = useState(false);
  const [locationSubscription, setLocationSubscription] =
    useState<Location.LocationSubscription | null>(null);

  // If already in an active ride, redirect
  useEffect(() => {
    if (currentRide && currentRide.rideStatus !== RIDE_STATUS.RIDE_COMPLETED && currentRide.rideStatus !== RIDE_STATUS.CANCELLED_BY_PASSENGER && currentRide.rideStatus !== RIDE_STATUS.CANCELLED_BY_DRIVER) {
      navigation.navigate('ActiveRide', { rideId: currentRide._id });
    }
  }, [currentRide]);

  // Keep a ref to the current ride so background location callbacks have the latest value
  const currentRideRef = useRef(currentRide);
  useEffect(() => {
    currentRideRef.current = currentRide;
  }, [currentRide]);

  // Listen for rating_received socket event — show driver their new rating
  useEffect(() => {
    const handleRatingReceived = (data: { stars: number; review?: string; newAverage: number; newCount: number }) => {
      const stars = '⭐'.repeat(data.stars);
      Alert.alert(
        `New Rating: ${stars}`,
        `A passenger rated you ${data.stars}/5${data.review ? `\n"${data.review}"` : ''}\n\nYour new average: ${data.newAverage}★ (${data.newCount} ratings)`,
        [{ text: 'Great!', style: 'default' }],
      );
    };
    socketService.on('rating_received', handleRatingReceived);
    return () => socketService.off('rating_received', handleRatingReceived);
  }, []);

  // Listen for payment_updated socket event — notify driver when online fare settles
  useEffect(() => {
    const handlePaymentUpdated = (data: PaymentUpdatedPayload) => {
      if (data?.status === 'SUCCESS') {
        Alert.alert(
          'Payment Received 💰',
          'The passenger has completed online payment for the ride.',
          [{ text: 'Great!', style: 'default' }],
        );
      }
    };
    socketService.on('payment_updated', handlePaymentUpdated);
    return () => socketService.off('payment_updated', handlePaymentUpdated);
  }, []);

  // Handle location tracking when online
  useEffect(() => {
    if (isOnline) {
      socketService.emitDriverOnline();
      startLocationTracking();
    } else {
      stopLocationTracking();
    }
    return () => stopLocationTracking();
  }, [isOnline]);

  async function startLocationTracking() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const initialPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
        mayShowUserSettingsDialog: true,
      });
      updateLocation(initialPos.coords.latitude, initialPos.coords.longitude);
      
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          distanceInterval: 5,
          timeInterval: 3000,
        },
        pos => updateLocation(pos.coords.latitude, pos.coords.longitude)
      );
      setLocationSubscription(sub);
    } catch (e) {
      console.log('Location tracking error', e);
    }
  }

  function stopLocationTracking() {
    if (locationSubscription) {
      locationSubscription.remove();
      setLocationSubscription(null);
    }
  }

  async function updateLocation(lat: number, lng: number) {
    setDriverLocation({ latitude: lat, longitude: lng, timestamp: Date.now() });
    mapRef.current?.flyTo([lng, lat], 16);
    try {
      await updateDriverLocation(lat, lng);
      // Pass the active ride ID so backend can stream it to the passenger
      socketService.emitLocationUpdate(lat, lng, currentRideRef.current?._id);
    } catch (e) {
      // Background location update error
    }
  }

  async function handleToggleStatus() {
    setLoadingStatus(true);
    try {
      const newStatus = !isOnline;

      if (newStatus) {
        // Before going online, get current location and push it to DB
        // so the matching service can find this driver in $near queries.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Required',
            'Please enable location permission to go online and receive ride requests.',
          );
          setLoadingStatus(false);
          return;
        }
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          // Push location to DB first, THEN mark online so matching loop
          // finds a valid coordinate and not the default [0, 0].
          await updateDriverLocation(pos.coords.latitude, pos.coords.longitude);
          socketService.emitLocationUpdate(pos.coords.latitude, pos.coords.longitude);
          setDriverLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, timestamp: Date.now() });
          mapRef.current?.flyTo([pos.coords.longitude, pos.coords.latitude], 16);
        } catch (locErr) {
          console.warn('Could not pre-fetch location before going online:', locErr);
        }
      }

      await toggleDriverStatus(newStatus);
      setIsOnline(newStatus);
      if (newStatus) {
        socketService.emitDriverOnline();
        // Backend may return an activeRideId if the driver had a stale active ride
        // In that case, navigate them to it directly
      } else {
        socketService.emitDriverOffline();
      }
    } catch (err) {
      Alert.alert('Status Update Failed', parseApiError(err));
    } finally {
      setLoadingStatus(false);
    }
  }

  async function handleAccept(ride: any) {
    setProcessingRequest(true);
    try {
      const rideId = ride._id || ride.rideId || ride.ride?._id;
      const res = await acceptRide(rideId);
      setCurrentRide(res);
      clearPendingRequest?.();
      navigation.navigate('ActiveRide', { rideId });
    } catch (err) {
      Alert.alert('Accept Failed', parseApiError(err));
      clearPendingRequest?.();
    } finally {
      setProcessingRequest(false);
    }
  }

  async function handleReject(ride: any) {
    setProcessingRequest(true);
    try {
      const rideId = ride._id || ride.rideId || ride.ride?._id;
      await rejectRide(rideId);
      clearPendingRequest?.();
    } catch (err) {
      Alert.alert('Reject Failed', parseApiError(err));
      clearPendingRequest?.();
    } finally {
      setProcessingRequest(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <MapContainer
        ref={mapRef}
        initialRegion={DEFAULT_REGION}
        pickupLocation={driverLocation ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude } : undefined}
      />



      {/* Top overlay */}
      <View style={styles.topOverlay}>
        <View style={styles.topBar}>
          <View style={styles.statusBox}>
            <View style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Earnings')}>
              <Text style={styles.iconBtnText}>💰</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('DriverProfile' as any)}>
              <Avatar name={user?.name ?? 'D'} imageUri={user?.profileImage} size={40} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bottom area */}
      <View style={styles.bottomArea}>
        {pendingRequest ? (
          <RideRequestCard
            ride={pendingRequest}
            onAccept={() => handleAccept(pendingRequest)}
            onReject={() => handleReject(pendingRequest)}
            loading={processingRequest}
          />
        ) : (
          <View style={styles.goOnlineCard}>
            <Text style={styles.goOnlineTitle}>
              {isOnline ? 'You are online' : 'You are offline'}
            </Text>
            <Text style={styles.goOnlineSub}>
              {isOnline
                ? 'Waiting for ride requests...'
                : 'Go online to start receiving ride requests.'}
            </Text>
            <TouchableOpacity
              style={[styles.toggleBtn, isOnline ? styles.btnOffline : styles.btnOnline]}
              onPress={handleToggleStatus}
              disabled={loadingStatus}>
              <Text style={styles.toggleBtnText}>
                {loadingStatus ? 'Updating...' : isOnline ? 'GO OFFLINE' : 'GO ONLINE'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  map: StyleSheet.absoluteFill,
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
    paddingTop: Platform.OS === 'android' ? 44 : 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.mapOverlay,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  onlineDot: { backgroundColor: Colors.success },
  offlineDot: { backgroundColor: Colors.textMuted },
  statusText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 20 },
  bottomArea: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 10,
    elevation: 10,
  },

  goOnlineCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  goOnlineTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  goOnlineSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  toggleBtn: {
    width: '100%',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  btnOnline: { backgroundColor: Colors.primary },
  btnOffline: { backgroundColor: Colors.error },
  toggleBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    letterSpacing: 1,
  },
});
