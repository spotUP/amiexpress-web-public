import { useState, useCallback } from 'react';
import { login as apiLogin, getToken } from '../api/client.js';

export interface AuthState {
  token: string | null;
  username: string | null;
  error: string | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    token: getToken(),
    username: null,
    error: null,
    loading: false,
  });

  const login = useCallback(async (username: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiLogin(username, password);
      setState({ token: res.token, username: res.user.username, error: null, loading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setState(s => ({ ...s, error: msg, loading: false }));
    }
  }, []);

  return { ...state, login };
}
