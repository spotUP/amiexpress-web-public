import { useState, useCallback, useEffect } from 'react';
import { login as apiLogin, getToken, setUnauthorizedHandler } from '../api/client.js';

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

  // The one place that recognises an expired/invalid token, for every page
  // in the console — see client.ts's setUnauthorizedHandler doc comment.
  // Dropping `token` to null here is what makes index.tsx's Root swap back
  // to LoginPrompt (it renders App only while a token exists), unmounting
  // whatever page was open along with it.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState({ token: null, username: null, error: 'Session expired — please log in again.', loading: false });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

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
