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
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/common/Avatar';

type Props = NativeStackScreenProps<PassengerStackParamList, 'Profile'>;

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
        <Text style={styles.brand}>GoRide</Text>
        <Text style={styles.title}>Account</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileCard}>
          <View style={styles.profileWash} />
          <View style={styles.avatarWrap}>
            <Avatar name={user?.name ?? 'User'} imageUri={user?.profileImage} size={80} />
            <View style={styles.editBadge}>
              <Text style={styles.editBadgeText}>Edit</Text>
            </View>
          </View>
          <Text style={styles.name}>{user?.name || 'User'}</Text>
          <Text style={styles.email}>{user?.email || user?.phone}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{user?.rating?.toFixed(2) ?? 'New'}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>Rides</Text>
            </View>
          </View>
        </View>

        <View style={styles.menuCard}>
          <SettingRow 
            label="Edit Profile" 
            icon="Person" 
            isLink 
            onPress={() => navigation.navigate('EditProfile')}
          />
          <View style={styles.divider} />
          <SettingRow
            label="Activity History"
            icon="History"
            isLink
            onPress={() => navigation.navigate('RideHistory')}
          />
          <View style={styles.divider} />
          <SettingRow label="Payment Methods" icon="Pay" isLink />
          <View style={styles.divider} />
          <SettingRow 
            label="Emergency Contacts" 
            icon="🆘" 
            isLink 
            onPress={() => navigation.navigate('EmergencyContacts')}
          />
          <View style={styles.divider} />
          <SettingRow label="Help & Support" icon="Help" isLink />
          <View style={styles.divider} />
          <SettingRow label="Change Password" icon="Lock" isLink onPress={() => navigation.navigate('ChangePassword')} />
        </View>

        <View style={styles.menuCard}>
          <SettingRow label="Log Out" icon="Exit" isDanger onPress={handleLogout} />
        </View>

        <Text style={styles.version}>App Version 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function SettingRow({
  label,
  value,
  icon,
  isLink,
  isDanger,
  onPress,
}: {
  label: string;
  value?: string;
  icon?: string;
  isLink?: boolean;
  isDanger?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      disabled={!onPress && !isLink}
      activeOpacity={0.7}>
      <View style={[styles.menuIcon, isDanger && styles.menuIconDanger]}>
        <Text style={[styles.menuIconText, isDanger && styles.menuIconTextDanger]}>{icon}</Text>
      </View>
      <Text style={[styles.settingLabel, isDanger && styles.dangerLabel]}>{label}</Text>
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 38 : 58,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(250,248,255,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  brand: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  scroll: {
    padding: 20,
    paddingBottom: Spacing.huge,
  },
  profileCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  profileWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 96,
    backgroundColor: Colors.primaryFaint,
  },
  avatarWrap: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: Colors.card,
  },
  editBadge: {
    position: 'absolute',
    right: -8,
    bottom: 0,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 2,
    borderColor: Colors.card,
  },
  editBadgeText: { color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold },
  name: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  email: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  statValue: {
    fontSize: FontSize.xl,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  menuCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconDanger: {
    backgroundColor: Colors.errorFaint,
  },
  menuIconText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  menuIconTextDanger: {
    color: Colors.error,
  },
  settingLabel: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  dangerLabel: {
    color: Colors.error,
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
  version: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xl,
  },
});
