/**
 * Switching the browser on subscribes through THIS app's worker, and mints a
 * new endpoint even when the browser already holds one.
 *
 * The board held a subscription created 2026-09-08 14:24:11. `/admin/sw.js`
 * did not exist on the server until 14:52:25 - `.gitignore`'s bare `public`
 * rule had swallowed `web/config-app/public/`, so the path 404'd for the whole
 * life of the feature - which means that subscription was minted against some
 * other worker in the profile. FCM answers 201 for it regardless, so every
 * page since reported `Sent to 1 subscriptions, 0 failed` and nothing was ever
 * drawn.
 *
 * Two rules follow, and both are asserted here:
 *
 *  1. subscribe through the registration for THIS app's worker, never
 *     whichever registration the profile happens to have first
 *  2. drop an existing subscription before subscribing, because a browser
 *     hands the old one back rather than minting a new endpoint - which is
 *     what makes "switch off and on again" a repair rather than a no-op
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const get = vi.fn(async () => ({ data: { enabled: true, publicKey: 'BFakeKeyForTests_' + 'A'.repeat(70) } }));
const post = vi.fn(async () => ({ data: {} }));

vi.mock('../api/client', () => ({
  apiClient: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), delete: vi.fn() },
}));

const staleUnsubscribe = vi.fn(async () => true);

/** A subscription the browser is already holding, from another worker's day. */
const stale = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/OLD-cRd5VQ769jQ',
  unsubscribe: staleUnsubscribe,
  toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/OLD-cRd5VQ769jQ', keys: { p256dh: 'p', auth: 'a' } }),
};

const fresh = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/NEW-endpoint01',
  unsubscribe: vi.fn(async () => true),
  toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/NEW-endpoint01', keys: { p256dh: 'p2', auth: 'a2' } }),
};

const subscribe = vi.fn(async () => fresh);
const getSubscription = vi.fn(async () => stale as unknown);

const adminRegistration = {
  scope: 'https://board.example/admin/',
  active: {},
  pushManager: { subscribe, getSubscription },
};

/** Some other worker in the profile - the one that must NOT be used. */
const rootRegistration = {
  scope: 'https://board.example/',
  active: {},
  pushManager: { subscribe: vi.fn(), getSubscription: vi.fn(async () => null) },
};

const getRegistration = vi.fn(async (url?: string) =>
  url ? (adminRegistration as unknown as ServiceWorkerRegistration) : (rootRegistration as unknown as ServiceWorkerRegistration)
);

beforeEach(() => {
  vi.clearAllMocks();
  getSubscription.mockResolvedValue(stale as unknown);
  subscribe.mockResolvedValue(fresh);

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        getRegistration,
        register: vi.fn(async () => adminRegistration as unknown as ServiceWorkerRegistration),
        ready: Promise.resolve(adminRegistration as unknown as ServiceWorkerRegistration),
      },
    },
  });
  (globalThis as unknown as { PushManager: unknown }).PushManager = function () {};
  (globalThis as unknown as { Notification: unknown }).Notification = {
    permission: 'granted',
    requestPermission: vi.fn(async () => 'granted'),
  };
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { atob: unknown }).atob = (value: string) =>
    Buffer.from(value, 'base64').toString('binary');
});

const { usePushNotifications } = await import('../hooks/usePushNotifications');

describe('switching this browser on', () => {
  it('drops the subscription the browser was holding, and sends the new endpoint to the board', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.subscribe(); });

    // 2. the old one goes first, or the browser hands it straight back
    expect(staleUnsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();

    const sent = post.mock.calls.find(([url]) => url === '/api/config/push/subscribe');
    expect(sent).toBeDefined();
    expect((sent![1] as any).subscription.endpoint).toBe(fresh.endpoint);
  });

  it("asks for THIS app's worker by URL, not for whatever the profile has", async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.subscribe(); });

    // A subscription minted at another scope never receives what /admin/sw.js
    // is sent, and the board cannot tell the difference.
    const asked = getRegistration.mock.calls.filter(([url]) => typeof url === 'string');
    expect(asked.length).toBeGreaterThan(0);
    expect(String(asked[asked.length - 1][0])).toContain('sw.js');
  });

  it('reports the new endpoint back to the page, so the tails can be compared', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.subscribe(); });

    expect(result.current.diagnostics.endpointTail).toBe(fresh.endpoint.slice(-12));
    expect(result.current.diagnostics.hasBrowserSubscription).toBe(true);
  });
});
