import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { BorderRadius, FontSize, FontWeight, Spacing } from '../../constants/theme';
import { Ride } from '../../types/ride.types';
import {
  formatFare,
  formatDateTime,
  getRideStatusLabel,
  getRideStatusColor,
  getVehicleLabel,
  truncateAddress,
} from '../../utils/formatters';
import { VehicleType, RIDE_STATUS } from '../../constants/enums';

interface RideHistoryCardProps {
  ride: Ride;
  onPress?: () => void;
}

export default function RideHistoryCard({ ride, onPress }: RideHistoryCardProps) {
  const statusColor = getRideStatusColor(ride.rideStatus);
  const statusLabel = getRideStatusLabel(ride.rideStatus);
  const isCompleted = ride.rideStatus === RIDE_STATUS.RIDE_COMPLETED;
  const isCancelled = ride.rideStatus.includes('CANCELLED');
  const driver = typeof ride.driver === 'object' && ride.driver !== null ? ride.driver : null;
  const fare = ride.finalFare ?? ride.estimatedFare;
  const distanceKm = ride.distanceKm ?? ride.distance;
  const durationMin = ride.estimatedDurationMin ?? ride.duration;

  return (
    <TouchableOpacity
      style={[styles.card, isCancelled && styles.cancelledCard]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatDateTime(ride.requestedAt || ride.createdAt)}</Text>
        <View style={styles.headerRight}>
          <Text style={[styles.fare, isCancelled && styles.cancelledFare]}>
            {formatFare(fare)}
          </Text>
          <View style={[styles.statusBadge, isCancelled ? styles.cancelledBadge : styles.completedBadge]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.locations}>
        <View style={styles.timeline}>
          <View style={[styles.locationDot, isCancelled && styles.mutedDot]} />
          <View style={styles.locationLine} />
          <View style={[styles.dropDiamond, isCancelled && styles.mutedDiamond]} />
        </View>
        <View style={styles.addresses}>
          <Text style={[styles.address, isCancelled && styles.mutedAddress]} numberOfLines={1}>
            {truncateAddress(ride.pickupAddress, 42)}
          </Text>
          <Text style={styles.address} numberOfLines={1}>
            {truncateAddress(ride.dropAddress, 42)}
          </Text>
        </View>
      </View>

      {isCompleted ? (
        <View style={styles.footer}>
          <View>
            <Text style={styles.driverName}>{driver?.name ?? 'Driver assigned'}</Text>
            <Text style={styles.vehicle}>
              {getVehicleLabel(ride.vehicleType as VehicleType)}
            </Text>
          </View>
          <View style={styles.ratingPill}>
            <Text style={styles.ratingText}>
              {driver?.rating?.toFixed(1) ?? '4.9'} star
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.metaText}>
          {Number(distanceKm || 0).toFixed(1)} km - {Math.round(Number(durationMin || 0))} min
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    gap: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  cancelledCard: {
    borderColor: Colors.errorFaint,
    opacity: 0.82,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  date: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  vehicle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  completedBadge: {
    backgroundColor: '#E0F2FE',
  },
  cancelledBadge: {
    backgroundColor: Colors.errorFaint,
  },
  statusText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
  },
  locations: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'stretch',
  },
  timeline: {
    width: 16,
    alignItems: 'center',
    paddingVertical: 4,
  },
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  mutedDot: {
    backgroundColor: Colors.border,
  },
  locationLine: {
    width: 1,
    flex: 1,
    minHeight: 26,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  dropDiamond: {
    width: 8,
    height: 8,
    backgroundColor: Colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  mutedDiamond: {
    backgroundColor: Colors.border,
  },
  addresses: {
    flex: 1,
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  address: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  mutedAddress: { color: Colors.textMuted },
  metaText: {
    fontSize: FontSize.sm,
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
  driverName: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  fare: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  cancelledFare: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  ratingPill: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  ratingText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
});
