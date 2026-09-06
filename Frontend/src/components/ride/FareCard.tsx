import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing } from '../../constants/theme';
import { RideEstimate } from '../../types/ride.types';
import { formatFare, formatDistance, formatDuration, getVehicleLabel } from '../../utils/formatters';
import { VehicleType } from '../../constants/enums';

interface FareCardProps {
  estimate: RideEstimate;
}

export default function FareCard({ estimate }: FareCardProps) {
  const { fare, distanceKm, distance, durationMin, duration, vehicleType } = estimate;
  const dist = distanceKm ?? (distance ? distance / 1000 : 0);
  const dur = durationMin ?? (duration ? Math.round(duration / 60) : 0);
  const totalFare = typeof fare === 'number' ? fare : fare?.totalFare ?? 0;
  const baseFare = typeof fare === 'object' ? fare.baseFare : undefined;
  const distanceFare = typeof fare === 'object' ? fare.distanceFare : undefined;
  const timeFare = typeof fare === 'object' ? fare.timeFare : undefined;
  const platformFee = typeof fare === 'object' ? fare.platformFee : undefined;
  const surgeMultiplier = typeof fare === 'object' ? fare.surgeMultiplier : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDistance(dist * 1000)}</Text>
          <Text style={styles.statLabel}>Distance</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDuration(dur * 60)}</Text>
          <Text style={styles.statLabel}>Duration</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{getVehicleLabel(vehicleType as VehicleType)}</Text>
          <Text style={styles.statLabel}>Vehicle</Text>
        </View>
      </View>

      <View style={styles.fareRow}>
        <Text style={styles.fareLabel}>Estimated Fare</Text>
        <Text style={styles.fareValue}>{formatFare(totalFare)}</Text>
      </View>

      <View style={styles.breakdownContainer}>
        {baseFare !== undefined && <BreakdownRow label="Base Fare" value={formatFare(baseFare)} />}
        {distanceFare !== undefined && <BreakdownRow label="Distance" value={formatFare(distanceFare)} />}
        {timeFare !== undefined && <BreakdownRow label="Time" value={formatFare(timeFare)} />}
        {platformFee !== undefined && <BreakdownRow label="Platform Fee" value={formatFare(platformFee)} />}
        {surgeMultiplier && surgeMultiplier > 1 && (
          <BreakdownRow
            label={`Surge (${surgeMultiplier}x)`}
            value=""
            isHighlight
          />
        )}
      </View>

      <Text style={styles.note}>
        Final fare is determined by the backend based on actual distance
      </Text>
    </View>
  );
}

function BreakdownRow({
  label,
  value,
  isHighlight,
}: {
  label: string;
  value: string;
  isHighlight?: boolean;
}) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, isHighlight && styles.highlightText]}>
        {label}
      </Text>
      <Text style={[styles.breakdownValue, isHighlight && styles.highlightText]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: Colors.primaryFaint,
    borderRadius: 12,
    padding: Spacing.lg,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fareLabel: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  fareValue: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.primary,
  },
  breakdownContainer: {
    gap: Spacing.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  breakdownLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  breakdownValue: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  highlightText: {
    color: Colors.warning,
    fontWeight: FontWeight.semibold,
  },
  note: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
