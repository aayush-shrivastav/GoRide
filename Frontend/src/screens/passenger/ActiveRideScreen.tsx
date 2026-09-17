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
  Share,
  Animated,
  PanResponder,
  Modal,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useRide } from '../../context/RideContext';
import { getRide, triggerSos, cancelRide, cancelSos } from '../../services/api/rideApi';
import { getEmergencyContacts } from '../../services/api/authApi';
import { RIDE_STATUS, CANCELLABLE_STATUSES } from '../../constants/enums';
import DriverCard from '../../components/driver/DriverCard';
import ConfirmModal from '../../components/common/ConfirmModal';
import Button from '../../components/common/Button';
import SosSwipeModal from '../../components/common/SosSwipeModal';
import { parseApiError } from '../../utils/formatters';
import { buildEmergencyWhatsAppMessage, openWhatsAppEmergencyAlert } from '../../utils/emergency';
import { MapContainer, MapContainerRef } from '../../components/map/MapContainer';
import { fetchOSRMRouteThroughPoints, LatLng } from '../../services/maps/osrmService';
import { socketService } from '../../services/socket';
import { SosTriggeredPayload } from '../../types/ride.types';
import { useSosEmergency } from '../../hooks/useSosEmergency';

type Props = NativeStackScreenProps<PassengerStackParamList, 'ActiveRide'>;
const { height: SCREEN_H } = Dimensions.get('window');

const SHEET_SNAP_COLLAPSED = Math.max(240, SCREEN_H * 0.35);
const SHEET_SNAP_EXPANDED  = SCREEN_H * 0.75;

