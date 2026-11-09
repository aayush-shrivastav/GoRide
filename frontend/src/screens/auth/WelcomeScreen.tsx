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
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const { height } = Dimensions.get('window');

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <LinearGradient
      colors={['#111111', '#1B1B1B', '#252525']}
      style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F17" />

      {/* Hero Badge & Glow */}
      <View style={styles.hero}>
        <View style={styles.glowOuter}>
          <LinearGradient colors={['#FFFFFF', '#E8E8E8']} style={styles.badgeGradient}>
            <Ionicons name="car-sport" size={42} color={Colors.primary} />
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
        {['Instant matching', 'Live tracking', 'Cash & UPI'].map(f => (
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
            colors={Colors.gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.roleGradient}>
            <View style={styles.roleHeader}>
              <View style={styles.roleIcon}><Ionicons name="car-outline" size={25} color={Colors.white} /></View>
              <View style={styles.roleTextContainer}>
                <Text style={styles.roleTitle}>Book a Ride</Text>
                <Text style={styles.roleSubtitle}>Passenger Account • Fast Pickups</Text>
              </View>
              <Ionicons name="arrow-forward" size={22} color={Colors.white} />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fullRoleCard}
          onPress={() => navigation.navigate('Login', { role: 'driver' })}
          activeOpacity={0.8}>
          <LinearGradient
            colors={Colors.gradientSuccess}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.roleGradient}>
            <View style={styles.roleHeader}>
              <View style={styles.roleIcon}><Ionicons name="speedometer-outline" size={25} color={Colors.white} /></View>
              <View style={styles.roleTextContainer}>
                <Text style={styles.roleTitle}>Drive with GoRide</Text>
                <Text style={styles.roleSubtitle}>Driver Partner • Earn Daily</Text>
              </View>
              <Ionicons name="arrow-forward" size={22} color={Colors.white} />
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
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  badgeGradient: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
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
    color: '#CFCFCF',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillText: {
    fontSize: FontSize.xs,
    color: '#D8D8D8',
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
  roleIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
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
  disclaimer: {
    fontSize: FontSize.xs,
    color: '#BEBEBE',
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});

