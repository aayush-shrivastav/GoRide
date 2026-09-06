import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import * as authApi from '../../services/api/authApi';
import * as driverApi from '../../services/api/driverApi';
import { Storage } from '../../utils/storage';
import { socketService } from '../../services/socket';
import { parseApiError } from '../../utils/formatters';
import { VEHICLE_TYPES, VehicleType } from '../../constants/enums';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

type FormPassenger = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

type FormDriver = FormPassenger & {
  vehicleType: VehicleType;
  vehicleModel: string;
  vehicleNumber: string;
  licenseNumber: string;
};

export default function RegisterScreen({ navigation, route }: Props) {
  const { role } = route.params;
  const isDriver = role === 'driver';
  const accentColor = isDriver ? Colors.secondary : Colors.primary;
  const gradientColors = isDriver ? ['#00D4B4', '#00B89C'] : Colors.gradientPrimary;

  // We use a flat state to avoid complex nested state
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    gender: 'prefer_not_to_say',
    vehicleType: 'car' as VehicleType,
    vehicleModel: '',
    vehicleNumber: '',
    licenseNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: '' }));
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = 'Full name is required';
    if (!form.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = 'Enter a valid email';
    if (!form.phone.trim()) newErrors.phone = 'Phone is required';
    else if (!/^[6-9]\d{9}$/.test(form.phone))
      newErrors.phone = 'Enter a valid 10-digit phone number';
    if (!form.password) newErrors.password = 'Password is required';
    else if (form.password.length < 6)
      newErrors.password = 'Minimum 6 characters';
    if (form.password !== form.confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match';
    if (isDriver) {
      if (!form.vehicleModel.trim()) newErrors.vehicleModel = 'Vehicle model is required';
      if (!form.vehicleNumber.trim()) newErrors.vehicleNumber = 'Vehicle number is required';
      if (!form.licenseNumber.trim()) newErrors.licenseNumber = 'License number is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleRegister() {
    if (!validate()) return;
    setLoading(true);
    try {
      if (isDriver) {
        const data = await driverApi.registerDriver({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          gender: form.gender,
          vehicleType: form.vehicleType,
          vehicleModel: form.vehicleModel.trim(),
          vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
          licenseNumber: form.licenseNumber.trim().toUpperCase(),
        });
        const token = data.accessToken || data.data?.accessToken || '';
        const refresh = data.refreshToken || data.data?.refreshToken || '';
        const driverObj = data.driver || data.data?.driver;
        await Storage.saveTokens({
          accessToken: token,
          refreshToken: refresh,
        });
        await Storage.saveRole('driver');
        if (driverObj) await Storage.saveUserData(driverObj);
        if (token) socketService.connect(token);
      } else {
        const data = await authApi.registerPassenger({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          gender: form.gender,
        });
        const token = data.accessToken || data.data?.accessToken || '';
        const refresh = data.refreshToken || data.data?.refreshToken || '';
        const userObj = data.user || data.data?.user;
        await Storage.saveTokens({
          accessToken: token,
          refreshToken: refresh,
        });
        await Storage.saveRole('passenger');
        if (userObj) await Storage.saveUserData(userObj);
        if (token) socketService.connect(token);
      }
      // AuthContext will be refreshed on next mount via restoreSession
      navigation.replace('Login', { role });
    } catch (err) {
      Alert.alert('Registration Failed', parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <LinearGradient colors={gradientColors as any} style={styles.badge}>
              <Text style={styles.badgeText}>
                {isDriver ? '🏍 Driver' : '🧳 Passenger'}
              </Text>
            </LinearGradient>
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>
              Join as a {isDriver ? 'driver' : 'passenger'} today
            </Text>
          </View>

          {/* Personal info */}
          <Text style={styles.sectionLabel}>PERSONAL INFORMATION</Text>
          <Input
            label="Full Name"
            value={form.name}
            onChangeText={v => set('name', v)}
            error={errors.name}
            placeholder="John Doe"
            autoCapitalize="words"
          />
          <Input
            label="Email Address"
            value={form.email}
            onChangeText={v => set('email', v)}
            error={errors.email}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Phone Number"
            value={form.phone}
            onChangeText={v => set('phone', v)}
            error={errors.phone}
            placeholder="9876543210"
            keyboardType="phone-pad"
          />
          <Input
            label="Password"
            value={form.password}
            onChangeText={v => set('password', v)}
            error={errors.password}
            isPassword
            placeholder="Min 6 characters"
          />
          <Input
            label="Confirm Password"
            value={form.confirmPassword}
            onChangeText={v => set('confirmPassword', v)}
            error={errors.confirmPassword}
            isPassword
            placeholder="Repeat your password"
          />

          {/* Gender selection */}
          <Text style={[styles.sectionLabel, { marginTop: Spacing.md, marginBottom: Spacing.xs }]}>
            GENDER
          </Text>
          <View style={styles.vehicleTypeRow}>
            {[
              { label: 'Male ♂', value: 'male' },
              { label: 'Female ♀', value: 'female' },
              { label: 'Other', value: 'other' },
            ].map(item => (
              <TouchableOpacity
                key={item.value}
                style={[
                  styles.vehicleTypeBtn,
                  form.gender === item.value && styles.vehicleTypeSelected,
                ]}
                onPress={() => set('gender', item.value)}>
                <Text
                  style={[
                    styles.vehicleTypeText,
                    form.gender === item.value && { color: accentColor, fontWeight: '700' },
                  ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Driver-specific fields */}
          {isDriver && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>
                VEHICLE INFORMATION
              </Text>
              {/* Vehicle type selector */}
              <View style={styles.vehicleTypeRow}>
                {Object.values(VehicleType).map((type: string) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.vehicleTypeBtn,
                      form.vehicleType === type && styles.vehicleTypeSelected,
                    ]}
                    onPress={() => set('vehicleType', type)}>
                    <Text style={[
                      styles.vehicleTypeText,
                      form.vehicleType === type && { color: Colors.secondary },
                    ]}>
                      {type.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                label="Vehicle Model"
                value={form.vehicleModel}
                onChangeText={v => set('vehicleModel', v)}
                error={errors.vehicleModel}
                placeholder="e.g. Honda City, Bajaj Pulsar"
                autoCapitalize="words"
              />
              <Input
                label="Vehicle Number"
                value={form.vehicleNumber}
                onChangeText={v => set('vehicleNumber', v)}
                error={errors.vehicleNumber}
                placeholder="e.g. MH01AB1234"
                autoCapitalize="characters"
              />
              <Input
                label="License Number"
                value={form.licenseNumber}
                onChangeText={v => set('licenseNumber', v)}
                error={errors.licenseNumber}
                placeholder="Your driving license number"
                autoCapitalize="characters"
              />
            </>
          )}

          <Button
            title="Create Account"
            variant={isDriver ? 'secondary' : 'primary'}
            onPress={handleRegister}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.submitBtn}
          />

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login', { role })}>
              <Text style={[styles.loginLink, { color: accentColor }]}> Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.xl,
    paddingBottom: Spacing.huge,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxxl,
    paddingTop: Spacing.lg,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backIcon: { fontSize: 20, color: Colors.textPrimary },
  badge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  badgeText: {
    color: Colors.white,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  titleSection: { marginBottom: Spacing.xxl },
  title: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.extrabold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  vehicleTypeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  vehicleTypeBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  vehicleTypeSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondaryFaint,
  },
  vehicleTypeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
  },
  submitBtn: { marginTop: Spacing.xl, marginBottom: Spacing.lg },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  loginText: { fontSize: FontSize.base, color: Colors.textSecondary },
  loginLink: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
