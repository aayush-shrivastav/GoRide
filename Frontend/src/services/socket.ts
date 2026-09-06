import { io, Socket } from 'socket.io-client';
import { Config } from '../constants/config';

/**
 * Socket.io client singleton.
 *
 * Authentication:
 *   The backend's socketAuthMiddleware reads from socket.handshake.auth.token
 *   (or the accessToken cookie). We dynamically send the current access token
 *   via the auth callback.
 *
 * Token Refresh:
 *   When the access token is rotated via REST or expires during socket reconnection,
 *   updateToken() updates the credentials without dropping the socket unnecessarily.
 *   If an auth error is received, handleAuthError() requests a refreshed token
 *   via tokenRefreshHandler to reconnect smoothly.
 */

class SocketService {
  private socket: Socket | null = null;
  private currentToken: string | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private tokenRefreshHandler: (() => Promise<string | null>) | null = null;
  private isRefreshingToken = false;
  private refreshRetryCount = 0;
  private readonly MAX_AUTH_RETRIES = 3;

  /**
   * Registers the centralized token refresh handler (provided by apiClient).
   * Decouples socket service from HTTP client to prevent circular dependencies.
   */
  setTokenRefreshHandler(handler: () => Promise<string | null>): void {
    this.tokenRefreshHandler = handler;
  }

  connect(accessToken?: string): void {
    if (accessToken) {
      this.currentToken = accessToken;
    }

    // If already connected with the same token, do not reconnect unnecessarily
    if (this.socket?.connected) {
      return;
    }

    // If socket exists but is disconnected, clean up before re-creating
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(Config.SOCKET_URL, {
      auth: (cb) => {
        cb({ token: this.currentToken });
      },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    // Re-attach registered listeners to socket instance
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => {
        this.socket?.on(event, cb as any);
      });
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
      this.refreshRetryCount = 0; // Reset counter on successful connection
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', async (err: Error) => {
      console.warn('[Socket] Connection error:', err.message);

      const isAuthError =
        err.message.includes('token') ||
        err.message.includes('auth') ||
        err.message.includes('Authentication') ||
        err.message.includes('jwt');

      if (isAuthError) {
        await this.handleAuthError();
      }
    });
  }

  /**
   * Updates the access token used for socket authentication.
   * - Preserves the existing socket instance and listeners.
   * - If the socket was disconnected due to an auth failure, reconnects immediately.
   * - If already connected, sets the token for any subsequent reconnection.
   */
  updateToken(newToken: string): void {
    if (!newToken) return;

    const tokenChanged = this.currentToken !== newToken;
    this.currentToken = newToken;
    this.refreshRetryCount = 0;

    if (!this.socket) {
      this.connect(newToken);
      return;
    }

    // If the socket was disconnected or failed to connect, reconnect now with new token
    if (!this.socket.connected && tokenChanged) {
      console.log('[Socket] Reconnecting with refreshed token...');
      this.socket.connect();
    }
  }

  /**
   * Handles authentication errors (e.g. expired access token) during connection.
   * Calls the registered refresh handler and retries connection with the new token.
   * Prevents infinite loops via MAX_AUTH_RETRIES.
   */
  private async handleAuthError(): Promise<void> {
    if (this.isRefreshingToken) return;

    if (this.refreshRetryCount >= this.MAX_AUTH_RETRIES) {
      console.warn(
        '[Socket] Max auth refresh retries reached. Disconnecting to prevent reconnect loop.'
      );
      this.socket?.disconnect();
      return;
    }

    this.isRefreshingToken = true;
    this.refreshRetryCount += 1;

    try {
      console.log(
        `[Socket] Auth error encountered. Refreshing token (attempt ${this.refreshRetryCount}/${this.MAX_AUTH_RETRIES})...`
      );

      let newAccessToken: string | null = null;
      if (this.tokenRefreshHandler) {
        newAccessToken = await this.tokenRefreshHandler();
      }

      if (newAccessToken) {
        console.log('[Socket] Token refreshed successfully. Reconnecting socket...');
        this.updateToken(newAccessToken);
        if (!this.socket?.connected) {
          this.socket?.connect();
        }
      } else {
        console.warn('[Socket] Token refresh returned no token. Disconnecting socket.');
        this.socket?.disconnect();
      }
    } catch (err) {
      console.warn('[Socket] Token refresh failed during connect_error:', err);
      this.socket?.disconnect();
    } finally {
      this.isRefreshingToken = false;
    }
  }

  disconnect(): void {
    this.currentToken = null;
    this.refreshRetryCount = 0;
    this.isRefreshingToken = false;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  on<T>(event: string, callback: (data: T) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.on(event, callback as any);
    }
  }

  off<T>(event: string, callback?: (data: T) => void): void {
    if (callback) {
      this.listeners.get(event)?.delete(callback);
      this.socket?.off(event, callback as any);
    } else {
      this.listeners.delete(event);
      this.socket?.off(event);
    }
  }

  emit(event: string, data?: unknown): void {
    if (!this.socket?.connected) {
      console.warn(`[Socket] Cannot emit "${event}" — not connected`);
      return;
    }
    this.socket.emit(event, data);
  }

  // ── Driver-specific emitters (verified event names from driverSocket.js) ──

  emitDriverOnline(): void {
    this.emit('driver_online');
  }

  emitDriverOffline(): void {
    this.emit('driver_offline');
  }

  /**
   * Emits driver location update.
   * The backend throttles DB writes to once per 3s.
   * Only broadcasts to the passenger if rideId is provided and the ride is active.
   */
  emitLocationUpdate(latitude: number, longitude: number, rideId?: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('driver_location_update', { latitude, longitude, rideId });
  }
}

// Export a singleton instance
export const socketService = new SocketService();
