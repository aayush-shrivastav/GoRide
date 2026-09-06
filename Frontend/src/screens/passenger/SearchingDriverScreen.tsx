import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Alert,
  StatusBar,
  BackHandler,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { useRide } from '../../context/RideContext';
import { cancelRide, getRide } from '../../services/api/rideApi';
import { RIDE_STATUS } from '../../constants/enums';
import Button from '../../components/common/Button';
import ConfirmModal from '../../components/common/ConfirmModal';
import { parseApiError, truncateAddress } from '../../utils/formatters';

type Props = NativeStackScreenProps<PassengerStackParamList, 'SearchingDriver'>;

type SearchPhase =
  | 'searching_female'   // Searching female drivers (when preference is on)
  | 'searching_all'      // Searching all drivers
  | 'expanding_radius'   // Expanding search radius
  | 'no_female_found'    // Female drivers exhausted, ask user
  | 'no_driver_found';   // Completely no driver found

export default function SearchingDriverScreen({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { currentRide, setCurrentRide, clearRide } = useRide();
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [phase, setPhase] = useState<SearchPhase>('searching_all');
  const [elapsedSec, setElapsedSec] = useState(0);

  const pulseAnim  = useRef(new Animated.Value(0)).current;
  const spinAnim   = useRef(new Animated.Value(0)).current;
  const pulse2Anim = useRef(new Animated.Value(0)).current;
  const timerRef   = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ── Determine female preference from ride ──────────────────
  const hasFemalePref = Boolean((currentRide as any)?.preferFemaleDriver);

  // ── Start animations ───────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse2Anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse2Anim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 2400, useNativeDriver: true }),
    ).start();
  }, []);

  // ── Elapsed timer — drives search phase logic ───────────────
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (hasFemalePref) {
      if (elapsedSec < 30) {
        setPhase('searching_female');
      } else if (elapsedSec < 60) {
        setPhase('searching_all');
      } else {
        setPhase('expanding_radius');
      }
    } else {
      if (elapsedSec < 45) {
        setPhase('searching_all');
      } else {
        setPhase('expanding_radius');
      }
    }
  }, [elapsedSec, hasFemalePref]);

  // ── Prevent hardware back ───────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // ── Poll ride status ────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const ride = await getRide(rideId);
        setCurrentRide(ride);
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [rideId]);

  // ── Monitor ride status changes (socket + poll) ─────────────
  useEffect(() => {
    if (!currentRide) return;
    const assigned = [
      RIDE_STATUS.DRIVER_ASSIGNED,
      RIDE_STATUS.DRIVER_ARRIVING,
      RIDE_STATUS.DRIVER_ARRIVED,
      RIDE_STATUS.RIDE_STARTED,
    ];
    if (assigned.includes(currentRide.rideStatus as RIDE_STATUS)) {
      navigation.replace('ActiveRide', { rideId: currentRide._id });
    } else if (currentRide.rideStatus === RIDE_STATUS.NO_DRIVER_FOUND) {
      setPhase('no_driver_found');
    } else if (
      currentRide.rideStatus === RIDE_STATUS.CANCELLED_BY_DRIVER ||
      currentRide.rideStatus === RIDE_STATUS.CANCELLED_BY_PASSENGER
    ) {
      clearRide();
      Alert.alert('Ride Ended', 'Your ride was cancelled.', [
        { text: 'OK', onPress: () => navigation.replace('HomeTabs') },
      ]);
    }
  }, [currentRide?.rideStatus]);

  // ── Cancel logic ───────────────────────────────────────────
  async function handleCancelConfirm() {
    setCancelling(true);
    try {
      if (currentRide?.rideStatus === RIDE_STATUS.NO_DRIVER_FOUND) {
        clearRide();
        navigation.replace('HomeTabs');
        return;
      }
      await cancelRide(rideId, 'Passenger cancelled');
      clearRide();
      navigation.replace('HomeTabs');
    } catch (err) {
      const errMsg = parseApiError(err);
      if (errMsg.includes('not found') || errMsg.includes('NO_DRIVER_FOUND')) {
        clearRide();
        navigation.replace('HomeTabs');
        return;
      }
      Alert.alert('Error', errMsg);
    } finally {
      setCancelling(false);
      setShowCancel(false);
    }
  }

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pulseScale1 = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const pulseOpacity1 = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  const pulseScale2 = pulse2Anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const pulseOpacity2 = pulse2Anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0] });

  // ── NO DRIVER FOUND STATE ──────────────────────────────────
  if (phase === 'no_driver_found') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🚫</Text>
          <Text style={styles.emptyTitle}>No Drivers Available</Text>
          <Text style={styles.emptySub}>
            Sorry, there are no available drivers near your pickup location right now. Please try again in a few minutes.
          </Text>
          <Button
            title="↻ Search Again"
            onPress={() => {
              clearRide();
              navigation.replace('HomeTabs');
            }}
            fullWidth
            size="lg"
          />
          <TouchableOpacity onPress={() => { clearRide(); navigation.replace('HomeTabs'); }} style={styles.changePickupBtn}>
            <Text style={styles.changePickupText}>Change Pickup Location</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Phase Meta ─────────────────────────────────────────────
  const phaseMeta: Record<SearchPhase, { title: string; sub: string; icon: string; color: string }> = {
    searching_female: {
      icon: '👩‍✈️',
      title: 'Finding Female Driver',
      sub: 'Prioritizing verified female drivers near you first.',
      color: '#EC4899',
    },
    searching_all: {
      icon: '🚗',
      title: 'Finding Your Driver',
      sub: "We're matching you with the best available driver nearby.",
      color: Colors.primary,
    },
    expanding_radius: {
      icon: '📡',
      title: 'Expanding Search Area',
      sub: "Looking for drivers in a wider area. Hang tight!",
      color: Colors.warning,
    },
    no_female_found: {
      icon: '👩‍✈️',
      title: 'No Female Driver Found',
      sub: 'No female drivers are available near your pickup right now.',
      color: '#EC4899',
    },
    no_driver_found: {
      icon: '🚫',
      title: 'No Drivers Available',
      sub: 'No drivers are currently available near your pickup.',
      color: Colors.error,
    },
  };

  const meta = phaseMeta[phase] || phaseMeta.searching_all;
  const isFemalePhase = phase === 'searching_female';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.content}>
        {/* ── Animated search visual ─────────────────── */}
        <View style={styles.animWrap}>
          {/* Outer pulse 2 */}
          <Animated.View
            style={[
              styles.pulseRing,
              styles.pulseOuter,
              {
                borderColor: meta.color,
                transform: [{ scale: pulseScale2 }],
                opacity: pulseOpacity2,
              },
            ]}
          />
          {/* Inner pulse 1 */}
          <Animated.View
            style={[
              styles.pulseRing,
              styles.pulseInner,
              {
                borderColor: meta.color,
                backgroundColor: meta.color + '15',
                transform: [{ scale: pulseScale1 }],
                opacity: pulseOpacity1,
              },
            ]}
          />
          {/* Spin ring */}
          <Animated.View
            style={[
              styles.spinRing,
              { borderTopColor: meta.color, transform: [{ rotate: spin }] },
            ]}
          />
          {/* Center icon */}
          <View style={[styles.centerCircle, { borderColor: meta.color + '40' }]}>
            <Text style={styles.centerIcon}>{meta.icon}</Text>
          </View>
        </View>

        {/* ── Status Text ────────────────────────────── */}
        <Text style={styles.title}>{meta.title}</Text>

        {/* Female preference badge */}
        {isFemalePhase && (
          <View style={styles.femaleBadge}>
            <Text style={styles.femaleBadgeText}>👩‍✈️ Female Driver Priority Active</Text>
          </View>
        )}

        <Text style={styles.subtitle}>{meta.sub}</Text>

        {/* Timer & status dots */}
        <View style={styles.searchDotsRow}>
          <View style={[styles.dot, { backgroundColor: meta.color }]} />
          <View style={[styles.dot, styles.dotMid, { backgroundColor: meta.color + '80' }]} />
          <View style={[styles.dot, { backgroundColor: meta.color + '40' }]} />
        </View>
        <Text style={styles.elapsedText}>Searching for {elapsedSec}s…</Text>

        {/* Ride Details Card */}
        {currentRide && (
          <View style={styles.rideCard}>
            <RideRow icon="📍" label="Pickup"  value={truncateAddress(currentRide.pickupAddress, 38)} />
            <View style={styles.rowDivider} />
            <RideRow icon="🏁" label="Drop"    value={truncateAddress(currentRide.dropAddress, 38)} />
            <View style={styles.rowDivider} />
            <View style={styles.rideMetaRow}>
              <RideRow icon="🚗" label={currentRide.vehicleType.toUpperCase()} value={`₹${Math.round(currentRide.estimatedFare || 0)}`} />
              <RideRow icon="💵" label="" value={currentRide.paymentMethod === 'cash' ? 'Cash' : 'Online'} />
            </View>
          </View>
        )}
      </View>

      {/* ── Footer ─────────────────────────────────────── */}
      <View style={styles.footer}>
        <Button
          title="Cancel Ride"
          variant="outline"
          onPress={() => setShowCancel(true)}
          fullWidth
          size="lg"
        />
      </View>

      <ConfirmModal
        visible={showCancel}
        title="Cancel Ride?"
        message="Are you sure? A cancellation fee may apply if a driver was already found."
        confirmText="Yes, Cancel"
        cancelText="Keep Searching"
        onConfirm={handleCancelConfirm}
        onCancel={() => setShowCancel(false)}
        isDanger
        loading={cancelling}
      />
    </View>
  );
}

function RideRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={rrStyles.row}>
      <Text style={rrStyles.icon}>{icon}</Text>
      {label ? <Text style={rrStyles.label}>{label}</Text> : null}
      <Text style={rrStyles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}
const rrStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  icon: { fontSize: 14 },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, minWidth: 44 },
  value: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium, textAlign: 'right' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
    paddingTop: Platform.OS === 'android' ? 16 : 0,
  },

  // Animation
  animWrap: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
  },
  pulseOuter: { width: 170, height: 170 },
  pulseInner: { width: 130, height: 130 },
  spinRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderTopColor: Colors.primary,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  centerCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  centerIcon: { fontSize: 38 },

  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  femaleBadge: {
    backgroundColor: 'rgba(236,72,153,0.12)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderWidth: 1,
    borderColor: '#EC4899',
  },
  femaleBadgeText: {
    fontSize: FontSize.xs,
    color: '#EC4899',
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },

  // Status dots
  searchDotsRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotMid: { width: 10, height: 10, borderRadius: 5 },
  elapsedText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Ride card
  rideCard: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  rowDivider: { height: 1, backgroundColor: Colors.divider },
  rideMetaRow: { flexDirection: 'row', gap: Spacing.md },

  // Footer
  footer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  emptyEmoji: { fontSize: 72 },
  emptyTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  changePickupBtn: { alignItems: 'center', padding: Spacing.sm },
  changePickupText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    textDecorationLine: 'underline',
  },
});
