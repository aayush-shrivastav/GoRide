import axios from 'axios';
import { Storage } from '../../utils/storage';
import { Config } from '../../constants/config';
import { socketService } from '../socket';

export const apiClient = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Refresh lock: only one refresh call in-flight at any time to prevent race conditions
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

/**
 * Shared, centralized token refresh mechanism.
 * Used by both HTTP response interceptor (on 401) and SocketService (on auth failure).
 */
export async function refreshAuthTokens(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;

  try {
    const tokens = await Storage.getTokens();
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const res = await axios.post(`${Config.API_BASE_URL}/auth/refresh`, {
      refreshToken: tokens.refreshToken,
    });

    // Backend format: { success, message, data: { accessToken, refreshToken } }
    const resData = res.data.data || res.data;
    const newTokens = {
      accessToken: resData.accessToken,
      refreshToken: resData.refreshToken,
    };

    await Storage.saveTokens(newTokens);

    // Immediately update socket service with the latest rotated token
    socketService.updateToken(newTokens.accessToken);

    // Resolve all queued requests
    processQueue(null, newTokens.accessToken);

    return newTokens.accessToken;
  } catch (refreshError) {
    processQueue(refreshError, null);
    await Storage.removeTokens();
    await Storage.removeRole();
    await Storage.removeUserData();
    socketService.disconnect();
    throw refreshError;
  } finally {
    isRefreshing = false;
  }
}

// Hook SocketService into the centralized token refresh handler
socketService.setTokenRefreshHandler(refreshAuthTokens);

apiClient.interceptors.request.use(
  async (config) => {
    config.baseURL = Config.API_BASE_URL;
    const tokens = await Storage.getTokens();
    if (tokens?.accessToken) {
      config.headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Auth endpoints that should NEVER trigger a token refresh on 401.
// A 401 from /auth/login or /auth/register means bad credentials — not an expired token.
const AUTH_ENDPOINTS_NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/drivers/login', '/drivers/register'];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl: string = originalRequest?.url || '';

    // Skip refresh for auth endpoints — their 401s are real credential errors
    const isAuthEndpoint = AUTH_ENDPOINTS_NO_REFRESH.some(ep => requestUrl.includes(ep));

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const newAccessToken = await refreshAuthTokens();
        if (!newAccessToken) throw new Error('Token refresh failed');
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
