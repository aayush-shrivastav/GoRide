import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Colors } from '../../constants/colors';
import {
  BorderRadius,
  FontSize,
  FontWeight,
  Spacing,
} from '../../constants/theme';
import { Ride } from '../../types/ride.types';
import {
  formatFare,
  formatDateTime,
  getVehicleLabel,
  truncateAddress,
} from '../../utils/formatters';
import {
  VehicleType,
  RIDE_STATUS,
} from '../../constants/enums';
import { useAuth } from '../../context/AuthContext';

interface RideHistoryCardProps {
  ride: Ride;
  onPress?: () => void;
}

export default function RideHistoryCard({
  ride,
  onPress,
}: RideHistoryCardProps) {
  const { role } = useAuth();
  const isDriver = role === 'driver';

  const isCompleted =
    ride.rideStatus === RIDE_STATUS.RIDE_COMPLETED ||
    ride.rideStatus === 'COMPLETED';

  const isCancelled =
    typeof ride.rideStatus === 'string' &&
    ride.rideStatus.includes('CANCELLED');

  const driver =
    typeof ride.driver === 'object' && ride.driver !== null
      ? (ride.driver as any)
      : null;

  const passenger =
    typeof ride.passenger === 'object' && ride.passenger !== null
      ? (ride.passenger as any)
      : null;

  const fare = ride.finalFare ?? ride.estimatedFare;
  const distanceKm = ride.distanceKm ?? ride.distance;
  const durationMin = ride.estimatedDurationMin ?? ride.duration;

  const otherPersonName = isDriver
    ? passenger?.name || 'Passenger'
    : driver?.name || 'Driver assigned';

  const ratingValue = ride.rating?.stars
    ? Number(ride.rating.stars).toFixed(1)
    : isDriver
    ? passenger?.rating
      ? Number(passenger.rating).toFixed(1)
      : '5.0'
    : driver?.rating
    ? Number(driver.rating).toFixed(1)
    : '5.0';

  return (
    <TouchableOpacity
      style={[styles.card, isCancelled && styles.cancelledCard]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* ── Top Row: Date & Status & Fare ── */}
      <View style={styles.topRow}>
        <Text style={styles.date}>
          {formatDateTime(ride.requestedAt || ride.createdAt)}
        </Text>

        <View style={styles.topRight}>
          <Text style={[styles.fare, isCancelled && styles.cancelledFare]}>
            {formatFare(fare)}
          </Text>

          <View
            style={[
              styles.statusBadge,
              isCompleted
                ? styles.completedBadge
                : isCancelled
                ? styles.cancelledBadge
                : styles.activeBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isCompleted
                  ? styles.completedText
                  : isCancelled
                  ? styles.cancelledText
                  : styles.activeText,
              ]}
            >
              {isCompleted ? '✓ COMPLETED' : isCancelled ? '✕ CANCELLED' : ride.rideStatus.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Timeline & Locations ── */}
      <View style={styles.locations}>
        <View style={styles.timeline}>
          <View style={[styles.pickupDot, isCancelled && styles.mutedDot]} />
          <View style={styles.timelineLine} />
          <View style={[styles.dropPin, isCancelled && styles.mutedPin]} />
        </View>

        <View style={styles.addresses}>
          <Text
            style={[styles.addressText, isCancelled && styles.mutedAddress]}
            numberOfLines={1}
          >
            {truncateAddress(ride.pickupAddress, 40)}
          </Text>

          <Text
            style={[styles.addressText, isCancelled && styles.mutedAddress]}
            numberOfLines={1}
          >
            {truncateAddress(ride.dropAddress, 40)}
          </Text>
        </View>
      </View>

      {/* ── Card Footer ── */}
      <View style={styles.footer}>
        <View style={styles.footerPerson}>
          <Text style={styles.personRoleLabel}>
            {isDriver ? 'Passenger' : 'Driver'}
          </Text>
          <Text style={styles.personName} numberOfLines={1}>
            {otherPersonName}
          </Text>
        </View>

        <View style={styles.footerRight}>
          <View style={styles.vehicleChip}>
            <Text style={styles.vehicleChipText}>
              {getVehicleLabel(ride.vehicleType as VehicleType)}
            </Text>
          </View>

          {isCompleted && (
            <View style={styles.ratingPill}>
              <Text style={styles.ratingText}>⭐ {ratingValue}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: Spacing.md,
  },
  cancelledCard: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FAFAFA',
    opacity: 0.9,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fare: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cancelledFare: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  completedBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  completedText: {
    color: '#047857',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cancelledBadge: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelledText: {
    color: '#B91C1C',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activeBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  activeText: {
    color: '#1D4ED8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  locations: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  timeline: {
    width: 14,
    alignItems: 'center',
    paddingVertical: 3,
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#D1FAE5',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 22,
    backgroundColor: '#CBD5E1',
    marginVertical: 3,
  },
  dropPin: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FEE2E2',
  },
  mutedDot: {
    backgroundColor: '#CBD5E1',
    borderColor: '#E2E8F0',
  },
  mutedPin: {
    backgroundColor: '#CBD5E1',
    borderColor: '#E2E8F0',
  },
  addresses: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
  },
  addressText: {
    fontSize: FontSize.sm,
    color: '#1E293B',
    fontWeight: '500',
    lineHeight: 18,
  },
  mutedAddress: {
    color: '#94A3B8',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerPerson: {
    flex: 1,
  },
  personRoleLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  personName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#0F172A',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vehicleChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  vehicleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  ratingPill: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ratingText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '700',
  },
});