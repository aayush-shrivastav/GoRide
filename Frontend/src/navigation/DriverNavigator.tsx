import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, Text } from 'react-native';
import { Colors } from '../constants/colors';
import { Spacing, FontSize, FontWeight } from '../constants/theme';
import { useNotifications } from '../context/NotificationContext';

// Screens
import DriverHomeScreen from '../screens/driver/DriverHomeScreen';
import DriverActiveRideScreen from '../screens/driver/ActiveRideScreen';
import EarningsScreen from '../screens/driver/EarningsScreen';
import DriverRideHistoryScreen from '../screens/driver/RideHistoryScreen';
import DriverNotificationsScreen from '../screens/passenger/NotificationsScreen';
import DriverProfileScreen from '../screens/driver/ProfileScreen';
import ChangePasswordScreen from '../screens/auth/ChangePasswordScreen';
import EditProfileScreen from '../screens/driver/EditProfileScreen';
import RideDetailScreen from '../screens/common/RideDetailScreen';

export type DriverStackParamList = {
  DriverTabs: undefined;
  HomeTabs?: undefined;
  ActiveRide: { rideId: string };
  ChangePassword: undefined;
  EditProfile: undefined;
  RideDetail: { rideId?: string; ride?: any };
  Earnings?: undefined;
  Profile?: undefined;
  RideHistory?: undefined;
  DriverHome?: undefined;
  DriverRideHistory?: undefined;
  DriverNotifications?: undefined;
  DriverProfile?: undefined;
};

export type DriverTabParamList = {
  DriverHome: undefined;
  Earnings: undefined;
  DriverRideHistory: undefined;
  DriverNotifications: undefined;
  DriverProfile: undefined;
};

const Stack = createNativeStackNavigator<DriverStackParamList>();
const Tab = createBottomTabNavigator<DriverTabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    DriverHome: '🗺',
    Earnings: '💰',
    DriverRideHistory: '📋',
    DriverNotifications: '🔔',
    DriverProfile: '👤',
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
      {icons[name]}
    </Text>
  );
}

function DriverTabs() {
  const { unreadCount } = useNotifications();

  return (
    <Tab.Navigator
      id={undefined}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.secondary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
      })}>
      <Tab.Screen
        name="DriverHome"
        component={DriverHomeScreen as any}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen as any}
        options={{ tabBarLabel: 'Earnings' }}
      />
      <Tab.Screen
        name="DriverRideHistory"
        component={DriverRideHistoryScreen as any}
        options={{ tabBarLabel: 'Rides' }}
      />
      <Tab.Screen
        name="DriverNotifications"
        component={DriverNotificationsScreen as any}
        options={{
          tabBarLabel: 'Alerts',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tab.Screen
        name="DriverProfile"
        component={DriverProfileScreen as any}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export default function DriverNavigator() {
  return (
    <Stack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverTabs" component={DriverTabs} />
      <Stack.Screen
        name="ActiveRide"
        component={DriverActiveRideScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="RideDetail"
        component={RideDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    height: 64,
  },
  tabLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  badge: {
    backgroundColor: Colors.error,
    fontSize: 10,
  },
});
