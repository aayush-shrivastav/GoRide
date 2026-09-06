import apiClient from './apiClient';
import { Notification } from '../../types/notification.types';

export interface NotificationsResponse {
  notifications: Notification[];
}

/**
 * GET /api/notifications
 * Returns all notifications for the authenticated user (passenger or driver).
 */
export async function getMyNotifications(): Promise<Notification[]> {
  const res = await apiClient.get('/notifications');
  // Backend returns data directly as array or object
  const data = res.data.data;
  if (Array.isArray(data)) return data as Notification[];
  if (data?.notifications) return data.notifications as Notification[];
  return [];
}

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read.
 */
export async function markAsRead(notificationId: string): Promise<void> {
  await apiClient.patch(`/notifications/${notificationId}/read`);
}
