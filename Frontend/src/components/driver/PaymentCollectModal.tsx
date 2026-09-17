import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

import { Colors } from '../../constants/colors';
import {
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
} from '../../constants/theme';

interface PaymentCollectModalProps {
  visible: boolean;
  fare: number;
  isOnlinePaid: boolean;
  loading: boolean;
  onConfirmCash: () => void;
  onConfirmOnline: () => void;
  onRefreshStatus?: () => void;
  onCancel: () => void;
}

export default function PaymentCollectModal({
  visible,
  fare,
  isOnlinePaid,
  loading,
  onConfirmCash,
  onConfirmOnline,
  onRefreshStatus,
  onCancel,
}: PaymentCollectModalProps) {
  const displayFare = Math.round(fare || 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {isOnlinePaid ? (
            <>
              <View style={styles.iconCircleSuccess}>
                <Text style={styles.iconText}>✅</Text>
              </View>

              <Text style={styles.title}>
                Payment Already Received
              </Text>

              <Text style={styles.subtitle}>
                The passenger has completed online payment for this trip.
              </Text>

              <View style={styles.fareBoxSuccess}>
                <Text style={styles.fareLabel}>
                  TOTAL FARE
                </Text>

                <Text style={styles.fareAmountSuccess}>
                  ₹{displayFare}
                </Text>

                <View style={styles.paidBadge}>
                  <Text style={styles.paidBadgeText}>
                    PAID ONLINE DIGITALLY
                  </Text>
                </View>
              </View>

              <Text style={styles.collectZeroText}>
                ⚠️ Collect{' '}
                <Text style={{ fontWeight: 'bold' }}>
                  ₹0
                </Text>{' '}
                cash from passenger
              </Text>

              <TouchableOpacity
                style={styles.finishBtn}
                onPress={onConfirmOnline}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator
                    color={Colors.white}
                    size="small"
                  />
                ) : (
                  <Text style={styles.finishBtnText}>
                    Finish & Complete Ride 👍
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.iconCirclePending}>
                <Text style={styles.iconText}>💰</Text>
              </View>

              <Text style={styles.title}>
                Confirm Trip Payment
              </Text>

              <Text style={styles.subtitle}>
                Please confirm payment received before ending the ride.
              </Text>

              <View style={styles.fareBox}>
                <Text style={styles.fareLabel}>
                  TOTAL TRIP FARE
                </Text>

                <Text style={styles.fareAmount}>
                  ₹{displayFare}
                </Text>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.cashBtn}
                  onPress={onConfirmCash}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator
                      color={Colors.white}
                      size="small"
                    />
                  ) : (
                    <Text style={styles.cashBtnText}>
                      💵 Confirm Cash Received (₹{displayFare})
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.onlineWaitingBox}>
                  <Text style={styles.onlineWaitingTitle}>
                    📱 Waiting for Passenger Online Pay...
                  </Text>

                  <Text style={styles.onlineWaitingSub}>
                    Ask passenger to pay on their app. Once paid,
                    this screen will update automatically.
                  </Text>

                  {onRefreshStatus && (
                    <TouchableOpacity
                      style={styles.refreshBtn}
                      onPress={onRefreshStatus}
                      disabled={loading}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.refreshBtnText}>
                        🔄 Check Online Payment Status
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onCancel}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>
                  Back to Map
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },

  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  iconCircleSuccess: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: '#10b981',
  },

  iconCirclePending: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.primary,
  },

  iconText: {
    fontSize: 30,
  },

  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },

  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },

  fareBox: {
    backgroundColor: Colors.background,
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  fareBoxSuccess: {
    backgroundColor: '#f0fdf4',
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: '#86efac',
  },

  fareLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 1,
  },

  fareAmount: {
    fontSize: 36,
    fontWeight: FontWeight.black,
    color: Colors.textPrimary,
    marginTop: 2,
  },

  fareAmountSuccess: {
    fontSize: 36,
    fontWeight: FontWeight.black,
    color: '#15803d',
    marginTop: 2,
  },

  paidBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginTop: 6,
  },

  paidBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#166534',
    letterSpacing: 0.5,
  },

  collectZeroText: {
    fontSize: FontSize.sm,
    color: '#b91c1c',
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },

  actionButtons: {
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  cashBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  cashBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.base,
    textAlign: 'center',
  },

  onlineWaitingBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: 4,
  },

  onlineWaitingTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    marginBottom: 4,
    textAlign: 'center',
  },

  onlineWaitingSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: Spacing.sm,
  },

  refreshBtn: {
    backgroundColor: '#e0e7ff',
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },

  refreshBtnText: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
  },

  finishBtn: {
    width: '100%',
    backgroundColor: '#16a34a',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  finishBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.base,
    textAlign: 'center',
  },

  cancelBtn: {
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },

  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});