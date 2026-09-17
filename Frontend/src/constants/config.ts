import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getFallbackHost(): string {
  // If running in Expo Go or dev client, extract host machine IP from Metro bundle URL
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return host;
  }

  // Web fallback
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }

  return 'localhost';
}

const fallbackHost = getFallbackHost();

export const Config = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL || `http://${fallbackHost}:5000/api`,
  SOCKET_URL: process.env.EXPO_PUBLIC_SOCKET_URL || `http://${fallbackHost}:5000`,
  STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_51UClsuIviejFRg60X2aB7J8w3z5n7w9q8y',
  RAZORPAY_KEY_ID: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_goridekey123',
  DRIVER_REQUEST_TIMEOUT_SECONDS: 30,
};
