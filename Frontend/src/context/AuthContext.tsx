import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Passenger, User, Driver } from '../types/auth.types';
import { Storage } from '../utils/storage';
import { socketService } from '../services/socket';
import * as authApi from '../services/api/authApi';
import * as driverApiModule from '../services/api/driverApi';
import { parseApiError } from '../utils/formatters';

type Role = 'passenger' | 'driver';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  role: Role | null;
  user: User | null;
  driver: Driver | null;
}

interface AuthContextValue extends AuthState {
  loginAsPassenger: (email: string, password: string) => Promise<void>;
  loginAsDriver: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  updateLocalUser: (data: Partial<User>) => void;
  updateLocalDriver: (data: Partial<Driver>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    role: null,
    user: null,
    driver: null,
  });

  // Restore session from stored tokens on app start
  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const tokens = await Storage.getTokens();
      const role = await Storage.getRole();

      if (!tokens || !role) {
        setState(s => ({ ...s, isLoading: false }));
        return;
      }

      // Connect socket with stored token
      socketService.connect(tokens.accessToken);

      if (role === 'passenger') {
        const res = await authApi.getMe();
        const user = (res as any).user || res;
        setState({
          isAuthenticated: true,
          isLoading: false,
          role: 'passenger',
          user,
          driver: null,
        });
      } else {
        const res = await driverApiModule.getDriverProfile();
        const driver = (res as any).driver || res;
        setState({
          isAuthenticated: true,
          isLoading: false,
          role: 'driver',
          user: null,
          driver,
        });
      }
    } catch (error: any) {
      // Network error ya server down hai toh session mat clear karo
      // Sirf actual auth errors (401/403) pe clear karo
      const status = error?.response?.status;
      const isAuthError = status === 401 || status === 403;

      if (isAuthError) {
        // Token genuinely invalid — session clear karo
        await Storage.clearAll();
        socketService.disconnect();
        setState({ isAuthenticated: false, isLoading: false, role: null, user: null, driver: null });
      } else {
        // Network issue — loading band karo lekin session mat haato
        setState(s => ({ ...s, isLoading: false }));
      }
    }
  };

  const loginAsPassenger = useCallback(async (email: string, password: string) => {
    const data = await authApi.loginPassenger({ email, password });
    const token = data.accessToken || data.data?.accessToken || '';
    const refresh = data.refreshToken || data.data?.refreshToken || '';
    const userObj = data.user || data.data?.user || null;
    await Storage.saveTokens({
      accessToken: token,
      refreshToken: refresh,
    });
    await Storage.saveRole('passenger');
    if (userObj) await Storage.saveUserData(userObj);
    if (token) socketService.connect(token);
    setState({
      isAuthenticated: true,
      isLoading: false,
      role: 'passenger',
      user: userObj as Passenger | null,
      driver: null,
    });
  }, []);

  const loginAsDriver = useCallback(async (email: string, password: string) => {
    const data = await driverApiModule.loginDriver({ email, password });
    const token = data.accessToken || data.data?.accessToken || '';
    const refresh = data.refreshToken || data.data?.refreshToken || '';
    const driverObj = data.driver || data.data?.driver || null;
    await Storage.saveTokens({
      accessToken: token,
      refreshToken: refresh,
    });
    await Storage.saveRole('driver');
    if (driverObj) await Storage.saveUserData(driverObj);
    if (token) socketService.connect(token);
    setState({
      isAuthenticated: true,
      isLoading: false,
      role: 'driver',
      user: null,
      driver: driverObj as Driver | null,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      if (state.role === 'passenger') {
        await authApi.logoutPassenger();
      } else if (state.role === 'driver') {
        await driverApiModule.logoutDriver();
      }
    } catch {
      // Ignore logout API errors — always clear local state
    }
    socketService.disconnect();
    await Storage.clearAll();
    setState({ isAuthenticated: false, isLoading: false, role: null, user: null, driver: null });
  }, [state.role]);

  const refreshCurrentUser = useCallback(async () => {
    try {
      if (state.role === 'passenger') {
        const res = await authApi.getMe();
        const user = (res as any).user || res;
        setState(s => ({ ...s, user }));
      } else if (state.role === 'driver') {
        const res = await driverApiModule.getDriverProfile();
        const driver = (res as any).driver || res;
        setState(s => ({ ...s, driver }));
      }
    } catch {
      // Silently fail
    }
  }, [state.role]);

  const updateLocalUser = useCallback((data: Partial<User>) => {
    setState(s => ({ ...s, user: s.user ? { ...s.user, ...data } : s.user }));
  }, []);

  const updateLocalDriver = useCallback((data: Partial<Driver>) => {
    setState(s => ({ ...s, driver: s.driver ? { ...s.driver, ...data } : s.driver }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loginAsPassenger,
        loginAsDriver,
        logout,
        refreshCurrentUser,
        updateLocalUser,
        updateLocalDriver,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
