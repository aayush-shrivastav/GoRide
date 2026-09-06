import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  RefreshControl,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DriverStackParamList } from '../../navigation/DriverNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { getDriverRides } from '../../services/api/rideApi';
import { getTodayEarnings } from '../../services/api/driverApi';
import { Ride } from '../../types/ride.types';
import { RIDE_STATUS } from '../../constants/enums';
import { parseApiError, formatFare, formatDateTime } from '../../utils/formatters';

type Props = NativeStackScreenProps<DriverStackParamList, 'Earnings'>;

export default function EarningsScreen({ navigation }: Props) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [todayEarnings, setTodayEarnings] = useState<{ earnings: number, ridesCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEarnings();
  }, []);

  async function fetchEarnings(isRefresh = false) {
    if (!isRefresh) setLoading(true);
    try {
      const [res, todayRes] = await Promise.all([
        getDriverRides({ page: 1, limit: 50 }),
        getTodayEarnings()
      ]);
      setRides(res.rides.filter(r => r.rideStatus === RIDE_STATUS.RIDE_COMPLETED));
      setTodayEarnings(todayRes);
      setError('');
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    fetchEarnings(true);
  }

  const totalEarnings = rides.reduce((sum, ride) => sum + (ride.finalFare || 0), 0);
  const cashRides = rides.filter(r => r.paymentMethod === 'cash');
  const onlineRides = rides.filter(r => r.paymentMethod === 'online');
  
  const cashEarnings = cashRides.reduce((sum, ride) => sum + (ride.finalFare || 0), 0);
  const onlineEarnings = onlineRides.reduce((sum, ride) => sum + (ride.finalFare || 0), 0);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      
      <View style={styles.header}>
        <Text style={styles.title}>Earnings</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[Colors.secondary]} />
        }>
        
        {/* Today's Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Today's Earnings</Text>
          <Text style={styles.summaryTotal}>{formatFare(todayEarnings?.earnings || 0)}</Text>
          <View style={styles.summaryStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Today's Trips</Text>
              <Text style={styles.statValue}>{todayEarnings?.ridesCount || 0}</Text>
            </View>
          </View>
        </View>

        {/* Total Summary */}
        <View style={[styles.summaryCard, { backgroundColor: Colors.surfaceElevated, elevation: 1, marginTop: -15 }]}>
          <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Total Earnings (Recent)</Text>
          <Text style={[styles.summaryTotal, { color: Colors.textPrimary }]}>{formatFare(totalEarnings)}</Text>
          <View style={styles.summaryStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Trips</Text>
              <Text style={styles.statValue}>{rides.length}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Cash</Text>
              <Text style={styles.statValue}>{formatFare(cashEarnings)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Online</Text>
              <Text style={styles.statValue}>{formatFare(onlineEarnings)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Recent Completed Trips</Text>
        
        {rides.length === 0 && !loading && (
          <Text style={styles.emptyText}>No completed trips found yet.</Text>
        )}

        {rides.map(ride => (
          <View key={ride._id} style={styles.rideItem}>
            <View style={styles.rideInfo}>
              <Text style={styles.rideDate}>{formatDateTime(ride.createdAt)}</Text>
              <Text style={styles.ridePayment}>
                {ride.paymentMethod === 'cash' ? '💵 Cash' : '📱 Online'}
              </Text>
            </View>
            <Text style={styles.rideFare}>{formatFare(ride.finalFare)}</Text>
          </View>
        ))}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    padding: Spacing.lg,
    paddingTop: Platform.OS === 'android' ? 40 : 60,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.huge,
  },
  summaryCard: {
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    elevation: 4,
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  summaryLabel: {
    fontSize: FontSize.base,
    color: Colors.white,
    opacity: 0.9,
    marginBottom: Spacing.xs,
  },
  summaryTotal: {
    fontSize: FontSize.display * 1.2,
    fontWeight: FontWeight.extrabold,
    color: Colors.white,
    marginBottom: Spacing.lg,
  },
  summaryStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.white,
    opacity: 0.8,
    marginBottom: 2,
  },
  statValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  rideItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rideInfo: { gap: 2 },
  rideDate: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  ridePayment: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  rideFare: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.success,
  },
});
