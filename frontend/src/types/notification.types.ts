export interface Notification {
  _id: string;
  recipient?: string;
  recipientId?: string;
  recipientRole?: 'passenger' | 'driver';
  role?: 'passenger' | 'driver';
  type?: string;
  title: string;
  body?: string;
  message?: string;
  data?: any;
  ride?: string;
  read?: boolean;
  isRead?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface NotificationSocketPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  rideId?: string;
  createdAt: string;
}
