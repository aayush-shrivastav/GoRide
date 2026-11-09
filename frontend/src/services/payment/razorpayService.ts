import { NativeModules, Platform } from 'react-native';

export interface RazorpayOptions {
  description?: string;
  image?: string;
  currency: string;
  key: string;
  amount: string | number;
  name: string;
  order_id: string;
  prefill?: {
    email?: string;
    contact?: string;
    name?: string;
  };
  theme?: {
    color?: string;
  };
}

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

let cachedRazorpayModule: any = null;

/**
 * Checks if native Razorpay module is installed (standalone APK / Dev Build).
 */
export function isRazorpayNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;

  try {
    return Boolean(
      NativeModules &&
        (NativeModules.RNRazorpayCheckout || NativeModules.RazorpayEventEmitter)
    );
  } catch {
    return false;
  }
}

/**
 * Checks if Razorpay is available in the current runtime (Native build or Web).
 */
export function isRazorpayAvailable(): boolean {
  if (Platform.OS === 'web') return true;
  return isRazorpayNativeAvailable();
}

/**
 * Safely loads native Razorpay module on mobile without Metro crashing on startup.
 */
function getRazorpayCheckout() {
  if (cachedRazorpayModule) return cachedRazorpayModule;
  if (!isRazorpayNativeAvailable()) return null;

  try {
    const mod = require('react-native-razorpay');
    cachedRazorpayModule = mod.default || mod;
    return cachedRazorpayModule;
  } catch (err) {
    console.warn('[Razorpay] Failed to load native Razorpay module:', err);
    return null;
  }
}

/**
 * Loads Razorpay script on Web browser if not already present.
 */
function loadWebRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as any).Razorpay) return resolve(true);

    const existingScript = document.getElementById('razorpay-checkout-js');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Opens Razorpay Checkout on either Web or Native.
 */
export async function openRazorpayCheckout(
  options: RazorpayOptions
): Promise<RazorpayResponse> {
  // ── Web path ──────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    const loaded = await loadWebRazorpayScript();
    if (!loaded || !(window as any).Razorpay) {
      throw new Error('Razorpay Web SDK could not be loaded. Check your internet connection.');
    }

    return new Promise((resolve, reject) => {
      const rzp = new (window as any).Razorpay({
        key: options.key,
        amount: options.amount,
        currency: options.currency || 'INR',
        name: options.name || 'GoRide',
        description: options.description || 'Trip Payment',
        order_id: options.order_id,
        prefill: options.prefill || {},
        theme: options.theme || { color: '#00D26A' },
        handler: (response: any) => {
          resolve({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id || options.order_id,
            razorpay_signature: response.razorpay_signature,
          });
        },
        modal: {
          ondismiss: () => {
            reject({ description: 'Payment checkout was closed by user' });
          },
        },
      });

      rzp.on('payment.failed', (resp: any) => {
        reject({
          description: resp?.error?.description || 'Payment failed',
          error: resp?.error,
        });
      });

      rzp.open();
    });
  }

  // ── Native mobile path ────────────────────────────────────────────────────
  const RazorpayCheckout = getRazorpayCheckout();

  if (!RazorpayCheckout) {
    throw new Error(
      'Razorpay native module is not available in Expo Go. Please use a Development Build or Test Mode.'
    );
  }

  return RazorpayCheckout.open(options);
}
