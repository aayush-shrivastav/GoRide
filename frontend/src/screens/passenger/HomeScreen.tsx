import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapContainerRef } from '../../components/map/MapContainer';
import { MapContainer } from '../../components/map/MapContainer';
import { getCurrentUserLocation, requestLocationPermission } from '../../services/maps/locationService';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useRide } from '../../context/RideContext';
import { useNotifications } from '../../context/NotificationContext';
import { RIDE_STATUS, CANCELLABLE_STATUSES } from '../../constants/enums';
import Avatar from '../../components/common/Avatar';
import Ionicons from '@expo/vector-icons/Ionicons';

const DEFAULT_REGION = {
  latitude: 28.6139,
  longitude: 77.2090,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { currentRide, otp, setCurrentRide } = useRide();
  const { unreadCount } = useNotifications();
  const mapRef = useRef<MapContainerRef>(null);
  const isFocused = useIsFocused();

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    loadCurrentLocation();
    checkActiveRide();
  }, []);

  async function checkActiveRide() {
    try {
      const { getActiveRide } = await import('../../services/api/rideApi');
      const active = await getActiveRide();
      if (active) {
        setCurrentRide(active);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!isFocused) return;
    if (!currentRide) return;

    // Ignore rides that are already finished — don't redirect away from Home
    const terminalStatuses: string[] = [
      RIDE_STATUS.RIDE_COMPLETED,
      RIDE_STATUS.CANCELLED_BY_DRIVER,
      RIDE_STATUS.CANCELLED_BY_PASSENGER,
      RIDE_STATUS.NO_DRIVER_FOUND,
    ];
    if (terminalStatuses.includes(currentRide.rideStatus)) return;

    if (currentRide.rideStatus === RIDE_STATUS.SEARCHING_DRIVER) {
      navigation.navigate('SearchingDriver', { rideId: currentRide._id });
    } else if (
      (CANCELLABLE_STATUSES as string[]).includes(currentRide.rideStatus) &&
      currentRide.rideStatus !== RIDE_STATUS.SEARCHING_DRIVER
    ) {
      navigation.navigate('ActiveRide', { rideId: currentRide._id });
    } else if (
      currentRide.rideStatus === RIDE_STATUS.RIDE_STARTED
    ) {
      navigation.navigate('ActiveRide', { rideId: currentRide._id });
    }
  }, [currentRide, isFocused, navigation]);


  async function loadCurrentLocation() {
    setLocationLoading(true);
    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setLocationError('Location permission not granted. Tap to enable.');
        const fallback = await getCurrentUserLocation();
        if (fallback) {
          updateMapLocation(fallback.latitude, fallback.longitude);
        }
        return;
      }

      const pos = await getCurrentUserLocation();
      if (!pos) {
        setLocationError('Could not detect location. Please check device GPS.');
        return;
      }
      setLocationError('');
      updateMapLocation(pos.latitude, pos.longitude);
    } catch (err: any) {
      if (!userLocation) {
        setLocationError(err.message || 'Error getting current location');
      }
    } finally {
      setLocationLoading(false);
    }
  }

  function updateMapLocation(latitude: number, longitude: number) {
    setUserLocation({ latitude, longitude });
    mapRef.current?.flyTo([longitude, latitude], 15);
  }

  function handleRecenter() {
    if (userLocation) {
      mapRef.current?.flyTo([userLocation.longitude, userLocation.latitude], 15);
    } else {
      loadCurrentLocation();
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <MapContainer
        ref={mapRef}
        initialRegion={DEFAULT_REGION}
        userLocation={userLocation}
        pickupLocation={null}
        showsUserLocation
        showsMyLocationButton
      />

      <TouchableOpacity
        style={styles.recenterBtn}
        onPress={handleRecenter}
        activeOpacity={0.8}
        accessibilityLabel="Recenter map to my location">
        {locationLoading ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Ionicons name="locate" size={22} color={Colors.primary} />
        )}
      </TouchableOpacity>

      <View style={[styles.topOverlay, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Avatar name={user?.name ?? 'U'} imageUri={user?.profileImage} size={32} />
            <Text style={styles.brandName}>GoRide</Text>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('VoiceBooking')}
              accessibilityLabel="Book a ride by voice">
              <Ionicons name="mic-outline" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Profile')}>
              <Ionicons name="person-outline" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.greetingChip, { top: insets.top + 76 }]}>
        <Ionicons name="sunny-outline" size={16} color={Colors.warning} />
        <Text style={styles.greetingText}>
          {greeting}, {user?.name?.split(' ')[0] ?? 'there'}
        </Text>
      </View>
{otp && (
  <View style={styles.otpBanner}>
    <Text style={styles.otpText}>OTP: {otp}</Text>
  </View>
)}
      <View style={styles.bottomSheet}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>Where are you going?</Text>

        {locationError ? (
          <View style={styles.locationError}>
            <Text style={styles.locationErrorText}>{locationError}</Text>
            <TouchableOpacity onPress={loadCurrentLocation}>
              <Text style={styles.retryText}>Enable Location</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.routeInputs}>
          <View style={styles.routeLine} />
          <TouchableOpacity
            style={styles.pickupInput}
            onPress={loadCurrentLocation}
            activeOpacity={0.8}
            accessibilityLabel="Current pickup location">
            <View style={styles.pickupDot} />
            <Text style={styles.inputText} numberOfLines={1}>
              {locationLoading
                ? 'Locating your position...'
                : userLocation
                ? 'Current Location'
                : 'Tap to find location'}
            </Text>
            {locationLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="navigate-outline" size={18} color={Colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.destinationInput}
            onPress={() => navigation.navigate('SelectLocation')}
            activeOpacity={0.75}>
            <View style={styles.dropDiamond} />
            <Text style={styles.placeholderText}>Search destination</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickActions}>
          {['Home', 'Work', 'Recent Places'].map(label => (
            <TouchableOpacity
              key={label}
              style={styles.quickBtn}
              onPress={() => navigation.navigate('SelectLocation')}
              activeOpacity={0.75}>
              <Text style={styles.quickBtnText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 10,
    backgroundColor: Colors.mapOverlay,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  brandName: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold },
  greetingChip: {
    position: 'absolute',
    left: Spacing.lg,
    zIndex: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.divider,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  greetingText: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 72,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    gap: Spacing.md,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E3E5',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  sheetTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.sm,
  },
  locationError: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.warningFaint,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  locationErrorText: { flex: 1, fontSize: FontSize.sm, color: Colors.warning },
  retryText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  routeInputs: {
    position: 'relative',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  routeLine: {
    position: 'absolute',
    left: 25,
    top: 28,
    bottom: 28,
    width: 2,
    backgroundColor: Colors.border,
    zIndex: 0,
  },
  pickupInput: {
    minHeight: 56,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surfaceElevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    zIndex: 1,
  },
  destinationInput: {
    minHeight: 56,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 1,
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  dropDiamond: {
    width: 10,
    height: 10,
    backgroundColor: Colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  inputText: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  placeholderText: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
  },
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.sm,
  },
  quickBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  quickBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  otpBanner: {
    backgroundColor: Colors.primary,
    padding: Spacing.sm,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  otpText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  recenterBtn: {
    position: 'absolute',
    bottom: 350,
    right: Spacing.lg,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 15,
  },
});
