import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';

import * as Location from 'expo-location';

import { MapContainer } from '../../components/map/MapContainer';
import { MapContainerRef } from '../../components/map/MapContainer';

import {
  NativeStackScreenProps,
} from '@react-navigation/native-stack';

import {
  DriverStackParamList,
} from '../../navigation/DriverNavigator';

import { Colors } from '../../constants/colors';

import {
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
} from '../../constants/theme';

import { useAuth } from '../../context/AuthContext';

import { useRide } from '../../context/RideContext';

import { useNotifications } from '../../context/NotificationContext';

import { socketService } from '../../services/socket';

import {
  updateDriverLocation,
  toggleDriverStatus,
  getDriverStatus,
  rejectRide,
  getDriverPendingRequest,
} from '../../services/api/driverApi';

import { acceptRide } from '../../services/api/rideApi';

import RideRequestCard from '../../components/driver/RideRequestCard';

import Avatar from '../../components/common/Avatar';

import { parseApiError } from '../../utils/formatters';

import {
  PaymentUpdatedPayload,
} from '../../types/ride.types';

import { RIDE_STATUS } from '../../constants/enums';

type Props = NativeStackScreenProps<
  DriverStackParamList,
  'DriverTabs'
>;

const DEFAULT_REGION = {
  latitude: 19.076,
  longitude: 72.877,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function DriverHomeScreen({
  navigation,
}: Props) {
  const {
    driver,
    user,
    updateLocalDriver,
  } = useAuth();

  const {
    currentRide,
    setCurrentRide,
    driverLocation,
    setDriverLocation,
    pendingRequest,
    clearPendingRequest,
    setPendingRequest,
  } = useRide();

  // Used to avoid unused-variable issue if notifications are needed later.
  useNotifications();

  const mapRef =
    useRef<MapContainerRef>(null);

  const [
    isOnline,
    setIsOnline,
  ] = useState(
    Boolean(driver?.isOnline)
  );

  const [
    loadingStatus,
    setLoadingStatus,
  ] = useState(false);

  const [
    processingRequest,
    setProcessingRequest,
  ] = useState(false);

  const [
    locationSubscription,
    setLocationSubscription,
  ] =
    useState<Location.LocationSubscription | null>(
      null
    );

  /*
   * Keep latest ride available to location callbacks.
   */
  const currentRideRef =
    useRef(currentRide);

  useEffect(() => {
    currentRideRef.current =
      currentRide;
  }, [currentRide]);

  /*
   * Sync online status with backend.
   */
  useEffect(() => {
    let mounted = true;

    async function syncStatus() {
      try {
        const status =
          await getDriverStatus();

        if (
          !mounted ||
          typeof status?.isOnline !==
          'boolean'
        ) {
          return;
        }

        setIsOnline(
          status.isOnline
        );

        updateLocalDriver({
          isOnline:
            status.isOnline,
          isAvailable:
            status.isAvailable,
        });

        if (status.isOnline) {
          socketService.emitDriverOnline();
        }
      } catch (err) {
        console.warn(
          '[DriverHome] Failed to sync driver status:',
          err
        );
      }
    }

    syncStatus();

    return () => {
      mounted = false;
    };
  }, [updateLocalDriver]);

  /*
   * Fallback polling for pending ride requests while online and not on an active ride.
   * Ensures driver sees incoming requests even if Socket.IO packets are delayed or reconnecting.
   */
  useEffect(() => {
    if (!isOnline || currentRide) {
      return;
    }

    let mounted = true;

    async function pollPendingRequest() {
      try {
        const req = await getDriverPendingRequest();
        if (!mounted) return;

        if (req && !pendingRequest) {
          setPendingRequest?.(req);
        } else if (!req && pendingRequest) {
          clearPendingRequest?.();
        }
      } catch (err) {
        // Silently catch polling errors
      }
    }

    pollPendingRequest();
    const interval = setInterval(pollPendingRequest, 3000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isOnline, currentRide, pendingRequest, setPendingRequest, clearPendingRequest]);

  /*
   * If driver already has an active ride,
   * open ActiveRide screen.
   */
  useEffect(() => {
    if (!currentRide) {
      return;
    }

    const terminalStatuses = [
      RIDE_STATUS.RIDE_COMPLETED,
      RIDE_STATUS.CANCELLED_BY_PASSENGER,
      RIDE_STATUS.CANCELLED_BY_DRIVER,
      RIDE_STATUS.NO_DRIVER_FOUND,
    ];

    if (
      terminalStatuses.includes(
        currentRide.rideStatus as RIDE_STATUS
      )
    ) {
      return;
    }

    navigation.navigate(
      'ActiveRide',
      {
        rideId:
          currentRide._id,
      }
    );
  }, [
    currentRide,
    navigation,
  ]);

  /*
   * Rating notification.
   */
  useEffect(() => {
    const handleRatingReceived = (
      data: {
        stars: number;
        review?: string;
        newAverage: number;
        newCount: number;
      }
    ) => {
      if (!data) {
        return;
      }

      const stars =
        '⭐'.repeat(
          Math.max(
            0,
            Math.min(
              5,
              Number(data.stars) || 0
            )
          )
        );

      Alert.alert(
        `New Rating: ${stars}`,
        `A passenger rated you ${data.stars}/5${data.review
          ? `\n"${data.review}"`
          : ''
        }\n\nYour new average: ${data.newAverage}★ (${data.newCount} ratings)`,
        [
          {
            text: 'Great!',
          },
        ]
      );
    };

    socketService.on(
      'rating_received',
      handleRatingReceived
    );

    return () => {
      socketService.off(
        'rating_received',
        handleRatingReceived
      );
    };
  }, []);

  /*
   * Online payment notification.
   */
  useEffect(() => {
    const handlePaymentUpdated = (
      data: PaymentUpdatedPayload
    ) => {
      if (
        data?.status !== 'SUCCESS'
      ) {
        return;
      }

      Alert.alert(
        'Payment Received 💰',
        'The passenger has completed online payment for the ride.',
        [
          {
            text: 'Great!',
          },
        ]
      );
    };

    socketService.on(
      'payment_updated',
      handlePaymentUpdated
    );

    return () => {
      socketService.off(
        'payment_updated',
        handlePaymentUpdated
      );
    };
  }, []);

  /*
   * Start/stop location tracking according
   * to driver online state.
   */
  useEffect(() => {
    if (!isOnline) {
      stopLocationTracking();
      return;
    }

    startLocationTracking();

    return () => {
      stopLocationTracking();
    };
  }, [isOnline]);

  /*
   * Start foreground GPS tracking.
   */
  async function startLocationTracking() {
    try {
      const {
        status,
      } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Location Required',
          'Please enable location permission to receive ride requests.'
        );

        return;
      }

      /*
       * Send initial location immediately.
       */
      const initialPosition =
        await Location.getCurrentPositionAsync(
          {
            accuracy:
              Location.Accuracy.Highest,
            mayShowUserSettingsDialog:
              true,
          }
        );

      await updateLocation(
        initialPosition.coords.latitude,
        initialPosition.coords.longitude
      );

      /*
       * Watch location.
       */
      const subscription =
        await Location.watchPositionAsync(
          {
            accuracy:
              Location.Accuracy.Highest,
            distanceInterval: 5,
            timeInterval: 3000,
          },
          (position) => {
            updateLocation(
              position.coords.latitude,
              position.coords.longitude
            );
          }
        );

      setLocationSubscription(
        subscription
      );
    } catch (error) {
      console.warn(
        '[DriverHome] Location tracking failed:',
        error
      );
    }
  }

  /*
   * Stop GPS tracking.
   */
  function stopLocationTracking() {
    if (!locationSubscription) {
      return;
    }

    locationSubscription.remove();

    setLocationSubscription(
      null
    );
  }

  /*
   * Update local state + backend location +
   * passenger socket location.
   */
  async function updateLocation(
    latitude: number,
    longitude: number
  ) {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    setDriverLocation({
      latitude,
      longitude,
      timestamp: Date.now(),
    });

    mapRef.current?.flyTo(
      [longitude, latitude],
      16
    );

    try {
      /*
       * REST update ensures MongoDB location
       * remains available for $near matching.
       */
      await updateDriverLocation(
        latitude,
        longitude
      );

      /*
       * Socket update is only needed for
       * passenger live tracking.
       */
      socketService.emitLocationUpdate(
        latitude,
        longitude,
        currentRideRef.current?._id
      );
    } catch (error) {
      console.warn(
        '[DriverHome] Failed to update location:',
        error
      );
    }
  }

  /*
   * Toggle online/offline.
   */
  async function handleToggleStatus() {
    if (loadingStatus) {
      return;
    }

    setLoadingStatus(true);

    const newStatus = !isOnline;

    try {
      /*
       * Going ONLINE:
       *
       * 1. Check permission.
       * 2. Get GPS.
       * 3. Save GPS to backend.
       * 4. Then mark driver online.
       *
       * This prevents the matching service from seeing
       * an online driver with stale/[0,0] location.
       */
      if (newStatus) {
        const {
          status,
        } =
          await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          Alert.alert(
            'Location Required',
            'Please enable location permission to go online and receive ride requests.'
          );

          return;
        }

        let position;

        try {
          position =
            await Location.getCurrentPositionAsync(
              {
                accuracy:
                  Location.Accuracy.Highest,
                mayShowUserSettingsDialog:
                  true,
              }
            );
        } catch (locationError) {
          console.warn(
            '[DriverHome] Failed to get current location:',
            locationError
          );

          Alert.alert(
            'Location Error',
            'Unable to get your current location. Please make sure GPS is enabled and try again.'
          );

          return;
        }

        const latitude =
          position.coords.latitude;

        const longitude =
          position.coords.longitude;

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          Alert.alert(
            'Invalid Location',
            'Your current location could not be determined. Please try again.'
          );

          return;
        }

        /*
         * IMPORTANT:
         * Location must be successfully saved before
         * driver is marked online.
         */
        try {
          await updateDriverLocation(
            latitude,
            longitude
          );
        } catch (locationError) {
          console.warn(
            '[DriverHome] Backend location update failed:',
            locationError
          );

          Alert.alert(
            'Location Update Failed',
            'Your location could not be saved. You cannot go online until your location is available.'
          );

          return;
        }

        setDriverLocation({
          latitude,
          longitude,
          timestamp: Date.now(),
        });

        mapRef.current?.flyTo(
          [longitude, latitude],
          16
        );
      }

      /*
       * Change backend driver status.
       */
      await toggleDriverStatus(
        newStatus
      );

      /*
       * Update local UI only after REST
       * request succeeds.
       */
      setIsOnline(newStatus);

      updateLocalDriver({
        isOnline: newStatus,
        isAvailable: newStatus,
      });

      /*
       * Emit socket event exactly ONCE here.
       *
       * Do not emit driver_online from the
       * [isOnline] effect.
       */
      if (newStatus) {
        socketService.emitDriverOnline();
      } else {
        socketService.emitDriverOffline();
      }
    } catch (error) {
      Alert.alert(
        'Status Update Failed',
        parseApiError(error)
      );
    } finally {
      setLoadingStatus(false);
    }
  }

  /*
   * Accept incoming ride.
   */
  async function handleAccept(
    ride: any
  ) {
    if (processingRequest) {
      return;
    }

    const rideId =
      ride?._id ||
      ride?.rideId ||
      ride?.ride?._id;

    if (!rideId) {
      Alert.alert(
        'Accept Failed',
        'Ride ID is missing.'
      );

      return;
    }

    setProcessingRequest(true);

    try {
      const acceptedRide =
        await acceptRide(
          String(rideId)
        );

      setCurrentRide(
        acceptedRide
      );

      clearPendingRequest?.();

      navigation.navigate(
        'ActiveRide',
        {
          rideId:
            String(rideId),
        }
      );
    } catch (error) {
      Alert.alert(
        'Accept Failed',
        parseApiError(error)
      );

      /*
       * Remove stale request from UI.
       */
      clearPendingRequest?.();
    } finally {
      setProcessingRequest(false);
    }
  }

  /*
   * Reject incoming ride.
   */
  async function handleReject(
    ride: any
  ) {
    if (processingRequest) {
      return;
    }

    const rideId =
      ride?._id ||
      ride?.rideId ||
      ride?.ride?._id;

    if (!rideId) {
      clearPendingRequest?.();
      return;
    }

    setProcessingRequest(true);

    try {
      await rejectRide(
        String(rideId)
      );

      clearPendingRequest?.();
    } catch (error) {
      Alert.alert(
        'Reject Failed',
        parseApiError(error)
      );

      clearPendingRequest?.();
    } finally {
      setProcessingRequest(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />

      <MapContainer
        ref={mapRef}
        initialRegion={
          driverLocation
            ? {
              latitude:
                driverLocation.latitude,
              longitude:
                driverLocation.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }
            : DEFAULT_REGION
        }
        driverLocation={
          driverLocation
            ? {
              latitude:
                driverLocation.latitude,
              longitude:
                driverLocation.longitude,
            }
            : undefined
        }
      />

      {/* Top overlay */}
      <View style={styles.topOverlay}>
        <View style={styles.topBar}>
          <View style={styles.statusBox}>
            <View
              style={[
                styles.statusDot,
                isOnline
                  ? styles.onlineDot
                  : styles.offlineDot,
              ]}
            />

            <Text
              style={styles.statusText}
            >
              {isOnline
                ? 'Online'
                : 'Offline'}
            </Text>
          </View>

          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() =>
                navigation.navigate(
                  'Earnings'
                )
              }
            >
              <Text
                style={
                  styles.iconBtnText
                }
              >
                💰
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() =>
                navigation.navigate(
                  'DriverTabs'
                )
              }
            >
              <Avatar
                name={
                  driver?.name ||
                  user?.name ||
                  'D'
                }
                imageUri={
                  driver?.profileImage ||
                  user?.profileImage
                }
                size={40}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bottom area */}
      <View style={styles.bottomArea}>
        {pendingRequest ? (
          <RideRequestCard
            ride={pendingRequest}
            onAccept={() =>
              handleAccept(
                pendingRequest
              )
            }
            onReject={() =>
              handleReject(
                pendingRequest
              )
            }
            loading={
              processingRequest
            }
          />
        ) : (
          <View
            style={
              styles.goOnlineCard
            }
          >
            <Text
              style={
                styles.goOnlineTitle
              }
            >
              {isOnline
                ? 'You are online'
                : 'You are offline'}
            </Text>

            <Text
              style={
                styles.goOnlineSub
              }
            >
              {isOnline
                ? 'Waiting for ride requests...'
                : 'Go online to start receiving ride requests.'}
            </Text>

            <TouchableOpacity
              style={[
                styles.toggleBtn,
                isOnline
                  ? styles.btnOffline
                  : styles.btnOnline,
              ]}
              onPress={
                handleToggleStatus
              }
              disabled={
                loadingStatus
              }
            >
              <Text
                style={
                  styles.toggleBtnText
                }
              >
                {loadingStatus
                  ? 'Updating...'
                  : isOnline
                    ? 'GO OFFLINE'
                    : 'GO ONLINE'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor:
      Colors.background,
  },

  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
    paddingTop:
      Platform.OS === 'android'
        ? 44
        : 60,
    paddingHorizontal:
      Spacing.lg,
    paddingBottom:
      Spacing.md,
    backgroundColor:
      Colors.mapOverlay,
  },

  topBar: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
  },

  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      Colors.surface,
    paddingHorizontal:
      Spacing.lg,
    paddingVertical:
      Spacing.sm,
    borderRadius:
      BorderRadius.full,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor:
      Colors.border,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  onlineDot: {
    backgroundColor:
      Colors.success,
  },

  offlineDot: {
    backgroundColor:
      Colors.textMuted,
  },

  statusText: {
    fontSize:
      FontSize.base,
    fontWeight:
      FontWeight.bold,
    color:
      Colors.textPrimary,
  },

  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },

  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor:
      Colors.surfaceElevated,
    borderWidth: 1,
    borderColor:
      Colors.border,
    alignItems: 'center',
    justifyContent:
      'center',
  },

  iconBtnText: {
    fontSize: 20,
  },

  bottomArea: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 10,
    elevation: 10,
  },

  goOnlineCard: {
    backgroundColor:
      Colors.surface,
    borderRadius:
      BorderRadius.xl,
    padding:
      Spacing.xl,
    alignItems:
      'center',
    borderWidth: 1,
    borderColor:
      Colors.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },

  goOnlineTitle: {
    fontSize:
      FontSize.xl,
    fontWeight:
      FontWeight.bold,
    color:
      Colors.textPrimary,
    marginBottom:
      Spacing.xs,
  },

  goOnlineSub: {
    fontSize:
      FontSize.sm,
    color:
      Colors.textSecondary,
    textAlign:
      'center',
    marginBottom:
      Spacing.xl,
  },

  toggleBtn: {
    width: '100%',
    paddingVertical:
      Spacing.lg,
    borderRadius:
      BorderRadius.full,
    alignItems:
      'center',
  },

  btnOnline: {
    backgroundColor:
      Colors.primary,
  },

  btnOffline: {
    backgroundColor:
      Colors.error,
  },

  toggleBtnText: {
    fontSize:
      FontSize.base,
    fontWeight:
      FontWeight.bold,
    color:
      Colors.white,
    letterSpacing: 1,
  },
});