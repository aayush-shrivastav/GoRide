import React from 'react';

import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors } from '../constants/colors';

import {
  Spacing,
  FontSize,
  FontWeight,
} from '../constants/theme';

import { useNotifications } from '../context/NotificationContext';

// Screens
import HomeScreen from '../screens/passenger/HomeScreen';
import SelectLocationScreen from '../screens/passenger/SelectLocationScreen';
import FareEstimateScreen from '../screens/passenger/FareEstimateScreen';
import SearchingDriverScreen from '../screens/passenger/SearchingDriverScreen';
import PassengerActiveRideScreen from '../screens/passenger/ActiveRideScreen';
import PaymentScreen from '../screens/passenger/PaymentScreen';
import RatingScreen from '../screens/passenger/RatingScreen';
import RideHistoryScreen from '../screens/passenger/RideHistoryScreen';
import NotificationsScreen from '../screens/passenger/NotificationsScreen';
import ProfileScreen from '../screens/passenger/ProfileScreen';
import ChangePasswordScreen from '../screens/auth/ChangePasswordScreen';
import EditProfileScreen from '../screens/passenger/EditProfileScreen';
import RideDetailScreen from '../screens/common/RideDetailScreen';
import EmergencyContactsScreen from '../screens/passenger/EmergencyContactsScreen';
import HelpCenterScreen from '../screens/common/HelpCenterScreen';
import TermsScreen from '../screens/common/TermsScreen';
import PaymentMethodsScreen from '../screens/passenger/PaymentMethodsScreen';
import VoiceBookingScreen from '../screens/passenger/VoiceBookingScreen';

import { GeoLocation } from '../types/ride.types';

export type PassengerStackParamList = {
  HomeTabs: undefined;

  SelectLocation: undefined;

  FareEstimate: {
    pickup: GeoLocation;
    drop: GeoLocation;
    stops?: GeoLocation[];
  };

  SearchingDriver: {
    rideId: string;
  };

  ActiveRide: {
    rideId: string;
  };

  Payment: {
    rideId: string;
  };

  Rating: {
    rideId: string;
    driverId?: string;
  };

  ChangePassword: undefined;

  EditProfile: undefined;

  RideDetail: {
    rideId?: string;
    ride?: any;
  };

  EmergencyContacts: undefined;
  Notifications: undefined;
  Profile: undefined;
  RideHistory: undefined;
  HelpCenter: undefined;
  Terms: undefined;
  PaymentMethods: undefined;
  VoiceBooking: undefined;
};

export type PassengerTabParamList = {
  Home: undefined;
  RideHistory: undefined;
  Notifications: undefined;
  Profile: undefined;
};

const Stack =
  createNativeStackNavigator<PassengerStackParamList>();

const Tab =
  createBottomTabNavigator<PassengerTabParamList>();

function TabIcon({
  name,
  focused,
}: {
  name: keyof PassengerTabParamList;
  focused: boolean;
}) {
  const icons: Record<
    keyof PassengerTabParamList,
    { active: any; inactive: any }
  > = {
    Home: { active: 'home', inactive: 'home-outline' },
    RideHistory: { active: 'receipt', inactive: 'receipt-outline' },
    Notifications: { active: 'notifications', inactive: 'notifications-outline' },
    Profile: { active: 'person', inactive: 'person-outline' },
  };

  return (
    <Ionicons
      name={icons[name][focused ? 'active' : 'inactive']}
      size={22}
      color={focused ? Colors.primary : Colors.textMuted}
    />
  );
}

function PassengerTabs() {
  const { unreadCount } = useNotifications();

  return (
    <Tab.Navigator
      id={undefined}
      screenOptions={({ route }) => ({
        headerShown: false,

        tabBarStyle: styles.tabBar,

        tabBarActiveTintColor:
          Colors.primary,

        tabBarInactiveTintColor:
          Colors.textMuted,

        tabBarLabelStyle:
          styles.tabLabel,

        tabBarIcon: ({ focused }) => (
          <TabIcon
            name={route.name}
            focused={focused}
          />
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
      />

      <Tab.Screen
        name="RideHistory"
        component={RideHistoryScreen}
        options={{
          tabBarLabel: 'Rides',
        }}
      />

      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Alerts',

          tabBarBadge:
            unreadCount > 0
              ? unreadCount
              : undefined,

          tabBarBadgeStyle:
            styles.badge,
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
      />
    </Tab.Navigator>
  );
}

export default function PassengerNavigator() {
  return (
    <Stack.Navigator
      id={undefined}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="HomeTabs"
        component={PassengerTabs}
      />

      <Stack.Screen
        name="SelectLocation"
        component={SelectLocationScreen}
        options={{
          animation: 'slide_from_bottom',
        }}
      />

      <Stack.Screen
        name="FareEstimate"
        component={FareEstimateScreen}
        options={{
          animation: 'slide_from_bottom',
        }}
      />

      <Stack.Screen
        name="SearchingDriver"
        component={SearchingDriverScreen}
        options={{
          animation: 'fade',
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="ActiveRide"
        component={PassengerActiveRideScreen}
        options={{
          animation: 'fade',
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="Payment"
        component={PaymentScreen}
        options={{
          animation: 'slide_from_bottom',
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="Rating"
        component={RatingScreen}
        options={{
          animation: 'slide_from_bottom',
          gestureEnabled: false,
        }}
      />

      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{
          animation: 'slide_from_right',
        }}
      />

      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{
          animation: 'slide_from_right',
        }}
      />

      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="VoiceBooking" component={VoiceBookingScreen} options={{ animation: 'slide_from_bottom' }} />

      <Stack.Screen
        name="RideDetail"
        component={RideDetailScreen}
        options={{
          animation: 'slide_from_right',
        }}
      />

      <Stack.Screen
        name="EmergencyContacts"
        component={EmergencyContactsScreen}
        options={{
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen name="HelpCenter" component={HelpCenterScreen as any} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Terms" component={TermsScreen as any} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    height: 68,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 8,
  },

  tabLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginTop: 3,
  },

  badge: {
    backgroundColor: Colors.error,
    fontSize: 10,
  },
});
