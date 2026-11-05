/**
 * The switch has to appear on a browser that has never registered the worker.
 *
 * That is EVERY browser on this board: `web/config-app/public/sw.js` was
 * gitignored by a bare `public` rule, so it never reached the image and
 * `/admin/sw.js` answered 404. On top of that the hook awaited
 * `navigator.serviceWorker.ready`, which - with nothing registered - never
 * resolves, never rejects and never times out. The hook stayed at
 * `loading: true, isSupported: false`, so the header's "Desktop notifications
 * off" button (rendered only when `isSupported`) could not appear, and the
 * only code that registered the worker sat behind that button.
 *
 * The sysop, having looked for it twice: "do i need to screenshot to prove
 * that there is no switch visible in the header or operator settings?"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const registered: string[] = [];

/** A browser that supports push and has NO registration - the first visit. */
function browserWithNoWorker() {
  const serviceWorker = {
    // The trap, exactly as a real browser behaves: never settles.
    ready: new Promise<never>(() => {}),
    getRegistration: vi.fn(async () => undefined),
    register: vi.fn(async (url: string) => {
      registered.push(url);
      return { pushManager: { getSubscription: async () => null, subscribe: vi.fn() } };
    }),
  };
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    value: serviceWorker, configurable: true, writable: true,
  });
  (globalThis as unknown as { PushManager: unknown }).PushManager = class {};
  (globalThis as unknown as { Notification: unknown }).Notification = {
    permission: 'default', requestPermission: async () => 'granted',
  };
  return serviceWorker;
}

vi.mock('../src/api/client', () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { enabled: true, publicKey: 'BKxQ_test_key' } })),
    post: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  },
}));

import { usePushNotifications } from '../src/hooks/usePushNotifications';

describe('a browser that has never registered the worker', () => {
  beforeEach(() => { registered.length = 0; vi.clearAllMocks(); });
  afterEach(() => {
    Reflect.deleteProperty(globalThis.navigator, 'serviceWorker');
  });

  it('finishes its check instead of waiting for a worker that will never come', async () => {
    browserWithNoWorker();

    const { result } = renderHook(() => usePushNotifications());

    // Red before the fix: `loading` stays true for ever and `isSupported`
    // stays false, which is precisely "no switch in the header".
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });
    expect(result.current.isSupported).toBe(true);
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.permission).toBe('default');
  });

  it('registers the worker under the admin base, not at the site root', async () => {
    browserWithNoWorker();

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });

    await result.current.registerServiceWorker();

    // `/sw.js` is a 404: the admin is served under vite's base.
    expect(registered).toHaveLength(1);
    expect(registered[0]).toBe(`${import.meta.env.BASE_URL}sw.js`);
    expect(registered[0].endsWith('/sw.js')).toBe(true);
    expect(registered[0]).not.toBe('/sw.js');
  });
});
