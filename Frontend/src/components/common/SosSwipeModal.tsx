import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';

interface SosSwipeModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  onWhatsAppAlert?: () => void;
}

const TRACK_HEIGHT = 180;
const KNOB_SIZE = 64;
const SWIPE_THRESHOLD = -(TRACK_HEIGHT - KNOB_SIZE - 20); // -96px upwards

export default function SosSwipeModal({
  visible,
  onClose,
  onConfirm,
  loading = false,
  onWhatsAppAlert,
}: SosSwipeModalProps) {
  const panY = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const [triggered, setTriggered] = useState(false);

  // Pulse glow effect
  useEffect(() => {
    if (!visible) {
      panY.setValue(0);
      setTriggered(false);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const arrow = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, { toValue: -15, duration: 700, useNativeDriver: true }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    arrow.start();

    return () => {
      pulse.stop();
      arrow.stop();
    };
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy <= 0) {
          // Upward swipe (negative dy)
          const clampedY = Math.max(gestureState.dy, -(TRACK_HEIGHT - KNOB_SIZE));
          panY.setValue(clampedY);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy <= SWIPE_THRESHOLD) {
          // Completed swipe up
          setTriggered(true);
          Animated.timing(panY, {
            toValue: -(TRACK_HEIGHT - KNOB_SIZE),
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            onConfirm();
          });
        } else {
          // Reset slider back down
          Animated.spring(panY, {
            toValue: 0,
            friction: 6,
            tension: 40,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  function handleDirectPoliceCall() {
    Linking.openURL('tel:112');
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <Animated.View style={[styles.glowCircle, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.iconCircle}>
              <Text style={styles.sosEmoji}>🚨</Text>
            </View>
          </Animated.View>

          <Text style={styles.title}>EMERGENCY SOS</Text>
          <Text style={styles.subtitle}>
            Hold & swipe up the button to alert emergency contacts and dial Police.
          </Text>

          {/* Warning Banner */}
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              📍 Live GPS location will be emailed and messaged to your emergency contacts.
            </Text>
          </View>

          {/* Swipe Up Track */}
          <View style={styles.trackContainer}>
            <View style={styles.track}>
              {/* Animated upward chevrons */}
              <Animated.View style={[styles.arrowContainer, { transform: [{ translateY: arrowAnim }] }]}>
                <Text style={styles.arrowText}>▲</Text>
                <Text style={styles.arrowText}>▲</Text>
                <Text style={styles.trackInstruction}>SWIPE UP TO CONFIRM</Text>
              </Animated.View>

              {/* Draggable Knob */}
              <Animated.View
                style={[
                  styles.knob,
                  {
                    transform: [{ translateY: panY }],
                  },
                ]}
                {...panResponder.panHandlers}>
                <Text style={styles.knobText}>🆘</Text>
              </Animated.View>
            </View>
          </View>

          {/* WhatsApp Direct Alert Button */}
          {onWhatsAppAlert && (
            <TouchableOpacity
              style={styles.whatsAppBtn}
              onPress={onWhatsAppAlert}
              activeOpacity={0.85}>
              <Text style={styles.whatsAppBtnText}>📲 Send WhatsApp Alert to Family</Text>
            </TouchableOpacity>
          )}

          {/* Quick Call Police Button */}
          <TouchableOpacity
            style={styles.policeBtn}
            onPress={handleDirectPoliceCall}>
            <Text style={styles.policeBtnText}>📞 Call Police (112) Directly</Text>
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1e293b',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  glowCircle: {
    marginBottom: Spacing.md,
    borderRadius: 50,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  sosEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  warningBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  warningText: {
    fontSize: FontSize.xs,
    color: '#fca5a5',
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: FontWeight.medium,
  },
  trackContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  track: {
    width: 80,
    height: TRACK_HEIGHT,
    backgroundColor: '#0f172a',
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 6,
    overflow: 'hidden',
  },
  arrowContainer: {
    position: 'absolute',
    top: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    color: '#ef4444',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: FontWeight.bold,
  },
  trackInstruction: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  knobText: {
    fontSize: 26,
  },
  whatsAppBtn: {
    width: '100%',
    backgroundColor: '#25D366',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.sm,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  whatsAppBtnText: {
    color: '#ffffff',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  policeBtn: {
    width: '100%',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
    marginBottom: Spacing.sm,
  },
  policeBtnText: {
    color: '#f87171',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  cancelBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
