import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Notification, NotificationSocketPayload } from '../types/notification.types';
import { socketService } from '../services/socket';
import { useAuth } from './AuthContext';
import * as notificationApi from '../services/api/notificationApi';

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllReadLocally: () => void;
  markAllAsRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await notificationApi.getMyNotifications();
      setNotifications(data);
    } catch {
      // Silently fail — non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => (n._id === id ? { ...n, isRead: true } : n)),
      );
    } catch {
      // Silently fail
    }
  }, []);

  const markAllReadLocally = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  // Fetch notifications on login
  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
    } else {
      setNotifications([]);
    }
  }, [isAuthenticated, fetchNotifications]);

  // Listen for real-time notification events
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleNotification = (payload: NotificationSocketPayload) => {
      const newNotification: Notification = {
        _id: payload.id,
        recipientId: '',
        recipientRole: 'passenger',
        type: payload.type,
        title: payload.title,
        message: payload.message,
        ride: payload.rideId,
        isRead: false,
        createdAt: payload.createdAt,
        updatedAt: payload.createdAt,
      };
      setNotifications(prev => [newNotification, ...prev]);
    };

    socketService.on<NotificationSocketPayload>('notification', handleNotification);

    return () => {
      socketService.off('notification', handleNotification);
    };
  }, [isAuthenticated]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        fetchNotifications,
        markRead,
        markAsRead: markRead,
        markAllReadLocally,
        markAllAsRead: markAllReadLocally,
      }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
