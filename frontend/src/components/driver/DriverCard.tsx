import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Avatar from '../common/Avatar';

import { Colors } from '../../constants/colors';
import {
  BorderRadius,
  FontSize,
  FontWeight,
  Spacing,
} from '../../constants/theme';

import { PopulatedDriver } from '../../types/ride.types';
import { getVehicleLabel } from '../../utils/formatters';
import { VehicleType } from '../../constants/enums';

interface DriverCardProps {
  driver: PopulatedDriver;
}

export default function DriverCard({ driver }: DriverCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Avatar
          name={driver.name}
          imageUri={driver.profileImage}
          size={56}
        />

        <View style={styles.info}>
          <Text style={styles.name}>{driver.name}</Text>

          <View style={styles.ratingRow}>
            <Text style={styles.ratingValue}>
              ⭐ {driver.rating ? driver.rating.toFixed(1) : '5.0'}
            </Text>

            <Text style={styles.ratingCount}>
              ({driver.ratingCount ?? 0} ratings)
            </Text>
          </View>

          {driver.gender === 'female' && (
            <View style={styles.femaleBadge}>
              <Text style={styles.femaleBadgeText}>
                ♀ Female Driver
              </Text>
            </View>
          )}
        </View>

        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleNumber}>
            {driver.vehicleNumber}
          </Text>

          <Text style={styles.vehicleType}>
            {getVehicleLabel(driver.vehicleType as VehicleType)}
          </Text>

          <Text style={styles.vehicleModel}>
            {driver.vehicleModel}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },

  info: {
    flex: 1,
    gap: 4,
  },

  name: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  ratingValue: {
    fontSize: FontSize.sm,
    color: Colors.warning,
    fontWeight: FontWeight.semibold,
  },

  ratingCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  femaleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryFaint,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.primary,
  },

  femaleBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.primaryLight,
    fontWeight: FontWeight.medium,
  },

  vehicleInfo: {
    alignItems: 'flex-end',
    gap: 2,
  },

  vehicleNumber: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },

  vehicleType: {
    fontSize: FontSize.sm,
    color: Colors.secondary,
    fontWeight: FontWeight.medium,
  },

  vehicleModel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
});