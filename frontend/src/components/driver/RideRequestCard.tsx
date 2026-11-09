import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';

import { Colors } from '../../constants/colors';
import {
  BorderRadius,
  FontSize,
  FontWeight,
  Spacing,
} from '../../constants/theme';

import {
  formatFare,
  formatDistance,
  formatDuration,
  getVehicleLabel,
} from '../../utils/formatters';

import { VehicleType } from '../../constants/enums';
import { Config } from '../../constants/config';

interface RideRequestCardProps {
  ride: any;
  onAccept: () => void;
  onReject: () => void;
  loading?: boolean;
}

export default function RideRequestCard({
  ride,
  onAccept,
  onReject,
  loading = false,
}: RideRequestCardProps) {
  const timeoutSeconds =
    Number(ride?.expiresInSeconds) || Config.DRIVER_REQUEST_TIMEOUT_SECONDS;

  const [timeLeft, setTimeLeft] = useState(timeoutSeconds);

  const progressAnim = useRef(new Animated.Value(1)).current;

  const passenger =
    typeof ride?.passenger === 'object' ? ride.passenger : null;

  useEffect(() => {
    const duration =
      Number(ride?.expiresInSeconds) || Config.DRIVER_REQUEST_TIMEOUT_SECONDS;

    setTimeLeft(duration);
    progressAnim.setValue(1);

    const interval = setInterval(() => {
      setTimeLeft((currentTime) => {
        if (currentTime <= 1) {
          clearInterval(interval);
          onReject();
          return 0;
        }

        return currentTime - 1;
      });
    }, 1000);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: duration * 1000,
      useNativeDriver: false,
    }).start();

    return () => {
      clearInterval(interval);
      progressAnim.stopAnimation();
    };
  }, [ride?.rideId, ride?._id, onReject, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.card}>
      {/* Timer progress bar */}
      <View style={styles.progressBg}>
        <Animated.View
          style={[styles.progressBar, { width: progressWidth }]}
        />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.passengerInfo}>
          <Text style={styles.passengerName}>
            {passenger?.name ?? 'Passenger'}
          </Text>

          {passenger?.gender === 'female' && (
            <View style={styles.femaleBadge}>
              <Text style={styles.femaleBadgeText}>
                ♀ Female
              </Text>
            </View>
          )}
        </View>

        <View style={styles.timerBox}>
          <Text
            style={[
              styles.timerText,
              timeLeft <= 5 && styles.timerUrgent,
            ]}
          >
            {timeLeft}s
          </Text>
        </View>
      </View>

      {/* Route */}
      <View style={styles.route}>
        <View style={styles.locationRow}>
          <View style={[styles.dot, styles.pickupDot]} />

          <Text style={styles.address} numberOfLines={2}>
            {ride?.pickupAddress ?? 'Pickup location'}
          </Text>
        </View>

        <View style={styles.connector} />

        {(ride?.stops ?? []).map((stop: any, index: number) => (
          <React.Fragment
            key={`stop-${index}-${stop?.address ?? ''}`}
          >
            <View style={styles.locationRow}>
              <View style={[styles.dot, styles.stopDot]} />

              <Text style={styles.address} numberOfLines={2}>
                Stop {index + 1}: {stop?.address ?? 'Unknown stop'}
              </Text>
            </View>

            <View style={styles.connector} />
          </React.Fragment>
        ))}

        <View style={styles.locationRow}>
          <View style={[styles.dot, styles.dropDot]} />

          <Text style={styles.address} numberOfLines={2}>
            {ride?.dropAddress ?? 'Drop location'}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <Stat
          label="Distance"
          value={formatDistance((ride?.distanceKm ?? 0) * 1000)}
        />

        <Stat
          label="Duration"
          value={formatDuration(
            (ride?.estimatedDurationMin ?? 0) * 60
          )}
        />

        <Stat
          label="Fare"
          value={formatFare(ride?.estimatedFare ?? 0)}
          isHighlight
        />

        <Stat
          label="Vehicle"
          value={getVehicleLabel(
            ride?.vehicleType as VehicleType
          )}
        />

        <Stat
          label="Stops"
          value={String(
            ride?.stopCount ?? ride?.stops?.length ?? 0
          )}
        />
      </View>

      {/* Payment method */}
      <View style={styles.paymentRow}>
        <Text style={styles.paymentLabel}>
          {ride?.paymentMethod === 'cash'
            ? '💵 Cash payment'
            : '📱 Online payment'}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.rejectBtn]}
          onPress={onReject}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.rejectText}>
            ✗ Reject
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.acceptBtn]}
          onPress={onAccept}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.acceptText}>
            {loading ? 'Accepting…' : '✓ Accept'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  isHighlight = false,
}: {
  label: string;
  value: string;
  isHighlight?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text
        style={[
          styles.statValue,
          isHighlight && styles.highlight,
        ]}
      >
        {value}
      </Text>

      <Text style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.primary,
  },

  progressBg: {
    height: 4,
    backgroundColor: Colors.border,
  },

  progressBar: {
    height: 4,
    backgroundColor: Colors.primary,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },

  passengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },

  passengerName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },

  femaleBadge: {
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

  timerBox: {
    backgroundColor: Colors.warning + '20',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.warning,
  },

  timerText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },

  timerUrgent: {
    color: Colors.error,
  },

  route: {
    paddingHorizontal: Spacing.lg,
    gap: 4,
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },

  pickupDot: {
    backgroundColor: Colors.primary,
  },

  stopDot: {
    backgroundColor: Colors.warning,
  },

  dropDot: {
    backgroundColor: Colors.error,
  },

  connector: {
    width: 1,
    height: 16,
    backgroundColor: Colors.border,
    marginLeft: 4.5,
    marginVertical: 2,
  },

  address: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: Spacing.lg,
    backgroundColor: Colors.surfaceElevated,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  stat: {
    alignItems: 'center',
    gap: 2,
  },

  statValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },

  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  highlight: {
    color: Colors.success,
  },

  paymentRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },

  paymentLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  actions: {
    flexDirection: 'row',
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  btn: {
    flex: 1,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rejectBtn: {
    backgroundColor: Colors.errorFaint,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },

  acceptBtn: {
    backgroundColor: Colors.successFaint,
  },

  rejectText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.error,
  },

  acceptText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.success,
  },
});