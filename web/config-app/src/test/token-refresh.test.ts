/**
 * An eight-hour access token must not end a seven-day session.
 *
 * Login hands the admin a refresh token good for seven days, `/auth/refresh`
 * has always existed on the backend, and nothing in the admin ever called it:
 * the first 401 logged the sysop out. Reported live on 2026-09-02 as
 * "/auth/me 403, [Auth] Token invalid, logging out" - the 403 was the same
 * expiry, since fixed to 401.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '../api/client';
import { ADMIN_TOKEN_KEY, ADMIN_REFRESH_TOKEN_KEY } from '../api/auth-token';

const json = (status: number, body: unknown) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
  text: async () => JSON.stringify(body),
} as unknown as Response);

beforeEach(() => {
  localStorage.clear();
  apiClient.setToken('stale-access');
  localStorage.setItem(ADMIN_REFRESH_TOKEN_KEY, 'good-refresh');
});

describe('a request that meets an expired token', () => {
  it('refreshes and retries, and the caller never sees the 401', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) return json(200, { accessToken: 'fresh-access' });
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return auth === 'Bearer fresh-access'
        ? json(200, { success: true, data: { ok: true } })
        : json(401, { error: 'Invalid or expired access token' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.get<{ ok: boolean }>('/api/config/system');

    expect(result.data).toEqual({ success: true, data: { ok: true } });
    expect(apiClient.getToken()).toBe('fresh-access');
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe('fresh-access');
  });

  it('refreshes once for a burst of requests, not once each', async () => {
    let refreshes = 0;
    let firstAttempts = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        refreshes += 1;
        return json(200, { accessToken: 'fresh-access' });
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth === 'Bearer fresh-access') return json(200, { ok: true });
      firstAttempts += 1;
      return json(401, { error: 'Invalid or expired access token' });
    }));

    await Promise.all([
      apiClient.get('/api/config/system'),
      apiClient.get('/api/config/conferences'),
      apiClient.get('/api/config/doors'),
    ]);

    expect(firstAttempts).toBe(3);
    expect(refreshes).toBe(1);
  });

  it('logs out when the refresh token is dead too', async () => {
    const loggedOut = vi.fn();
    const stop = apiClient.onUnauthorized(loggedOut);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) return json(401, { error: 'Invalid refresh token' });
      return json(401, { error: 'Invalid or expired access token' });
    }));

    await expect(apiClient.get('/api/config/system')).rejects.toThrow();

    expect(loggedOut).toHaveBeenCalled();
    expect(apiClient.getToken()).toBeNull();
    expect(localStorage.getItem(ADMIN_REFRESH_TOKEN_KEY)).toBeNull();
    stop();
  });

  it('does not try to refresh when it has no refresh token', async () => {
    localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY);
    const fetchMock = vi.fn((_input: RequestInfo | URL) =>
      json(401, { error: 'Invalid or expired access token' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/api/config/system')).rejects.toThrow();

    const askedToRefresh = fetchMock.mock.calls
      .some((call) => String(call[0]).includes('/auth/refresh'));
    expect(askedToRefresh).toBe(false);
  });
});

describe('logging in', () => {
  it('keeps the refresh token, which is the whole point of being given one', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, {
      accessToken: 'a-token', refreshToken: 'r-token', user: { username: 'sysop' },
    })));

    await apiClient.login('sysop', 'secret');

    expect(localStorage.getItem(ADMIN_REFRESH_TOKEN_KEY)).toBe('r-token');
  });

  it('drops both on logout', async () => {
    await apiClient.logout();

    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(ADMIN_REFRESH_TOKEN_KEY)).toBeNull();
  });
});
