import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { Ride } from '../../types/ride.types';
import { getRide, cancelRide, updateRideStatus } from '../../services/api/rideApi';
import { formatDate, formatCurrency, parseApiError } from '../../utils/formatters';
import { MapContainer } from '../../components/map/MapContainer';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useRide } from '../../context/RideContext';
import { RIDE_STATUS } from '../../constants/enums';

type Props = NativeStackScreenProps<any, 'RideDetail'>;

const ACTIVE_STATUSES = [
  RIDE_STATUS.REQUESTED,
  RIDE_STATUS.SEARCHING_DRIVER,
  RIDE_STATUS.DRIVER_ASSIGNED,
  RIDE_STATUS.DRIVER_ARRIVING,
  RIDE_STATUS.DRIVER_ARRIVED,
  RIDE_STATUS.RIDE_STARTED,
];

export default function RideDetailScreen({ route, navigation }: Props) {
  const { rideId, ride: initialRide } = route.params as { rideId?: string; ride?: Ride };
  const [ride, setRide] = useState<Ride | null>(initialRide || null);
  const [loading, setLoading] = useState(!initialRide);
  const [actionLoading, setActionLoading] = useState(false);
  const { role } = useAuth();
  const { clearRide, setCurrentRide } = useRide();

  const isDriver = role === 'driver';

  useEffect(() => {
    const targetRideId = rideId || initialRide?._id;
    if (targetRideId) {
      fetchRideDetails(targetRideId);
    }
  }, [rideId, initialRide?._id]);

  async function fetchRideDetails(idToFetch?: string) {
    const targetId = idToFetch || rideId || initialRide?._id;
    if (!targetId) return;
    try {
      if (!ride) setLoading(true);
      const fetchedRide = await getRide(targetId);
      setRide(fetchedRide);
    } catch (error) {
      if (!ride) {
        Alert.alert('Error', 'Could not load ride details');
        navigation.goBack();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoToLiveRide() {
    if (!ride) return;
    setCurrentRide(ride);
    navigation.navigate('ActiveRide', { rideId: ride._id });
  }

  async function handleCancelRide() {
    if (!ride) return;

    const executeCancel = async () => {
      setActionLoading(true);
      try {
        await cancelRide(ride._id, isDriver ? 'Driver cancelled' : 'Passenger cancelled');
        clearRide();
        if (Platform.OS === 'web') {
          window.alert('Ride cancelled successfully.');
        } else {
          Alert.alert('Ride Cancelled', 'The ride has been cancelled.');
        }
        navigation.goBack();
      } catch (err) {
        Alert.alert('Cancel Failed', parseApiError(err));
      } finally {
        setActionLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' && window.confirm
        ? window.confirm('Cancel Ride: Are you sure you want to cancel this ride?')
        : true;
      if (ok) {
        await executeCancel();
      }
      return;
    }

    Alert.alert('Cancel Ride', 'Are you sure you want to cancel this ride?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: executeCancel },
    ]);
  }

  async function handleCompleteRide() {
    if (!ride) return;

    const executeComplete = async () => {
      setActionLoading(true);
      try {
        const updated = await updateRideStatus(ride._id, RIDE_STATUS.RIDE_COMPLETED);
        clearRide();
        setRide(updated);
        if (Platform.OS === 'web') {
          window.alert('Ride completed successfully!');
        } else {
          Alert.alert('Ride Completed', 'Trip marked as completed.');
        }
        navigation.navigate(isDriver ? 'DriverTabs' : 'HomeTabs');
      } catch (err) {
        Alert.alert('Update Failed', parseApiError(err));
      } finally {
        setActionLoading(false);
      }
    };

    if (ride.paymentMethod === 'cash') {
      const fare = Math.round(ride.finalFare || ride.estimatedFare || 0);
      if (Platform.OS === 'web') {
        const ok = typeof window !== 'undefined' && window.confirm
          ? window.confirm(`Collect Cash: Please collect ₹${fare} from the passenger before ending the ride.\n\nClick OK to confirm cash received and end ride.`)
          : true;
        if (ok) {
          await executeComplete();
        }
        return;
      }

      Alert.alert(
        'Collect Cash',
        `Please collect ₹${fare} from the passenger before ending the ride.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Cash Collected & End Ride', onPress: executeComplete },
        ]
      );
      return;
    }

    await executeComplete();
  }

  if (loading || !ride) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const otherPerson = isDriver ? ride.passenger : ride.driver;
  const otherPersonData = typeof otherPerson === 'object' && otherPerson !== null ? (otherPerson as any) : null;
  const isActive = ACTIVE_STATUSES.includes(ride.rideStatus as any);
  const isCompleted = ride.rideStatus === RIDE_STATUS.RIDE_COMPLETED || ride.rideStatus === 'COMPLETED';
  const isCancelled = typeof ride.rideStatus === 'string' && ride.rideStatus.includes('CANCELLED');

  const distanceKm = Number(ride.distanceKm ?? (ride.distance ? ride.distance / 1000 : 0)).toFixed(1);
  const durationMin = Math.round(Number(ride.estimatedDurationMin ?? (ride.duration ? ride.duration / 60 : 0)));
  const fareAmount = ride.finalFare ? formatCurrency(ride.finalFare) : formatCurrency(ride.estimatedFare);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── HEADER ────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ride Details</Text>
        <View style={styles.rideIdChip}>
          <Text style={styles.rideIdChipText}>#{String(ride._id).slice(-4).toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── MAP HERO VIEW ────────────────────────────────────── */}
        <View style={styles.mapSnapshot}>
          <MapContainer
            initialRegion={{
              latitude: ride.pickupLocation.coordinates[1],
              longitude: ride.pickupLocation.coordinates[0],
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            pickupLocation={{
              latitude: ride.pickupLocation.coordinates[1],
              longitude: ride.pickupLocation.coordinates[0],
            }}
            dropLocation={{
              latitude: ride.dropLocation.coordinates[1],
              longitude: ride.dropLocation.coordinates[0],
            }}
          />
        </View>

        {/* ── ROUTE & TIMELINE CARD ────────────────────────────── */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewHeaderRow}>
            <Text style={styles.dateText}>{formatDate(ride.createdAt)}</Text>
            <View
              style={[
                styles.statusBadge,
                isActive
                  ? styles.statusActiveBadge
                  : isCompleted
                  ? styles.statusCompletedBadge
                  : styles.statusCancelledBadge,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  isActive
                    ? styles.statusActiveText
                    : isCompleted
                    ? styles.statusCompletedText
                    : styles.statusCancelledText,
                ]}
              >
                {isCompleted ? '✓ RIDE COMPLETED' : isCancelled ? '✕ CANCELLED' : ride.rideStatus.replace(/_/g, ' ')}
              </Text>
            </View>
          </View>

          {/* Clean Modern Route Timeline */}
          <View style={styles.timelineRow}>
            <View style={styles.indicatorCol}>
              <View style={styles.pickupRing} />
              <View style={styles.trackLine} />
              <View style={styles.dropPin} />
            </View>

            <View style={styles.addressCol}>
              <View style={styles.addressBlock}>
                <Text style={styles.addressTag}>Pickup Location</Text>
                <Text style={styles.addressTitle} numberOfLines={2}>
                  {ride.pickupAddress}
                </Text>
              </View>

              <View style={styles.addressBlock}>
                <Text style={styles.addressTag}>Dropoff Location</Text>
                <Text style={styles.addressTitle} numberOfLines={2}>
                  {ride.dropAddress}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── ACTIVE CONTROLS (If ride is active) ──────────────── */}
        {isActive && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACTIVE RIDE ACTIONS</Text>
            <View style={styles.actionCard}>
              <Button
                title="🚕 Open Live Ride Screen"
                onPress={handleGoToLiveRide}
                variant="primary"
                fullWidth
                style={{ marginBottom: Spacing.sm }}
              />

              {isDriver && ride.rideStatus === RIDE_STATUS.RIDE_STARTED && (
                <Button
                  title="🏁 End Ride / Collect Fare"
                  onPress={handleCompleteRide}
                  loading={actionLoading}
                  fullWidth
                  style={styles.endRideBtn}
                />
              )}

              <Button
                title="✗ Cancel Ride"
                onPress={handleCancelRide}
                loading={actionLoading}
                variant="outline"
                fullWidth
                style={styles.cancelBtn}
                textStyle={{ color: Colors.error }}
              />
            </View>
          </View>
        )}

        {/* ── TRIP & FARE SUMMARY ──────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TRIP & FARE SUMMARY</Text>
          <View style={styles.fareCard}>
            <View style={styles.fareMainRow}>
              <View style={styles.fareLeftCol}>
                <Text style={styles.fareLabelMain}>Total Trip Fare</Text>
                <View style={styles.metaChipsRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>📍 {distanceKm} km</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>⏱️ {durationMin} min</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.fareAmountText}>{fareAmount}</Text>
            </View>

            <View style={styles.fareDivider} />

            <View style={styles.paymentMethodRow}>
              <Text style={styles.paymentMethodLabel}>Payment Mode</Text>
              <View style={styles.paymentMethodBadge}>
                <Text style={{ fontSize: 14 }}>
                  {ride.paymentMethod === 'online' ? '💳' : '💵'}
                </Text>
                <Text style={styles.paymentMethodBadgeText}>
                  {ride.paymentMethod === 'online' ? 'Online (Card / UPI)' : 'Cash to Driver'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── PASSENGER / DRIVER DETAILS ──────────────────────── */}
        {otherPersonData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isDriver ? 'PASSENGER' : 'DRIVER'}</Text>
            <View style={styles.personCard}>
              <Avatar
                name={otherPersonData.name || (isDriver ? 'Passenger' : 'Driver')}
                imageUri={otherPersonData.profileImage}
                size={52}
              />
              <View style={styles.personInfo}>
                <Text style={styles.personName}>{otherPersonData.name}</Text>
                <Text style={styles.personRole}>
                  {isDriver ? 'Verified Passenger' : 'GoRide Captain'}
                </Text>
              </View>
              <View style={styles.ratingPill}>
                <Text style={styles.ratingPillText}>⭐ {otherPersonData.rating?.toFixed(1) || '5.0'}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── PASSENGER RATING & FEEDBACK ──────────────────────── */}
        {ride.rating && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isDriver ? 'PASSENGER RATING & FEEDBACK' : 'YOUR RATING & REVIEW'}
            </Text>
            <View style={styles.ratingCard}>
              <View style={styles.ratingTopRow}>
                <View style={styles.ratingStarsBox}>
                  <Text style={styles.ratingStarsText}>
                    {'⭐'.repeat(Math.max(1, Math.min(5, Math.round(ride.rating.stars || 5))))}
                  </Text>
                  <View style={styles.ratingScoreBadge}>
                    <Text style={styles.ratingScoreText}>{ride.rating.stars}.0 / 5</Text>
                  </View>
                </View>
                {ride.rating.createdAt && (
                  <Text style={styles.ratingDateText}>
                    {formatDate(ride.rating.createdAt)}
                  </Text>
                )}
              </View>

              {ride.rating.review ? (
                <View style={styles.reviewQuoteCard}>
                  <View style={styles.reviewQuoteHeader}>
                    <Text style={{ fontSize: 13 }}>💬</Text>
                    <Text style={styles.reviewQuoteHeaderText}>Passenger Comment</Text>
                  </View>
                  <Text style={styles.reviewQuoteBody}>
                    "{ride.rating.review}"
                  </Text>
                </View>
              ) : (
                <Text style={styles.noReviewText}>Rated without written comments.</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 26,
    lineHeight: 26,
    color: '#0F172A',
    marginTop: -2,
    fontWeight: '600',
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: '#0F172A',
  },
  rideIdChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  rideIdChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingBottom: Spacing.huge,
  },
  mapSnapshot: {
    height: 195,
    width: '100%',
    backgroundColor: '#E2E8F0',
  },
  overviewCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: Spacing.md,
    marginTop: -18,
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: Spacing.md,
  },
  overviewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dateText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: '#64748B',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusCompletedBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusCompletedText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusActiveBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  statusActiveText: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusCancelledBadge: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  statusCancelledText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  indicatorCol: {
    alignItems: 'center',
    width: 22,
    marginRight: Spacing.sm,
    paddingTop: 4,
  },
  pickupRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 3,
    borderColor: '#D1FAE5',
  },
  trackLine: {
    width: 2,
    height: 38,
    backgroundColor: '#CBD5E1',
    marginVertical: 3,
  },
  dropPin: {
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 3,
    borderColor: '#FEE2E2',
  },
  addressCol: {
    flex: 1,
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  addressBlock: {
    minHeight: 34,
  },
  addressTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  addressTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 20,
  },
  section: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
    marginLeft: 4,
  },
  fareCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  fareMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  fareLeftCol: {},
  fareLabelMain: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  metaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  fareAmountText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
  },
  fareDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: Spacing.md,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentMethodLabel: {
    fontSize: FontSize.sm,
    color: '#64748B',
    fontWeight: '500',
  },
  paymentMethodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  paymentMethodBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#334155',
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: Spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  personRole: {
    fontSize: FontSize.xs,
    color: '#64748B',
    fontWeight: '500',
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 3,
  },
  ratingPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#92400E',
  },
  ratingCard: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  ratingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  ratingStarsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingStarsText: {
    fontSize: 16,
    letterSpacing: 2,
  },
  ratingScoreBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 6,
  },
  ratingScoreText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: '#B45309',
  },
  ratingDateText: {
    fontSize: FontSize.xs,
    color: '#94A3B8',
    fontWeight: '500',
  },
  reviewQuoteCard: {
    marginTop: Spacing.xs,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  reviewQuoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  reviewQuoteHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reviewQuoteBody: {
    fontSize: FontSize.sm,
    color: '#1E293B',
    fontWeight: '500',
    fontStyle: 'italic',
    lineHeight: 21,
  },
  noReviewText: {
    fontSize: FontSize.xs,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 4,
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: Spacing.xs,
  },
  endRideBtn: {
    backgroundColor: Colors.error,
    marginBottom: Spacing.sm,
  },
  cancelBtn: {
    borderColor: Colors.error,
    backgroundColor: Colors.errorFaint,
  },
});
