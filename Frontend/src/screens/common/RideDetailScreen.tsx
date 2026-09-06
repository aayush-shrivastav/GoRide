import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { Ride } from '../../types/ride.types';
import { getRide } from '../../services/api/rideApi';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { MapContainer } from '../../components/map/MapContainer';
import Avatar from '../../components/common/Avatar';
import { useAuth } from '../../context/AuthContext';

type Props = NativeStackScreenProps<any, 'RideDetail'>;

export default function RideDetailScreen({ route, navigation }: Props) {
  const { rideId, ride: initialRide } = route.params as { rideId?: string; ride?: Ride };
  const [ride, setRide] = useState<Ride | null>(initialRide || null);
  const [loading, setLoading] = useState(!initialRide);
  const { user, role } = useAuth();
  
  const isDriver = role === 'driver';

  useEffect(() => {
    if (!ride && rideId) {
      fetchRideDetails();
    }
  }, [rideId]);

  async function fetchRideDetails() {
    try {
      setLoading(true);
      const fetchedRide = await getRide(rideId!);
      setRide(fetchedRide);
    } catch (error) {
      Alert.alert('Error', 'Could not load ride details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  if (loading || !ride) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const otherPerson = isDriver ? ride.passenger : ride.driver;
  const otherPersonData = typeof otherPerson === 'object' ? otherPerson : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ride Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Map Snapshot */}
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

        {/* Info Card */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.dateText}>{formatDate(ride.createdAt)}</Text>
            <View style={[styles.statusBadge, ride.rideStatus === 'COMPLETED' ? styles.statusCompleted : styles.statusCancelled]}>
              <Text style={[styles.statusText, ride.rideStatus === 'COMPLETED' ? styles.statusCompletedText : styles.statusCancelledText]}>
                {ride.rideStatus.replace(/_/g, ' ')}
              </Text>
            </View>
          </View>

          <View style={styles.locations}>
            <View style={styles.locationRow}>
              <Text style={styles.dotPickup}>•</Text>
              <Text style={styles.addressText} numberOfLines={2}>{ride.pickupAddress}</Text>
            </View>
            <View style={styles.connector} />
            <View style={styles.locationRow}>
              <Text style={styles.dotDrop}>•</Text>
              <Text style={styles.addressText} numberOfLines={2}>{ride.dropAddress}</Text>
            </View>
          </View>
        </View>

        {/* Fare Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FARE SUMMARY</Text>
          <View style={styles.card}>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Total Fare</Text>
              <Text style={styles.fareValue}>{formatCurrency(ride.finalFare || ride.estimatedFare)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Payment Method</Text>
              <Text style={styles.fareLabel}>{ride.paymentMethod.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* User Info */}
        {otherPersonData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isDriver ? 'PASSENGER' : 'DRIVER'}</Text>
            <View style={styles.profileCard}>
              <Avatar name={otherPersonData.name} imageUri={otherPersonData.profileImage} size={50} />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{otherPersonData.name}</Text>
                <Text style={styles.ratingText}>⭐ {otherPersonData.rating?.toFixed(1) || 'New'}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 50,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: Spacing.sm },
  backText: { fontSize: 32, lineHeight: 32, color: Colors.textPrimary },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  placeholder: { width: 40 },
  scrollContent: { paddingBottom: Spacing.xxxl },
  mapSnapshot: {
    height: 200,
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
  },
  card: {
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    marginHorizontal: Spacing.md,
    marginTop: -20,
    borderRadius: BorderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: Spacing.lg,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  dateText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusCompleted: { backgroundColor: Colors.successFaint },
  statusCancelled: { backgroundColor: Colors.errorFaint },
  statusText: { fontSize: FontSize.xs, fontWeight: 'bold' },
  statusCompletedText: { color: Colors.success },
  statusCancelledText: { color: Colors.error },
  locations: { gap: Spacing.xs },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  dotPickup: { color: Colors.primary, fontSize: FontSize.lg, marginTop: -4 },
  dotDrop: { color: Colors.error, fontSize: FontSize.lg, marginTop: -4 },
  connector: { width: 1, height: 15, backgroundColor: Colors.border, marginLeft: 3.5, marginVertical: 2 },
  addressText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  section: { marginHorizontal: Spacing.md, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: 'bold', color: Colors.textMuted, letterSpacing: 1, marginBottom: Spacing.sm, marginLeft: Spacing.sm },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareLabel: { fontSize: FontSize.base, color: Colors.textSecondary },
  fareValue: { fontSize: FontSize.lg, fontWeight: 'bold', color: Colors.textPrimary },
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FontSize.base, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
  ratingText: { fontSize: FontSize.sm, color: Colors.textSecondary },
});
