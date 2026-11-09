import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getResolvedHost(): string {
  // 1. Web: dynamically use current browser hostname
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return window.location.hostname;
    }
    return 'localhost';
  }

  // 2. If running in Expo Go or dev client on a device/emulator, extract the host machine IP
  // hostUri is e.g. "10.85.23.177:8081" or "192.168.1.10:8081"
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
  }

  // 3. If EXPO_PUBLIC_API_URL has a local Wi-Fi / LAN IP, prioritize it for physical devices
  const envUrl = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_SOCKET_URL;
  if (envUrl) {
    const match = envUrl.match(/https?:\/\/([^:/]+)/);
    if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1' && match[1] !== '10.0.2.2') {
      return match[1];
    }
  }

  // 4. Android emulator fallback when hostUri and env are missing
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

  // Web platform: connect to the host that served the web app (e.g. localhost or current machine IP)
  if (Platform.OS === 'web') {
    const host = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
    return `http://${host}:5000/api`;
  }

  // In local development on device, dynamically use the host machine's IP from Metro
  const resolvedHost = getResolvedHost();
  if (resolvedHost && resolvedHost !== 'localhost') {
    return `http://${resolvedHost}:5000/api`;
  }

  if (envUrl) {
    return envUrl;
  }

  return 'https://goride-khwe.onrender.com/api';
}

function getSocketUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (envUrl && envUrl.startsWith('https://')) {
    return envUrl;
  }

  // Web platform: connect to the host that served the web app
  if (Platform.OS === 'web') {
    const host = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
    return `http://${host}:5000`;
  }

  const resolvedHost = getResolvedHost();
  if (resolvedHost && resolvedHost !== 'localhost') {
    return `http://${resolvedHost}:5000`;
  }

  if (envUrl) {
    return envUrl;
  }

  return 'https://goride-khwe.onrender.com';
}

export const Config = {
  get API_BASE_URL(): string {
    return getApiBaseUrl();
  },
  get SOCKET_URL(): string {
    return getSocketUrl();
  },
  STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_51UClsuIviejFRg60X2aB7J8w3z5n7w9q8y',
  RAZORPAY_KEY_ID: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_Tjur4krJetR3z1',
  DRIVER_REQUEST_TIMEOUT_SECONDS: 30,
};

