import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getResolvedHost(): string {
  // 1. If running in Expo Go or dev client on a device/emulator, extract the host machine IP
  // hostUri is e.g. "10.77.215.177:8081" or "192.168.1.10:8081"
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
  }

  // 2. Web fallback
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }

  // 3. Android emulator fallback when hostUri is localhost/missing
  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }

  return 'localhost';
}

function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  // If explicitly pointing to a remote HTTPS server or tunnel, prioritize it
  if (envUrl && envUrl.startsWith('https://')) {
    return envUrl;
  }

  // In local development on device, dynamically use the host machine's IP from Metro
  const resolvedHost = getResolvedHost();
  if (resolvedHost && resolvedHost !== 'localhost') {
    return `http://${resolvedHost}:5000/api`;
  }

  if (envUrl) {
    return envUrl;
  }

  return 'http://localhost:5000/api';
}

function getSocketUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (envUrl && envUrl.startsWith('https://')) {
    return envUrl;
  }

  const resolvedHost = getResolvedHost();
  if (resolvedHost && resolvedHost !== 'localhost') {
    return `http://${resolvedHost}:5000`;
  }

  if (envUrl) {
    return envUrl;
  }

  return 'http://localhost:5000';
}

export const Config = {
  get API_BASE_URL(): string {
    return getApiBaseUrl();
  },
  get SOCKET_URL(): string {
    return getSocketUrl();
  },
  STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_51UClsuIviejFRg60X2aB7J8w3z5n7w9q8y',
  RAZORPAY_KEY_ID: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_goridekey123',
  DRIVER_REQUEST_TIMEOUT_SECONDS: 30,
};

