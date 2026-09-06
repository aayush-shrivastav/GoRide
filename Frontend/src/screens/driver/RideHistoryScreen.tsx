import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  StatusBar,
  RefreshControl,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DriverStackParamList } from '../../navigation/DriverNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing } from '../../constants/theme';
import { getDriverRides } from '../../services/api/rideApi';
import { Ride } from '../../types/ride.types';
import RideHistoryCard from '../../components/ride/RideHistoryCard';
import Loader from '../../components/common/Loader';
import { parseApiError } from '../../utils/formatters';
import ErrorMessage from '../../components/common/ErrorMessage';

type Props = NativeStackScreenProps<DriverStackParamList, 'RideHistory'>;

export default function RideHistoryScreen({ navigation }: Props) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchHistory(1);
  }, []);

  async function fetchHistory(pageNumber: number, isRefresh = false) {
    try {
      if (!isRefresh && pageNumber === 1) setLoading(true);
      setError('');
      
      const res = await getDriverRides({ page: pageNumber, limit: 10 });
      
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
          Your completed trips will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      
      <View style={styles.header}>
        <Text style={styles.title}>Trip History</Text>
      </View>

      {error && !rides.length ? (
        <View style={styles.errorContainer}>
          <ErrorMessage message={error} onRetry={() => fetchHistory(1)} />
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <RideHistoryCard
              ride={item}
              onPress={() => navigation.navigate('RideDetail' as any, { rideId: item._id, ride: item })}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[Colors.secondary]}
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
  list: {
    padding: Spacing.lg,
    flexGrow: 1,
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
