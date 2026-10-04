import { io, Socket } from 'socket.io-client';

import { Config } from '../constants/config';

type SocketCallback<T = unknown> = (data: T) => void;

class SocketService {
  private socket: Socket | null = null;

  private currentToken: string | null = null;

  private listeners: Map<string, Set<Function>> = new Map();

  private tokenRefreshHandler:
    (() => Promise<string | null>) | null = null;

  private isRefreshingToken = false;

  private refreshRetryCount = 0;

  private readonly MAX_AUTH_RETRIES = 3;

  /**
   * Register token refresh handler.
   *
   * Usually provided by apiClient/AuthContext.
   */
  setTokenRefreshHandler(
    handler: () => Promise<string | null>
  ): void {
    this.tokenRefreshHandler = handler;
  }

  /**
   * Connect Socket.IO using current access token.
   */
  connect(accessToken?: string): void {
    if (accessToken) {
      this.currentToken = accessToken;
    }

    if (!this.currentToken) {
      console.warn(
        '[Socket] Cannot connect without access token'
      );
      return;
    }

    /*
     * Already connected.
     */
    if (this.socket?.connected) {
      return;
    }

    /*
     * If a stale socket exists, clean it up.
     */
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(Config.SOCKET_URL, {
      auth: (cb) => {
        cb({
          token: this.currentToken,
        });
      },

      /*
       * Prefer websocket first, then fallback to polling.
       */
      transports: ['websocket', 'polling'],

      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    /*
     * Re-attach all registered application listeners.
     */
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((callback) => {
        this.socket?.on(
          event,
          callback as (...args: any[]) => void
        );
      });
    });

    /*
     * Connection established.
     */
    this.socket.on('connect', () => {
      console.log(
        '[Socket] Connected:',
        this.socket?.id
      );

      this.refreshRetryCount = 0;
    });

    /*
     * Socket disconnected.
     *
     * Do not treat this as driver_offline.
     */
    this.socket.on('disconnect', (reason) => {
      console.log(
        '[Socket] Disconnected:',
        reason
      );
    });

    /*
     * Authentication / connection error.
     */
    this.socket.on(
      'connect_error',
      async (err: Error) => {
        const message =
          err?.message?.toLowerCase?.() || '';

        const isAuthError =
          message.includes('token') ||
          message.includes('auth') ||
          message.includes('authentication') ||
          message.includes('jwt') ||
          message.includes('unauthorized');

        if (isAuthError) {
          console.log(
            '[Socket] Authentication error. Refreshing token...'
          );

          await this.handleAuthError();
          return;
        }

        console.warn(
          '[Socket] Connection error:',
          err.message
        );
      }
    );
  }

  /**
   * Update access token.
   */
  updateToken(newToken: string): void {
    if (!newToken) {
      return;
    }

    const tokenChanged =
      this.currentToken !== newToken;

    this.currentToken = newToken;

    this.refreshRetryCount = 0;

    /*
     * No socket exists yet.
     */
    if (!this.socket) {
      this.connect(newToken);
      return;
    }

    /*
     * If socket is disconnected and token changed,
     * reconnect using the new token.
     */
    if (!this.socket.connected && tokenChanged) {
      console.log(
        '[Socket] Reconnecting with refreshed token...'
      );

      this.socket.connect();
    }
  }

  /**
   * Handle socket authentication failure.
   */
  private async handleAuthError(): Promise<void> {
    if (this.isRefreshingToken) {
      return;
    }

    if (
      this.refreshRetryCount >=
      this.MAX_AUTH_RETRIES
    ) {
      console.warn(
        '[Socket] Maximum authentication retries reached.'
      );

      this.socket?.disconnect();

      return;
    }

    if (!this.tokenRefreshHandler) {
      console.warn(
        '[Socket] No token refresh handler registered.'
      );

      this.socket?.disconnect();

      return;
    }

    this.isRefreshingToken = true;
    this.refreshRetryCount += 1;

    try {
      console.log(
        `[Socket] Refreshing token attempt ${this.refreshRetryCount}/${this.MAX_AUTH_RETRIES}`
      );

      const newAccessToken =
        await this.tokenRefreshHandler();

      if (!newAccessToken) {
        console.warn(
          '[Socket] Token refresh returned no token.'
        );

        this.socket?.disconnect();

        return;
      }

      this.currentToken = newAccessToken;

      console.log(
        '[Socket] Token refreshed. Reconnecting...'
      );

      /*
       * Force a fresh handshake so the new token
       * is sent through auth callback.
       */
      this.socket?.disconnect();
      this.socket?.connect();
    } catch (err) {
      console.warn(
        '[Socket] Token refresh failed:',
        err
      );

      this.socket?.disconnect();
    } finally {
      this.isRefreshingToken = false;
    }
  }

  /**
   * Completely disconnect socket and clear token.
   */
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

  /**
   * Generic event listener.
   */
  on<T>(
    event: string,
    callback: SocketCallback<T>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(
        event,
        new Set()
      );
    }

    this.listeners
      .get(event)!
      .add(callback);

    if (this.socket) {
      this.socket.on(
        event,
        callback as (...args: any[]) => void
      );
    }
  }

  /**
   * Remove event listener.
   */
  off<T>(
    event: string,
    callback?: SocketCallback<T>
  ): void {
    if (callback) {
      this.listeners
        .get(event)
        ?.delete(callback);

      this.socket?.off(
        event,
        callback as (...args: any[]) => void
      );

      return;
    }

    this.listeners.delete(event);

    this.socket?.off(event);
  }

  /**
   * Emit event to backend.
   */
  emit(
    event: string,
    data?: unknown
  ): void {
    if (!this.socket?.connected) {
      console.warn(
        `[Socket] Cannot emit "${event}" — socket not connected`
      );

      return;
    }

    if (data === undefined) {
      this.socket.emit(event);
    } else {
      this.socket.emit(event, data);
    }
  }

  // ============================================================
  // DRIVER EVENTS
  // ============================================================

  emitDriverOnline(): void {
    this.emit('driver_online');
  }

  emitDriverOffline(): void {
    this.emit('driver_offline');
  }

  emitLocationUpdate(
    latitude: number,
    longitude: number,
    rideId?: string
  ): void {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit(
      'driver_location_update',
      {
        latitude,
        longitude,
        rideId,
      }
    );
  }

  /**
   * Listen for incoming ride requests.
   *
   * Backend:
   * io.to(`driver:${driverId}`)
   *   .emit('ride_request', payload)
   */
  onRideRequest<T = unknown>(
    callback: SocketCallback<T>
  ): void {
    this.on<T>(
      'ride_request',
      callback
    );
  }

  offRideRequest<T = unknown>(
    callback?: SocketCallback<T>
  ): void {
    this.off<T>(
      'ride_request',
      callback
    );
  }

  /**
   * Listen for driver location updates.
   */
  onDriverLocationUpdate<T = unknown>(
    callback: SocketCallback<T>
  ): void {
    this.on<T>(
      'driver_location_update',
      callback
    );
  }

  offDriverLocationUpdate<T = unknown>(
    callback?: SocketCallback<T>
  ): void {
    this.off<T>(
      'driver_location_update',
      callback
    );
  }

  /**
   * Listen for notification events.
   */
  onNotification<T = unknown>(
    callback: SocketCallback<T>
  ): void {
    this.on<T>(
      'notification',
      callback
    );
  }

  offNotification<T = unknown>(
    callback?: SocketCallback<T>
  ): void {
    this.off<T>(
      'notification',
      callback
    );
  }
}

/*
 * Singleton instance.
 */
export const socketService =
  new SocketService();