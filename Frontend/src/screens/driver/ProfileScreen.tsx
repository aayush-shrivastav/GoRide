import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DriverStackParamList } from '../../navigation/DriverNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/common/Avatar';
import { getVehicleLabel } from '../../utils/formatters';
import { VehicleType } from '../../constants/enums';

type Props = NativeStackScreenProps<DriverStackParamList, 'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
  const { user, logout } = useAuth();

  function handleLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        logout();
      }
    } else {
      Alert.alert('Logout', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <Text style={styles.title}>Driver Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Avatar name={user?.name ?? 'Driver'} imageUri={user?.profileImage} size={80} />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingText}>⭐ {user?.rating?.toFixed(1) ?? 'New'} ({user?.ratingCount || 0})</Text>
            </View>
          </View>
        </View>

        {/* Vehicle Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>VEHICLE DETAILS</Text>
          <View style={styles.card}>
            <SettingRow label="Vehicle Type" value={getVehicleLabel(user?.vehicleType as VehicleType)} />
            <View style={styles.divider} />
            <SettingRow label="Model" value={user?.vehicleModel} />
            <View style={styles.divider} />
            <SettingRow label="Registration" value={user?.vehicleNumber} />
          </View>
        </View>

        {/* Settings Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.card}>
            <SettingRow label="Edit Profile" isLink onPress={() => navigation.navigate('EditProfile' as any)} />
            <View style={styles.divider} />
            <SettingRow label="Change Password" isLink onPress={() => navigation.navigate('ChangePassword')} />
            <View style={styles.divider} />
            <SettingRow label="Phone Number" value={user?.phone} />
            <View style={styles.divider} />
            <SettingRow label="License No." value={user?.licenseNumber} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUPPORT</Text>
          <View style={styles.card}>
            <SettingRow label="Driver Help Center" isLink />
            <View style={styles.divider} />
            <SettingRow label="Terms & Conditions" isLink />
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>App Version 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function SettingRow({
  label,
  value,
  isLink,
  onPress,
}: {
  label: string;
  value?: string;
  isLink?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      disabled={!onPress && !isLink}
      activeOpacity={0.7}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.settingRight}>
        {value && <Text style={styles.settingValue}>{value}</Text>}
        {isLink && <Text style={styles.chevron}>›</Text>}
      </View>
    </TouchableOpacity>
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
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.huge,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.lg,
  },
  profileInfo: {
    flex: 1,
    alignItems: 'flex-start',
  },
  name: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  email: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  ratingBadge: {
    backgroundColor: Colors.secondaryFaint,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  ratingText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: FontWeight.bold,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  settingLabel: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  settingValue: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  chevron: {
    fontSize: 20,
    color: Colors.textMuted,
    lineHeight: 20,
    marginTop: -2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: Spacing.lg,
  },
  logoutBtn: {
    backgroundColor: Colors.errorFaint,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error,
    marginTop: Spacing.md,
  },
  logoutText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.error,
  },
  version: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xl,
  },
});
