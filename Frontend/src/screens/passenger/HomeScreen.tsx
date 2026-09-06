import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
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

const DEFAULT_REGION = {
  latitude: 19.076,
  longitude: 72.877,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function HomeScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const { currentRide, otp } = useRide();
  const { unreadCount } = useNotifications();
  const mapRef = useRef<MapContainerRef>(null);

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    loadCurrentLocation();
  }, []);

  useEffect(() => {
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
  }, [currentRide, navigation]);


  async function loadCurrentLocation() {
    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setLocationError('Location permission denied');
        return;
      }

      const pos = await getCurrentUserLocation();
      if (!pos) {
        setLocationError('Current location unavailable. Turn on GPS/high accuracy mode.');
        return;
      }
      updateMapLocation(pos.latitude, pos.longitude);
    } catch (err: any) {
      if (!userLocation) {
        setLocationError(err.message || 'Error getting current location');
      }
    }
  }

  function updateMapLocation(latitude: number, longitude: number) {
    setUserLocation({ latitude, longitude });
    mapRef.current?.flyTo([longitude, latitude], 14);
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <MapContainer
        ref={mapRef}
        initialRegion={DEFAULT_REGION}
        pickupLocation={userLocation}
        showsUserLocation
        showsMyLocationButton
      />

      <View style={styles.topOverlay}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Avatar name={user?.name ?? 'U'} imageUri={user?.profileImage} size={32} />
            <Text style={styles.brandName}>GoRide</Text>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Notifications')}>
              <Text style={styles.iconBtnText}>Bell</Text>
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Profile')}>
              <Text style={styles.iconBtnText}>Me</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.greetingChip}>
        <Text style={styles.greetingIcon}>Hi</Text>
        <Text style={styles.greetingText}>
          Good morning, {user?.name?.split(' ')[0] ?? 'Ayush'}
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
          <View style={styles.pickupInput}>
            <View style={styles.pickupDot} />
            <Text style={styles.inputText} numberOfLines={1}>
              {userLocation ? 'Current Location' : 'Finding current location'}
            </Text>
          </View>
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
    paddingTop: Platform.OS === 'android' ? 32 : 48,
    paddingHorizontal: 20,
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
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBtnText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
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
    top: Platform.OS === 'android' ? 82 : 96,
    left: 20,
    zIndex: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  greetingIcon: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
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
});
