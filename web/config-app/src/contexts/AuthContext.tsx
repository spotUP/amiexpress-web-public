import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient } from '../api/client';
import type { User } from '../types';

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
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [isLoading, setIsLoading] = useState(true);

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
    } catch (error: any) {
      // Only log out on explicit auth errors (401/403)
      // Keep user logged in on network errors (they may be temporary)
      const isAuthError = error.message?.includes('401') ||
                          error.message?.includes('403') ||
                          error.message?.includes('Access token') ||
                          error.message?.includes('Invalid') ||
                          error.message?.includes('expired');

      if (isAuthError) {
        console.log('[Auth] Token invalid, logging out');
        apiClient.logout();
        setUser(null);
        persistUser(null);
      } else {
        // Network error - keep stored user, try again later
        console.warn('[Auth] Network error during token refresh, keeping stored user:', error.message);
        const storedUser = readStoredUser();
        if (storedUser) {
          setUser(storedUser);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUserFromToken();
  }, [refreshUserFromToken]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'authToken') {
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

  const login = async (username: string, password: string) => {
    try {
      const data = await apiClient.login(username, password);
      if (data?.user) {
        setUser(data.user);
        persistUser(data.user);
      }
    } catch (error) {
      throw error;
    }
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
