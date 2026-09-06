import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';

let RazorpayCheckout: any = null;
try {
  RazorpayCheckout = require('react-native-razorpay').default || require('react-native-razorpay');
} catch (e) {
  // Native module unavailable in Expo Go
}
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { Config } from '../../constants/config';
import { useRide } from '../../context/RideContext';
import { getRide } from '../../services/api/rideApi';
import { createOrder, verifyPayment } from '../../services/api/paymentApi';
import { RIDE_STATUS } from '../../constants/enums';
import { socketService } from '../../services/socket';
import { PaymentUpdatedPayload } from '../../types/ride.types';
import Button from '../../components/common/Button';
import FareCard from '../../components/ride/FareCard';
import { parseApiError } from '../../utils/formatters';

type Props = NativeStackScreenProps<PassengerStackParamList, 'Payment'>;

export default function PaymentScreen({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { clearRide, currentRide } = useRide();

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [rideDetails, setRideDetails] = useState<any>(currentRide);
  const hasNavigated = useRef(false);

  const proceedToRating = () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    clearRide();
    navigation.replace('Rating', { rideId });
  };

  useEffect(() => {
    fetchRideData();
  }, []);

  // Listen for real-time payment_updated socket event (e.g. async webhook capture)
  useEffect(() => {
    const handleSocketPaymentUpdated = (payload: PaymentUpdatedPayload) => {
      // Ignore updates for unrelated rides
      if (payload?.rideId !== rideId) return;

      setRideDetails((prev: any) => (prev ? { ...prev, paymentStatus: payload.status } : prev));

      if (payload.status === 'SUCCESS' && !hasNavigated.current) {
        Alert.alert('Payment Successful', 'Thank you for your payment!');
        proceedToRating();
      }
    };

    socketService.on('payment_updated', handleSocketPaymentUpdated);
    return () => {
      socketService.off('payment_updated', handleSocketPaymentUpdated);
    };
  }, [rideId]);

  async function fetchRideData() {
    try {
      const data = await getRide(rideId);
      setRideDetails(data);
    } catch (err) {
      Alert.alert('Error', 'Failed to fetch ride details for payment.');
    } finally {
      setFetching(false);
    }
  }

  async function handlePayOnline() {
    setLoading(true);
    try {
      if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
        Alert.alert(
          'Payment Unavailable',
          'Razorpay checkout is not available in Expo Go. Use a development build with Razorpay configured to complete online payment.',
        );
        return;
      }

      // 1. Create Order on backend
      const orderRes = await createOrder(rideId);
      
      const options = {
        description: `Payment for Ride ${rideId.slice(-6)}`,
        image: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png', // Cab icon
        currency: orderRes.currency,
        key: Config.RAZORPAY_KEY_ID, // Use the public key from env
        amount: orderRes.amount,
        name: 'GoRide',

        order_id: orderRes.orderId,
        theme: { color: Colors.primary },
      };

      // 2. Open Razorpay Checkout
      const data = await RazorpayCheckout.open(options);
      
      // 3. Verify on backend
      await verifyPayment({
        rideId,
        razorpay_order_id: data.razorpay_order_id,
        razorpay_payment_id: data.razorpay_payment_id,
        razorpay_signature: data.razorpay_signature,
      });

      // 4. Success -> Rating screen
      Alert.alert('Payment Successful', 'Thank you for your payment!');
      proceedToRating();

    } catch (err: any) {
      // Razorpay cancellation usually returns an object with `code` and `description`
      if (err.code) {
        Alert.alert('Payment Cancelled', err.description || 'You cancelled the payment.');
      } else {
        Alert.alert('Payment Failed', parseApiError(err));
      }
    } finally {
      setLoading(false);
    }
  }

  function handleFinishCash() {
    proceedToRating();
  }

  if (fetching || !rideDetails) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>Loading payment details...</Text>
      </View>
    );
  }

  const isCash = rideDetails.paymentMethod === 'cash';
  const isPaid = rideDetails.paymentStatus === 'SUCCESS';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <Text style={styles.title}>Ride Completed</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.successIconBox}>
          <Text style={styles.successIcon}>🎉</Text>
          <Text style={styles.successTitle}>You have arrived!</Text>
          <Text style={styles.successSub}>Hope you had a great ride.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fare Summary</Text>
          
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Total Distance</Text>
            <Text style={styles.fareValue}>{(rideDetails.distanceKm || 0).toFixed(1)} km</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Total Duration</Text>
            <Text style={styles.fareValue}>{Math.round(rideDetails.estimatedDurationMin || 0)} min</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.fareRowTotal}>
            <Text style={styles.fareLabelTotal}>Final Fare</Text>
            <Text style={styles.fareValueTotal}>₹{Math.round(rideDetails.finalFare || 0)}</Text>
          </View>

          <View style={styles.paymentMethodBadge}>
            <Text style={styles.paymentMethodText}>
              Payment Method: {isCash ? '💵 Cash' : '📱 Online'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isPaid ? (
          <Button
            title="Continue to Rating"
            onPress={handleFinishCash}
            fullWidth
            size="lg"
            variant="primary"
          />
        ) : isCash ? (
          <Button
            title="I have paid cash"
            onPress={handleFinishCash}
            fullWidth
            size="lg"
            variant="secondary"
          />
        ) : (
          <Button
            title={`Pay ₹${Math.round(rideDetails.finalFare || 0)} Securely`}
            onPress={handlePayOnline}
            loading={loading}
            fullWidth
            size="lg"
            variant="primary"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.base },
  header: {
    padding: Spacing.xl,
    paddingTop: 60,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  title: {
    color: Colors.white,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  scroll: {
    padding: Spacing.xl,
  },
  successIconBox: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    marginTop: Spacing.xl,
  },
  successIcon: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  successSub: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  fareLabel: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  fareValue: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.md,
  },
  fareRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareLabelTotal: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  fareValueTotal: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.extrabold,
    color: Colors.success,
  },
  paymentMethodBadge: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  paymentMethodText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  footer: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
