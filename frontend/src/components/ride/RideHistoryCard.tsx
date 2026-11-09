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
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: Spacing.md,
  },
  cancelledCard: {
    borderColor: Colors.errorFaint,
    backgroundColor: Colors.surfaceElevated,
    opacity: 0.9,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    color: Colors.textMuted,
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
    color: Colors.textPrimary,
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
    backgroundColor: Colors.successFaint,
    borderWidth: 1,
    borderColor: '#B9E5D0',
  },
  completedText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cancelledBadge: {
    backgroundColor: Colors.errorFaint,
    borderWidth: 1,
    borderColor: '#F3B6A8',
  },
  cancelledText: {
    color: Colors.error,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activeBadge: {
    backgroundColor: Colors.primaryFaint,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeText: {
    color: Colors.textPrimary,
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
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.successFaint,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 22,
    backgroundColor: Colors.border,
    marginVertical: 3,
  },
  dropPin: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: Colors.error,
    borderWidth: 2,
    borderColor: Colors.errorFaint,
  },
  mutedDot: {
    backgroundColor: Colors.border,
    borderColor: Colors.divider,
  },
  mutedPin: {
    backgroundColor: Colors.border,
    borderColor: Colors.divider,
  },
  addresses: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
  },
  addressText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '500',
    lineHeight: 18,
  },
  mutedAddress: {
    color: Colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  footerPerson: {
    flex: 1,
  },
  personRoleLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  personName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vehicleChip: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  vehicleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  ratingPill: {
    backgroundColor: Colors.warningFaint,
    borderWidth: 1,
    borderColor: '#F4D68A',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ratingText: {
    fontSize: 11,
    color: Colors.warning,
    fontWeight: '700',
  },
});
