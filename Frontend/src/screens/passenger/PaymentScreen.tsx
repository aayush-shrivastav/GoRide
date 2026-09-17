import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Alert,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { useRide } from '../../context/RideContext';
import { getRide } from '../../services/api/rideApi';
import { createOrder, verifyPayment } from '../../services/api/paymentApi';
import { RIDE_STATUS } from '../../constants/enums';
import { socketService } from '../../services/socket';
import { PaymentUpdatedPayload } from '../../types/ride.types';
import Button from '../../components/common/Button';
import { parseApiError } from '../../utils/formatters';

type Props = NativeStackScreenProps<PassengerStackParamList, 'Payment'>;

class PaymentScreenBoundary extends React.Component<
  React.PropsWithChildren<{ navigation: Props['navigation'] }>,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={[styles.container, styles.centered]}>
          <Text style={styles.loadingText}>Payment screen could not be displayed.</Text>
          <Button
            title="Back to Ride"
            onPress={() => this.props.navigation.goBack()}
            size="md"
            variant="primary"
          />
        </View>
      );
    }
    return this.props.children;
  }
}

function isUsableRide(ride: any): boolean {
  return Boolean(ride?._id || ride?.rideId);
}

function safeAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function safeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function PaymentScreenContent({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { clearRide, currentRide } = useRide();

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [rideDetails, setRideDetails] = useState<any>(
    isUsableRide(currentRide) ? currentRide : null,
  );
  const [loadError, setLoadError] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'online' | 'cash'>('online');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [activePaymentTab, setActivePaymentTab] = useState<'card' | 'upi'>('card');
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('123');
  const [upiId, setUpiId] = useState('passenger@okaxis');
  const [orderData, setOrderData] = useState<any>(null);
  const hasNavigated = useRef(false);

  const proceedToRating = () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    clearRide();
    navigation.replace('Rating', { rideId });
  };

  useEffect(() => {
    fetchRideData();
    return () => {
      // Prevent a slow request from updating an unmounted payment screen.
      fetchCancelled.current = true;
    };
  }, []);

  useEffect(() => {
    if (rideDetails?.paymentMethod) {
      setSelectedMethod(rideDetails.paymentMethod);
    }
  }, [rideDetails?.paymentMethod]);

  // Listen for real-time payment_updated socket event
  useEffect(() => {
    const handleSocketPaymentUpdated = (payload: PaymentUpdatedPayload) => {
      if (payload?.rideId !== rideId) return;
      setRideDetails((prev: any) => (prev ? { ...prev, paymentStatus: payload.status } : prev));
      if (payload.status === 'SUCCESS') {
        setShowCheckoutModal(false);
      }
    };

    socketService.on('payment_updated', handleSocketPaymentUpdated);
    return () => {
      socketService.off('payment_updated', handleSocketPaymentUpdated);
    };
  }, [rideId]);

  const fetchCancelled = useRef(false);

  async function fetchRideData() {
    fetchCancelled.current = false;
    setLoadError(false);
    try {
      const data = await getRide(rideId);
      if (!fetchCancelled.current && isUsableRide(data)) {
        setRideDetails(data);
      } else if (!fetchCancelled.current) {
        setLoadError(true);
      }
    } catch (err) {
      if (!fetchCancelled.current) {
        // Keep the already-loaded ride visible if only the refresh failed.
        setLoadError(!isUsableRide(currentRide));
      }
    } finally {
      if (!fetchCancelled.current) setFetching(false);
    }
  }

  // Open Checkout Modal
  async function handleOpenCheckout() {
    setLoading(true);
    try {
      const orderRes = await createOrder(rideId);
      setOrderData(orderRes);
      setShowCheckoutModal(true);
    } catch (err: any) {
      Alert.alert('Error', parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  // Confirm payment in Modal
  async function handleConfirmStripePayment() {
    if (!orderData) return;

    const orderId = String(orderData.orderId || '');
    const isMockOrder =
      orderId.startsWith('pi_') ||
      orderId.startsWith('order_mock_') ||
      orderId.startsWith('order_test_') ||
      orderId.startsWith('pi_mock_');

    // The in-app form is a development mock. It must never claim to confirm
    // a live Razorpay/Stripe order without the gateway's signed response.
    if (!isMockOrder) {
      Alert.alert(
        'Payment Setup Required',
        'This live order must be completed through the configured payment gateway. Test-card confirmation is available only in development mock mode.',
      );
      return;
    }

    setCheckoutSubmitting(true);
    try {
      await verifyPayment({
        rideId,
        orderId,
        paymentIntentId: orderId,
        signature: 'simulated_success',
      });

      setRideDetails((prev: any) => (prev ? { ...prev, paymentStatus: 'SUCCESS' } : prev));
      setShowCheckoutModal(false);
    } catch (err: any) {
      Alert.alert('Payment Failed', parseApiError(err));
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  function handleFinishCash() {
    if (rideDetails?.rideStatus === RIDE_STATUS.RIDE_COMPLETED || currentRide?.rideStatus === RIDE_STATUS.RIDE_COMPLETED) {
      proceedToRating();
    } else {
      Alert.alert('Cash Payment', 'Please pay the cash fare directly to your driver when you reach your destination.');
      if (navigation.canGoBack()) navigation.goBack();
    }
  }

  // When ActiveRide supplied the ride, show the payment UI immediately while
  // its API refresh runs in the background. Only a screen opened without any
  // ride data needs to wait for that request.
  if ((!rideDetails && fetching) || (!rideDetails && loadError)) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>
          {loadError ? 'Payment details could not be loaded.' : 'Loading payment details...'}
        </Text>
        {loadError && (
          <Button
            title="Retry"
            onPress={fetchRideData}
            size="md"
            variant="primary"
          />
        )}
      </View>
    );
  }

  const isPaid = rideDetails.paymentStatus === 'SUCCESS';
  const totalAmount = safeAmount(rideDetails.finalFare || rideDetails.estimatedFare);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.replace('ActiveRide', { rideId });
            }
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ride Payment</Text>
        <Text style={styles.headerSub}>Complete your trip payment</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.successIconBox}>
          <Text style={styles.successIcon}>🎉</Text>
          <Text style={styles.successTitle}>You have arrived!</Text>
          <Text style={styles.successSub}>Hope you had a great journey with GoRide.</Text>
        </View>

        {/* Fare Summary Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fare Summary</Text>
          
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Total Distance</Text>
            <Text style={styles.fareValue}>{safeNumber(rideDetails.distanceKm).toFixed(1)} km</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Total Duration</Text>
            <Text style={styles.fareValue}>{safeAmount(rideDetails.actualDurationMin || rideDetails.estimatedDurationMin)} min</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.fareRowTotal}>
            <Text style={styles.fareLabelTotal}>
              {rideDetails.finalFare ? 'Final Fare' : 'Trip Fare'}
            </Text>
            <Text style={styles.fareValueTotal}>
              ₹{totalAmount}
            </Text>
          </View>
        </View>

        {/* Payment Method Selector */}
        {!isPaid && (
          <View style={styles.methodSection}>
            <Text style={styles.sectionTitle}>Choose Payment Method</Text>

            {/* Online / Stripe Option */}
            <TouchableOpacity
              style={[
                styles.methodCard,
                selectedMethod === 'online' && styles.methodCardSelected,
              ]}
              onPress={() => setSelectedMethod('online')}
              activeOpacity={0.8}
            >
              <View style={styles.methodIconBox}>
                <Text style={styles.methodIcon}>💳</Text>
              </View>
              <View style={styles.methodInfo}>
                <View style={styles.methodTitleRow}>
                  <Text style={[styles.methodTitle, selectedMethod === 'online' && styles.methodTitleSelected]}>
                    Online (Stripe / UPI / Card)
                  </Text>
                  <View style={styles.onlineBadge}>
                    <Text style={styles.onlineBadgeText}>Fast & Secure</Text>
                  </View>
                </View>
                <Text style={styles.methodDesc}>
                  Pay instantly via Stripe, Cards, Netbanking or UPI
                </Text>
              </View>
              <View style={[styles.radioCircle, selectedMethod === 'online' && styles.radioCircleSelected]}>
                {selectedMethod === 'online' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            {/* Cash Option */}
            <TouchableOpacity
              style={[
                styles.methodCard,
                selectedMethod === 'cash' && styles.methodCardSelected,
              ]}
              onPress={() => setSelectedMethod('cash')}
              activeOpacity={0.8}
            >
              <View style={styles.methodIconBox}>
                <Text style={styles.methodIcon}>💵</Text>
              </View>
              <View style={styles.methodInfo}>
                <Text style={[styles.methodTitle, selectedMethod === 'cash' && styles.methodTitleSelected]}>
                  Cash to Driver
                </Text>
                <Text style={styles.methodDesc}>
                  Hand over ₹{totalAmount} cash directly to the driver
                </Text>
              </View>
              <View style={[styles.radioCircle, selectedMethod === 'cash' && styles.radioCircleSelected]}>
                {selectedMethod === 'cash' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          </View>
        )}

        {isPaid && (
          <View style={styles.paidSuccessCard}>
            <Text style={styles.paidSuccessIcon}>🎉</Text>
            <Text style={styles.paidSuccessTitle}>Payment Received</Text>
            <Text style={styles.paidSuccessSub}>
              ₹{totalAmount} successfully paid online via Stripe / Digital Payment.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Stripe Digital Checkout Modal ────────────────────── */}
      <Modal
        visible={showCheckoutModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!checkoutSubmitting) setShowCheckoutModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🔒 Stripe Secure Checkout</Text>
                <Text style={styles.modalSubtitle}>256-bit SSL Encrypted Payment</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCheckoutModal(false)}
                disabled={checkoutSubmitting}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Total Fare Display */}
            <View style={styles.modalFareBox}>
              <Text style={styles.modalFareLabel}>Total Fare to Pay</Text>
              <Text style={styles.modalFareValue}>₹{totalAmount}</Text>
            </View>

            {/* Payment Method Tabs */}
            <View style={styles.modalTabs}>
              <TouchableOpacity
                style={[styles.modalTab, activePaymentTab === 'card' && styles.modalTabActive]}
                onPress={() => setActivePaymentTab('card')}
              >
                <Text style={[styles.modalTabText, activePaymentTab === 'card' && styles.modalTabTextActive]}>
                  💳 Credit / Debit Card
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalTab, activePaymentTab === 'upi' && styles.modalTabActive]}
                onPress={() => setActivePaymentTab('upi')}
              >
                <Text style={[styles.modalTabText, activePaymentTab === 'upi' && styles.modalTabTextActive]}>
                  📱 UPI / GPay
                </Text>
              </TouchableOpacity>
            </View>

            {/* Card Inputs */}
            {activePaymentTab === 'card' ? (
              <View style={styles.cardForm}>
                <Text style={styles.inputLabel}>Card Number</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textInput}
                    value={cardNumber}
                    onChangeText={setCardNumber}
                    placeholder="4242 4242 4242 4242"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                  />
                  <Text style={styles.cardBrandIcon}>💳</Text>
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    <Text style={styles.inputLabel}>Valid Thru</Text>
                    <TextInput
                      style={styles.textInput}
                      value={cardExpiry}
                      onChangeText={setCardExpiry}
                      placeholder="MM/YY"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <Text style={styles.inputLabel}>CVC / CVV</Text>
                    <TextInput
                      style={styles.textInput}
                      value={cardCvc}
                      onChangeText={setCardCvc}
                      placeholder="CVC"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <Text style={styles.testCardHint}>✓ Pre-filled with Stripe Test Card</Text>
              </View>
            ) : (
              <View style={styles.cardForm}>
                <Text style={styles.inputLabel}>UPI ID / VPA</Text>
                <TextInput
                  style={styles.textInput}
                  value={upiId}
                  onChangeText={setUpiId}
                  placeholder="e.g. mobile@upi"
                  placeholderTextColor={Colors.textMuted}
                />
                <Text style={styles.testCardHint}>✓ Google Pay, PhonePe, Paytm supported</Text>
              </View>
            )}

            {/* Submit Button */}
            <View style={styles.modalActions}>
              <Button
                title={checkoutSubmitting ? 'Processing Stripe Payment...' : `Pay ₹${totalAmount} Securely 🔒`}
                onPress={handleConfirmStripePayment}
                loading={checkoutSubmitting}
                fullWidth
                size="lg"
                variant="primary"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Footer ─────────────────────────────────────────── */}
      <View style={styles.footer}>
        {isPaid ? (
          (rideDetails?.rideStatus === RIDE_STATUS.RIDE_COMPLETED || currentRide?.rideStatus === RIDE_STATUS.RIDE_COMPLETED) ? (
            <Button
              title="Continue to Rating ⭐"
              onPress={proceedToRating}
              fullWidth
              size="lg"
              variant="primary"
            />
          ) : (
            <Button
              title="Back to Active Ride 🚗"
              onPress={() => {
                if (navigation.canGoBack()) navigation.goBack();
              }}
              fullWidth
              size="lg"
              variant="primary"
            />
          )
        ) : selectedMethod === 'online' ? (
          <Button
            title={`Pay ₹${totalAmount} Online (Stripe / UPI)`}
            onPress={handleOpenCheckout}
            loading={loading}
            fullWidth
            size="lg"
            variant="primary"
          />
        ) : (
          <Button
            title={`I Have Paid ₹${totalAmount} in Cash 💵`}
            onPress={handleFinishCash}
            fullWidth
            size="lg"
            variant="secondary"
          />
        )}
      </View>
    </View>
  );
}

