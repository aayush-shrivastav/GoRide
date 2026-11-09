import apiClient from './apiClient';
import {
  CreateOrderResponse,
  VerifyPaymentPayload,
  Payment,
} from '../../types/payment.types';

/**
 * POST /api/payments/create-order
 * Creates a Razorpay order for the given ride. Returns the orderId, amount
 * (in paise), currency, and our internal paymentId.
 * Backend is idempotent — calling again for the same ride reuses the existing order.
 */
export async function createOrder(rideId: string): Promise<CreateOrderResponse> {
  const res = await apiClient.post('/payments/create-order', { rideId });
  return res.data.data as CreateOrderResponse;
}

/**
 * POST /api/payments/verify
 * Sends Razorpay's payment response to the backend for HMAC signature verification.
 * Backend marks payment SUCCESS only after signature validation.
 * Frontend MUST NOT mark payment as successful without this backend confirmation.
 */
export async function verifyPayment(
  payload: VerifyPaymentPayload,
): Promise<Payment> {
  const res = await apiClient.post('/payments/verify', payload);
  return res.data.data.payment as Payment;
}

/**
 * GET /api/payments/:paymentId
 * Fetches a specific payment record.
 */
export async function getPayment(paymentId: string): Promise<Payment> {
  const res = await apiClient.get(`/payments/${paymentId}`);
  return res.data.data.payment as Payment;
}
