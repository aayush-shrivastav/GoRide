export interface CreateOrderResponse {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId?: string;
}

export interface VerifyPaymentPayload {
  paymentId?: string;
  rideId?: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface Payment {
  _id: string;
  ride: string;
  passenger: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'failed';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  createdAt: string;
}

export interface PaymentOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export interface PaymentVerification {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