export default function PaymentScreen(props: Props) {
  return (
    <PaymentScreenBoundary navigation={props.navigation}>
      <PaymentScreenContent {...props} />
    </PaymentScreenBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.base },
  header: {
    padding: Spacing.xl,
    paddingTop: 55,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    position: 'relative',
  },
  backBtn: {
    position: 'absolute',
    left: Spacing.lg,
    top: 55,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.md,
    zIndex: 10,
  },
  backBtnText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  headerSub: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  title: {
    color: Colors.white,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  scroll: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  successIconBox: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    marginTop: Spacing.sm,
  },
  successIcon: {
    fontSize: 56,
    marginBottom: Spacing.xs,
  },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  successSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
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
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  fareLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  fareValue: {
    fontSize: FontSize.sm,
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
  methodSection: {
    marginBottom: Spacing.xl,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  methodCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
  },
  methodIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  methodIcon: {
    fontSize: 22,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  methodTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  methodTitleSelected: {
    color: Colors.primary,
  },
  onlineBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  onlineBadgeText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: '#15803d',
  },
  methodDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  radioCircleSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  paidSuccessCard: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#10b981',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.xl,
  },
  paidSuccessIcon: {
    fontSize: 32,
  },
  paidSuccessTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#047857',
  },
  paidSuccessSub: {
    fontSize: FontSize.xs,
    color: '#059669',
    textAlign: 'center',
  },
  footer: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
  },
  modalFareBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalFareLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  modalFareValue: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.primary,
  },
  modalTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.lg,
    padding: 3,
    marginBottom: Spacing.lg,
  },
  modalTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  modalTabActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modalTabText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  modalTabTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  cardForm: {
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  textInput: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  cardBrandIcon: {
    position: 'absolute',
    right: Spacing.md,
    fontSize: 20,
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  testCardHint: {
    fontSize: FontSize.xs,
    color: '#059669',
    marginTop: 4,
    fontWeight: FontWeight.medium,
  },
  modalActions: {
    marginTop: Spacing.xs,
  },
});
