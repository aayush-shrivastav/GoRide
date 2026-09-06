import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const { height } = Dimensions.get('window');

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <LinearGradient
      colors={['#0B0F17', '#131B2A', '#1A2436']}
      style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F17" />

      {/* Hero Badge & Glow */}
      <View style={styles.hero}>
        <View style={styles.glowOuter}>
          <LinearGradient
            colors={['#00D26A', '#059669']}
            style={styles.badgeGradient}>
            <Text style={styles.badgeEmoji}>🚘</Text>
          </LinearGradient>
        </View>
      </View>

      {/* Brand Header */}
      <View style={styles.brand}>
        <Text style={styles.appName}>GoRide</Text>
        <Text style={styles.tagline}>Your ride, your way</Text>
      </View>

      {/* Feature Badges */}
      <View style={styles.features}>
        {['⚡ Instant Matching', '📍 Live GPS Tracking', '💳 Cash & UPI'].map(f => (
          <View key={f} style={styles.pill}>
            <Text style={styles.pillText}>{f}</Text>
          </View>
        ))}
      </View>

      {/* Role Selection Stack */}
      <View style={styles.cta}>
        <Text style={styles.ctaTitle}>Choose your account type</Text>

        <TouchableOpacity
          style={styles.fullRoleCard}
          onPress={() => navigation.navigate('Login', { role: 'passenger' })}
          activeOpacity={0.8}>
          <LinearGradient
            colors={['#00D26A', '#047857']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.roleGradient}>
            <View style={styles.roleHeader}>
              <Text style={styles.roleEmoji}>🧳</Text>
              <View style={styles.roleTextContainer}>
                <Text style={styles.roleTitle}>Book a Ride</Text>
                <Text style={styles.roleSubtitle}>Passenger Account • Fast Pickups</Text>
              </View>
              <Text style={styles.arrowIcon}>→</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fullRoleCard}
          onPress={() => navigation.navigate('Login', { role: 'driver' })}
          activeOpacity={0.8}>
          <LinearGradient
            colors={['#10B981', '#0F766E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.roleGradient}>
            <View style={styles.roleHeader}>
              <Text style={styles.roleEmoji}>🚕</Text>
              <View style={styles.roleTextContainer}>
                <Text style={styles.roleTitle}>Drive with GoRide</Text>
                <Text style={styles.roleSubtitle}>Driver Partner • Earn Daily</Text>
              </View>
              <Text style={styles.arrowIcon}>→</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          By continuing you agree to GoRide's Terms & Privacy Policy
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height * 0.08,
    marginBottom: Spacing.xl,
  },
  glowOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 210, 106, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 210, 106, 0.35)',
  },
  badgeGradient: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  badgeEmoji: {
    fontSize: 48,
  },
  brand: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  appName: {
    fontSize: 42,
    fontWeight: FontWeight.extrabold,
    color: Colors.white,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    letterSpacing: 0.5,
  },

  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginBottom: Spacing.xxxl,
  },
  pill: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  cta: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  ctaTitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fullRoleCard: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  roleGradient: {
    padding: Spacing.lg,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  roleEmoji: {
    fontSize: 32,
  },
  roleTextContainer: {
    flex: 1,
  },
  roleTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  roleSubtitle: {
    fontSize: FontSize.xs,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  arrowIcon: {
    fontSize: 22,
    color: Colors.white,
    fontWeight: FontWeight.bold,
  },
  disclaimer: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});

