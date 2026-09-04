import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient } from '../api/client';
import type { User } from '../types';
import { ADMIN_TOKEN_KEY } from '../api/auth-token';

const AUTH_USER_STORAGE_KEY = 'amiexpress-config-user';

const readStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(AUTH_USER_STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as User;
  } catch (error) {
    console.warn('Unable to parse stored config user', error);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return null;
  }
};

const persistUser = (user: User | null) => {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  secLevel: number;
  adminPerms: Record<string, number>;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<User | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [isLoading, setIsLoading] = useState(true);
  const [adminPerms, setAdminPerms] = useState<Record<string, number>>({});

  const loadPerms = useCallback(async () => {
    try {
      const data = await apiClient.getAdminPermissions();
      if (data?.perms) setAdminPerms(data.perms);
    } catch (e: any) {
      console.log('[Auth] Admin perms not available:', e?.message || '403 - using defaults');
    }
  }, []);

  const refreshUserFromToken = useCallback(async () => {
    const token = apiClient.getToken();
    if (!token) {
      setUser(null);
      persistUser(null);
      setIsLoading(false);
      return;
    }

    apiClient.setToken(token);

    try {
      const { user: fetched } = await apiClient.me();
      setUser(fetched);
      persistUser(fetched);
      // Load admin permissions after confirming auth
      await loadPerms();
    } catch (error: any) {
      const isAuthError = error.message?.includes('401') ||
                          error.message?.includes('403') ||
                          error.message?.includes('404') ||
                          error.message?.includes('User not found') ||
                          error.message?.includes('Access token') ||
                          error.message?.includes('Invalid') ||
                          error.message?.includes('expired');

      if (isAuthError) {
        console.log('[Auth] Token invalid, logging out');
        apiClient.logout();
        setUser(null);
        persistUser(null);
      } else {
        console.warn('[Auth] Network error during token refresh, keeping stored user:', error.message);
        const storedUser = readStoredUser();
        if (storedUser) {
          setUser(storedUser);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [loadPerms]);

  useEffect(() => {
    refreshUserFromToken();
  }, [refreshUserFromToken]);

  /**
   * A 401 from ANY request ends the session.
   *
   * The token was validated once, at mount, and never again - so an expired
   * session presented as a working admin with nothing in it: apiClient throws
   * on a non-2xx, `data` came back undefined, and eighteen pages rendered
   * their empty copy as a positive claim.
   */
  useEffect(() => {
    return apiClient.onUnauthorized(() => {
      setUser(null);
      persistUser(null);
    });
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ADMIN_TOKEN_KEY) {
        return;
      }
      // If token cleared, log out locally; otherwise refresh user info
    if (!event.newValue) {
      apiClient.logout();
      setUser(null);
      persistUser(null);
      return;
    }
    apiClient.setToken(event.newValue);
    refreshUserFromToken();
  };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshUserFromToken]);

  const login = async (username: string, password: string, rememberMe = false) => {
    const data = await apiClient.login(username, password, rememberMe);
    if (data?.user) {
      setUser(data.user);
      persistUser(data.user);
      // Load permissions immediately after login so the sidebar is correct on first render
      await loadPerms();
    }
    return data?.user ?? null;
  };

  const logout = () => {
    apiClient.logout();
    persistUser(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        secLevel: user?.secLevel ?? 0,
        adminPerms,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
