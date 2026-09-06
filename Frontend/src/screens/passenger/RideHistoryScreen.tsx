import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  StatusBar,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { BorderRadius, FontSize, FontWeight, Spacing } from '../../constants/theme';
import { getRideHistory } from '../../services/api/rideApi';
import { Ride } from '../../types/ride.types';
import RideHistoryCard from '../../components/ride/RideHistoryCard';
import Loader from '../../components/common/Loader';
import { parseApiError } from '../../utils/formatters';
import ErrorMessage from '../../components/common/ErrorMessage';

type Props = NativeStackScreenProps<PassengerStackParamList, 'RideHistory'>;

export default function RideHistoryScreen({ navigation }: Props) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');

  useEffect(() => {
    fetchHistory(1);
  }, []);

  async function fetchHistory(pageNumber: number, isRefresh = false) {
    try {
      if (!isRefresh && pageNumber === 1) setLoading(true);
      setError('');

      const res = await getRideHistory({ page: pageNumber, limit: 10 });

      if (isRefresh || pageNumber === 1) {
        setRides(res.rides);
      } else {
        setRides(prev => [...prev, ...res.rides]);
      }

      const totalP = res.pages || res.totalPages || 1;
      setHasMore(pageNumber < totalP);
      setPage(pageNumber);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    fetchHistory(1, true);
  }

  function handleLoadMore() {
    if (!hasMore || loading || refreshing) return;
    fetchHistory(page + 1);
  }

  function renderEmpty() {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>🛣️</Text>
        <Text style={styles.emptyTitle}>No rides yet</Text>
        <Text style={styles.emptySub}>
          Your completed and cancelled rides will appear here.
        </Text>
      </View>
    );
  }

  const filteredRides = rides.filter((ride) => {
    if (filter === 'completed') return ride.rideStatus === 'COMPLETED';
    if (filter === 'cancelled') return ride.rideStatus.includes('CANCELLED');
    return true;
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <Text style={styles.brand}>GoRide</Text>
        <Text style={styles.title}>Activity</Text>
      </View>

      {error && !rides.length ? (
        <View style={styles.errorContainer}>
          <ErrorMessage message={error} onRetry={() => fetchHistory(1)} />
        </View>
      ) : (
        <FlatList
          data={filteredRides}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.filters}>
              {[
                { key: 'all', label: 'All' },
                { key: 'completed', label: 'Completed' },
                { key: 'cancelled', label: 'Cancelled' },
              ].map(item => {
                const active = filter === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setFilter(item.key as typeof filter)}
                    activeOpacity={0.75}>
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          }
          renderItem={({ item }) => (
            <RideHistoryCard
              ride={item}
              onPress={() => navigation.navigate('RideDetail', { rideId: item._id, ride: item })}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[Colors.primary]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={
            loading && rides.length > 0 ? (
              <View style={styles.footerLoader}>
                <Loader message="" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 38 : 58,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(250,248,255,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  brand: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  list: {
    padding: 20,
    flexGrow: 1,
  },
  filters: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  filterChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
  },
  filterText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  filterTextActive: {
    color: Colors.surface,
  },
  errorContainer: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.huge,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  emptySub: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: Spacing.xl,
  },
});
