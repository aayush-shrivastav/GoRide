export const Config = {
  // 10.0.2.2 = Android Emulator loopback. For Expo Go on a real device, use your machine's LAN IP.
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://10.217.219.145:5000/api',
  SOCKET_URL: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://10.217.219.145:5000',
  RAZORPAY_KEY_ID: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_goridekey123',
  DRIVER_REQUEST_TIMEOUT_SECONDS: 30,
};