export default function ActiveRideScreen({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { user } = useAuth();
  const { currentRide, setCurrentRide, driverLocation, otp, clearRide } = useRide();
  const mapRef = useRef<MapContainerRef>(null);

  const currentRideRef = useRef(currentRide);
  useEffect(() => { currentRideRef.current = currentRide; }, [currentRide]);
  const driverLocationRef = useRef(driverLocation);
  useEffect(() => { driverLocationRef.current = driverLocation; }, [driverLocation]);

  const [showCancel, setShowCancel] = useState(false);
  const [showArrivedModal, setShowArrivedModal] = useState(false);
  const hasNotifiedArrived = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  const [openingPayment, setOpeningPayment] = useState(false);
  const { showSosModal, setShowSosModal, sosLoading, handleConfirmSos } = useSosEmergency({
    rideId,
    getLocation: () =>
      driverLocation ||
      (currentRide?.pickupLocation
        ? {
            latitude: currentRide.pickupLocation.coordinates[1],
            longitude: currentRide.pickupLocation.coordinates[0],
          }
        : null),
  });
  const [sosReceived, setSosReceived] = useState(false);
  const [cancellingSos, setCancellingSos] = useState(false);
  const handledSosIds = useRef<Set<string>>(new Set());
  const hasHandledTerminal = useRef(false);
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);

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

  // ── OSRM Route ─────────────────────────────────────────────
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

    fetchOSRMRouteThroughPoints(routePoints)
      .then(res => setRouteCoords(res.coordinates))
      .catch(() => {});
  }, [currentRide?.pickupLocation, currentRide?.dropLocation, currentRide?.rideStatus, driverLocation?.latitude, driverLocation?.longitude]);

  // ── Polling & Socket Fallback ──────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const updated = await getRide(rideId);
        setCurrentRide(updated);
      } catch (e) {}
    }, 4000);
    return () => clearInterval(interval);
  }, [rideId]);

  // ── Map Bounds & Ride Completion ───────────────────────────
  useEffect(() => {
    if (!currentRide) return;
    const coords: LatLng[] = [];
    if (driverLocation) coords.push(driverLocation);
    coords.push({ latitude: currentRide.pickupLocation.coordinates[1], longitude: currentRide.pickupLocation.coordinates[0] });
    
    // Only fit drop location if the ride has started, otherwise focus on pickup and driver
    if (currentRide.rideStatus === RIDE_STATUS.RIDE_STARTED) {
      (currentRide.stops || []).forEach(stop => {
        coords.push({ latitude: stop.location.coordinates[1], longitude: stop.location.coordinates[0] });
      });
      coords.push({ latitude: currentRide.dropLocation.coordinates[1], longitude: currentRide.dropLocation.coordinates[0] });
    }

    if (currentRide.rideStatus === RIDE_STATUS.DRIVER_ARRIVED && !hasNotifiedArrived.current) {
      hasNotifiedArrived.current = true;
      setShowArrivedModal(true);
      Animated.spring(sheetHeight, {
        toValue: SHEET_SNAP_EXPANDED,
        useNativeDriver: false,
      }).start();
      isExpanded.current = true;
    }

    if (coords.length > 0) {
      mapRef.current?.fitBounds(coords, 100);
    }

    if (hasHandledTerminal.current) return;

    if (currentRide.rideStatus === RIDE_STATUS.RIDE_COMPLETED) {
      hasHandledTerminal.current = true;
      navigation.replace('Payment', { rideId });
    } else if (currentRide.rideStatus === RIDE_STATUS.NO_DRIVER_FOUND) {
      hasHandledTerminal.current = true;
      clearRide();
      Alert.alert(
        'No Drivers Available',
        "We couldn't find a nearby driver. Please try again shortly.",
        [{ text: 'OK', onPress: () => navigation.replace('HomeTabs') }],
      );
    } else if (
      currentRide.rideStatus === RIDE_STATUS.CANCELLED_BY_DRIVER ||
      currentRide.rideStatus === RIDE_STATUS.CANCELLED_BY_PASSENGER
    ) {
      hasHandledTerminal.current = true;
      const msg = currentRide.rideStatus === RIDE_STATUS.CANCELLED_BY_DRIVER
        ? 'The driver has cancelled the ride.'
        : 'Ride cancelled successfully.';
      clearRide();
      Alert.alert('Ride Ended', msg, [{ text: 'OK', onPress: () => navigation.replace('HomeTabs') }]);
    }
  }, [currentRide?.rideStatus, driverLocation]);

  // ── Ensure details are loaded on mount ─────────────────────
  useEffect(() => {
    if (!currentRide) {
      getRide(rideId)
        .then(ride => setCurrentRide(ride))
        .catch(err => {
          Alert.alert('Error', 'Failed to load ride details.');
          navigation.replace('HomeTabs');
        });
    }
  }, [rideId]);

  // ── Emergency WhatsApp Action ─────────────────────────────
  async function handleSendWhatsAppAlert() {
    const rideObj = currentRideRef.current || currentRide;
    const driverObj = typeof rideObj?.driver === 'object' ? rideObj.driver : null;
    const loc =
      driverLocationRef.current ||
      driverLocation ||
      (rideObj?.pickupLocation
        ? {
            latitude: rideObj.pickupLocation.coordinates[1],
            longitude: rideObj.pickupLocation.coordinates[0],
          }
        : null);

    let targetPhone = '';
    if (user?.emergencyContacts && user.emergencyContacts.length > 0) {
      targetPhone = user.emergencyContacts[0].phone;
    } else {
      try {
        const contactData = await getEmergencyContacts();
        if (contactData?.contacts && contactData.contacts.length > 0) {
          targetPhone = contactData.contacts[0].phone;
        }
      } catch {}
    }

    const message = buildEmergencyWhatsAppMessage({
      passengerName: user?.name,
      passengerPhone: user?.phone,
      driverName: driverObj?.name,
      driverPhone: driverObj?.phone,
      vehicleNumber: driverObj?.vehicleNumber,
      vehicleModel: driverObj?.vehicleModel || rideObj?.vehicleType,
      pickupAddress: rideObj?.pickupAddress,
      dropAddress: rideObj?.dropAddress,
      latitude: loc?.latitude,
      longitude: loc?.longitude,
    });

    await openWhatsAppEmergencyAlert({ phone: targetPhone, message });
  }

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
        'Emergency SOS active! Live GPS location & cab telemetry dispatched. Would you like to open WhatsApp to alert your family directly?',
        [
          {
            text: '📲 WhatsApp Family',
            onPress: handleSendWhatsAppAlert,
            style: 'default',
          },
          {
            text: '📞 Call Police (112)',
            onPress: () => Linking.openURL('tel:112'),
            style: 'destructive',
          },
          { text: 'I Understand', style: 'cancel' },
        ],
        { cancelable: false }
      );
    };

    const handleSosResolved = (payload: { rideId?: string }) => {
      if (!payload?.rideId || payload.rideId !== rideId) return;
      setSosReceived(false);
      Alert.alert('SOS Resolved', 'Emergency alert has been resolved and marked safe.');
    };

    socketService.on('sos_triggered', handleSosTriggered);
    socketService.on('sos_resolved', handleSosResolved);
    return () => {
      socketService.off('sos_triggered', handleSosTriggered);
      socketService.off('sos_resolved', handleSosResolved);
    };
  }, [rideId]);

  async function handleCancelSos() {
    Alert.alert(
      'Resolve Emergency SOS?',
      'Are you safe and would like to deactivate the SOS alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, I am Safe',
          style: 'default',
          onPress: async () => {
            try {
              setCancellingSos(true);
              await cancelSos(rideId);
              setSosReceived(false);
              Alert.alert('SOS Deactivated', 'Your ride is no longer in emergency mode.');
            } catch (err) {
              Alert.alert('Error', parseApiError(err));
            } finally {
              setCancellingSos(false);
            }
          },
        },
      ]
    );
  }

  // ── Payment Updated Socket Listener ───────────────────────
  useEffect(() => {
    const handlePaymentUpdated = (payload: { rideId?: string; status?: string }) => {
      if (payload?.rideId === rideId && payload.status === 'SUCCESS') {
        if (currentRide) {
          setCurrentRide({ ...currentRide, paymentStatus: 'SUCCESS' });
        }
        Alert.alert('Payment Successful 💰', 'Your online payment has been confirmed!');
      }
    };
    socketService.on('payment_updated', handlePaymentUpdated);
    return () => {
      socketService.off('payment_updated', handlePaymentUpdated);
    };
  }, [rideId, currentRide]);

  // ── Actions ────────────────────────────────────────────────
  async function handleCancelConfirm() {
    setCancelling(true);
    try {
      await cancelRide(rideId, 'Passenger cancelled');
      clearRide();
      setShowCancel(false);
      navigation.replace('HomeTabs');
    } catch (err) {
      Alert.alert('Cancel Failed', parseApiError(err));
    } finally {
      setCancelling(false);
    }
  }

  function handleCall() {
    if (currentRide?.driver && typeof currentRide.driver === 'object') {
      Linking.openURL(`tel:${currentRide.driver.phone}`);
    }
  }

  async function handleShare() {
    if (!currentRide) return;
    const driverObj = typeof currentRide.driver === 'object' ? currentRide.driver : null;
    const message = [
      `🚗 I'm on a GoRide!`,
      `From: ${currentRide.pickupAddress}`,
      `To: ${currentRide.dropAddress}`,
      driverObj ? `Driver: ${driverObj.name} (${driverObj.vehicleNumber || ''})` : '',
      `Track my ride: GoRide App`,
    ].filter(Boolean).join('\n');
    try {
      await Share.share({ message, title: 'My GoRide Trip' });
    } catch (e) {}
  }

  async function handleOpenPayment() {
    if (openingPayment) return;
    setOpeningPayment(true);
    navigation.navigate('Payment', { rideId });
    // Reset openingPayment state after navigation to allow retry if user returns
    setTimeout(() => setOpeningPayment(false), 2000);
  }

  if (!currentRide) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.loadingText}>Loading ride details...</Text>
      </View>
    );
  }

  const isCancellable = (CANCELLABLE_STATUSES as string[]).includes(currentRide.rideStatus);
  const showOtp = [RIDE_STATUS.DRIVER_ASSIGNED, RIDE_STATUS.DRIVER_ARRIVING, RIDE_STATUS.DRIVER_ARRIVED].includes(currentRide.rideStatus as any);
  const displayOtp = otp;

  const pickupCoord = { latitude: currentRide.pickupLocation.coordinates[1], longitude: currentRide.pickupLocation.coordinates[0] };
  const dropCoord   = { latitude: currentRide.dropLocation.coordinates[1], longitude: currentRide.dropLocation.coordinates[0] };
  const stopCoords = (currentRide.stops || [])
    .sort((a, b) => a.order - b.order)
    .map(stop => ({ latitude: stop.location.coordinates[1], longitude: stop.location.coordinates[0] }));

  const driverObj = typeof currentRide.driver === 'object' ? currentRide.driver : null;
  const activeDriverCoord = driverLocation || (
    driverObj?.currentLocation?.coordinates
      ? {
          latitude: driverObj.currentLocation.coordinates[1],
          longitude: driverObj.currentLocation.coordinates[0],
        }
      : undefined
  );

  // Status phrasing
  let statusStr = '';
  if (currentRide.rideStatus === RIDE_STATUS.DRIVER_ASSIGNED || currentRide.rideStatus === RIDE_STATUS.DRIVER_ARRIVING) {
    statusStr = 'Driver is arriving';
  } else if (currentRide.rideStatus === RIDE_STATUS.DRIVER_ARRIVED) {
    statusStr = 'Driver has arrived!';
  } else if (currentRide.rideStatus === RIDE_STATUS.RIDE_STARTED) {
    statusStr = 'Heading to destination';
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── MAP ─────────────────────────────────────────────── */}
      <View style={styles.mapFull}>
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
          driverLocation={activeDriverCoord}
        />
      </View>

      {/* ── HEADER (SOS & Status) ────────────────────────────── */}
      <View style={styles.topBar}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>🚗  {statusStr}</Text>
        </View>
        <TouchableOpacity
          style={styles.sosBtn}
          onPress={() => setShowSosModal(true)}
          onLongPress={() => setShowSosModal(true)}
          disabled={sosLoading}>
          <Text style={styles.sosText}>SOS</Text>
        </TouchableOpacity>
      </View>

      {sosReceived && (
        <View style={styles.emergencyBanner}>
          <View style={styles.emergencyHeaderRow}>
            <View style={styles.emergencyPulsingDot} />
            <Text style={styles.emergencyBannerTitle}>🚨 EMERGENCY SOS ACTIVE</Text>
          </View>
          <Text style={styles.emergencyBannerSub}>
            Live GPS telemetry dispatched to parents & emergency control room.
          </Text>
          <View style={styles.emergencyActionRow}>
            <TouchableOpacity
              style={styles.emergencyWhatsAppBtn}
              onPress={handleSendWhatsAppAlert}
              activeOpacity={0.85}
            >
              <Text style={styles.emergencyWhatsAppBtnText}>📲 WhatsApp Family</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.emergencyCallBtn}
              onPress={() => Linking.openURL('tel:112')}
              activeOpacity={0.8}
            >
              <Text style={styles.emergencyCallBtnText}>📞 112</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.emergencyResolveBtn}
              onPress={handleCancelSos}
              disabled={cancellingSos}
              activeOpacity={0.8}
            >
              <Text style={styles.emergencyResolveBtnText}>
                {cancellingSos ? '...' : '✓ Safe'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── DRAGGABLE BOTTOM SHEET ──────────────────────────── */}
      <Animated.View style={[styles.sheet, { height: sheetHeight }]}>
        <View {...panResponder.panHandlers} style={styles.dragArea}>
          <View style={styles.dragHandle} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* OTP Section */}
          {showOtp && displayOtp && (
            <View style={styles.otpCard}>
              <Text style={styles.otpLabel}>YOUR RIDE PIN</Text>
              <View style={styles.digitContainer}>
                {String(displayOtp).padStart(4, '0').split('').slice(0, 4).map((digit, idx) => (
                  <View key={idx} style={styles.digitBox}>
                    <Text style={styles.digitText}>{digit}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.otpSub}>Share this with your driver to start</Text>
            </View>
          )}

          {/* Driver Card */}
          {currentRide.driver && typeof currentRide.driver === 'object' && (
            <DriverCard driver={currentRide.driver} />
          )}

          {/* Payment Status / Pay Online Option during Ride */}
          {currentRide.paymentStatus === 'SUCCESS' ? (
            <View style={styles.paidOnlineCard}>
              <Text style={styles.paidOnlineText}>
                ✅ Paid Online: ₹{Math.round(currentRide.finalFare || currentRide.estimatedFare || 0)}
              </Text>
              <Text style={styles.paidOnlineSubText}>Payment verified. No cash required.</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.payOnlineBtn, openingPayment && styles.payOnlineBtnDisabled]}
              onPress={handleOpenPayment}
              disabled={openingPayment}>
              <View style={styles.payOnlineInner}>
                <View>
                  <Text style={styles.payOnlineTitle}>
                    {openingPayment ? 'Opening secure payment…' : '📱 Pay Online (UPI / Card)'}
                  </Text>
                  <Text style={styles.payOnlineSub}>
                    {openingPayment ? 'Checking your session' : 'Pay anytime before or during your ride'}
                  </Text>
                </View>
                <Text style={styles.payOnlineFare}>
                  ₹{Math.round(currentRide.finalFare || currentRide.estimatedFare || 0)} ›
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {(currentRide.stops?.length || 0) > 0 && (
            <View style={styles.stopsBox}>
              <Text style={styles.stopsTitle}>
                {currentRide.stops?.length} stop{currentRide.stops?.length === 1 ? '' : 's'} before destination
              </Text>
              {currentRide.stops?.sort((a, b) => a.order - b.order).map((stop, index) => (
                <Text key={`${stop.location.coordinates.join('-')}-${index}`} style={styles.stopItem} numberOfLines={1}>
                  {index + 1}. {stop.address}
                </Text>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.iconBtn} onPress={handleCall}>
              <Text style={styles.iconText}>📞 Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
              <Text style={styles.iconText}>🔗 Share</Text>
            </TouchableOpacity>
            {isCancellable && (
              <TouchableOpacity style={styles.iconBtnCancel} onPress={() => setShowCancel(true)}>
                <Text style={styles.iconTextCancel}>✗ Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      {/* ── DRIVER ARRIVED MODAL POPUP ─────────────────────── */}
      <Modal
        visible={showArrivedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowArrivedModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.arrivedModalContainer}>
            <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: Spacing.sm }}>🚖</Text>
            <Text style={styles.arrivedTitle}>Driver Has Arrived!</Text>
            <Text style={styles.arrivedMessage}>
              Aapka driver pickup location par pahunch chuka hai aur wait kar raha hai. Kripya cab ke paas jayein aur ride start karane ke liye ye PIN share karein:
            </Text>

            {displayOtp && (
              <View style={styles.arrivedOtpBox}>
                <Text style={styles.arrivedOtpLabel}>YOUR RIDE PIN</Text>
                <Text style={styles.arrivedOtpCode}>{String(displayOtp).padStart(4, '0')}</Text>
              </View>
            )}

            <Button
              title="I'm heading to the cab 👍"
              onPress={() => setShowArrivedModal(false)}
              fullWidth
              style={{ marginTop: Spacing.md }}
            />
          </View>
        </View>
      </Modal>

      {/* ── CANCEL CONFIRMATION ────────────────────────────── */}
      <ConfirmModal
        visible={showCancel}
        title="Cancel Ride?"
        message="A cancellation fee may apply depending on the driver's progress."
        confirmText="Cancel Ride"
        cancelText="Back"
        onConfirm={handleCancelConfirm}
        onCancel={() => setShowCancel(false)}
        isDanger
        loading={cancelling}
      />

      {/* ── SOS SWIPE-UP EMERGENCY MODAL ───────────────────── */}
      <SosSwipeModal
        visible={showSosModal}
        onClose={() => setShowSosModal(false)}
        onConfirm={handleConfirmSos}
        onWhatsAppAlert={handleSendWhatsAppAlert}
        loading={sosLoading}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.base },
  mapFull: { ...StyleSheet.absoluteFill, zIndex: 0 },

  topBar: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 44 : 58,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  statusBadge: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 6,
  },
  statusBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  sosBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
  },
  sosText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
    letterSpacing: 1,
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
    alignItems: 'center',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  sheetContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
    flex: 1,
  },

  // OTP Card
  otpCard: {
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    gap: Spacing.sm,
  },
  otpLabel: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  digitContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'center',
  },
  digitBox: {
    width: 44,
    height: 50,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    color: Colors.primary,
  },
  otpSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  stopsBox: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
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
  iconBtn: {
    flex: 1,
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconText: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  iconBtnCancel: {
    flex: 1,
    backgroundColor: Colors.errorFaint,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  iconTextCancel: {
    color: Colors.error,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },

  // Arrived Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  arrivedModalContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 25,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
  },
  arrivedTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  arrivedMessage: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  arrivedOtpBox: {
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
    marginBottom: Spacing.md,
    width: '100%',
  },
  arrivedOtpLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  arrivedOtpCode: {
    fontSize: 36,
    fontWeight: FontWeight.black,
    color: Colors.primary,
    letterSpacing: 8,
  },
  paidOnlineCard: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#10b981',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  paidOnlineText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#047857',
  },
  paidOnlineSubText: {
    fontSize: FontSize.xs,
    color: '#059669',
  },
  payOnlineBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  payOnlineBtnDisabled: {
    opacity: 0.65,
  },
  payOnlineInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payOnlineTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  payOnlineSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  payOnlineFare: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  emergencyBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 104 : 76,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: '#7f1d1d',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    zIndex: 99,
    borderWidth: 1.5,
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  emergencyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  emergencyPulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  emergencyBannerTitle: {
    color: '#ffffff',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
    letterSpacing: 0.8,
  },
  emergencyBannerSub: {
    color: '#fecaca',
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginBottom: Spacing.sm,
  },
  emergencyActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  emergencyWhatsAppBtn: {
    flex: 1.4,
    backgroundColor: '#25D366',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  emergencyWhatsAppBtnText: {
    color: '#ffffff',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
  },
  emergencyCallBtn: {
    flex: 0.9,
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f87171',
  },
  emergencyCallBtnText: {
    color: '#ffffff',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
  },
  emergencyResolveBtn: {
    flex: 0.7,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  emergencyResolveBtnText: {
    color: '#ffffff',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
  },
});
