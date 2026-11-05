/**
 * "i cant send a test desktop notification in the admin ui".
 *
 * Pressing it did nothing at all, and could not have: the hook returned early
 * when the browser had no push SUBSCRIPTION (a different question from whether
 * it can draw a notification), returned early again when there was no service
 * worker registration, and swallowed every throw - the page calls it as
 * `void testNotification()`, so a rejection went to the console at best.
 *
 * A button that cannot report its own failure is worse than no button.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const shown: Array<{ title: string }> = [];

function browser(options: { permission: NotificationPermission; registration?: unknown }) {
  const registration = options.registration ?? {
    pushManager: { getSubscription: async () => null },
    showNotification: async (title: string) => { shown.push({ title }); },
  };
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true, writable: true,
    value: {
      ready: new Promise<never>(() => {}),
      getRegistration: vi.fn(async () => registration),
      register: vi.fn(async () => registration),
    },
  });
  (globalThis as unknown as { PushManager: unknown }).PushManager = class {};
  (globalThis as unknown as { Notification: unknown }).Notification = {
    permission: options.permission,
    requestPermission: async () => options.permission,
  };
}

vi.mock('../src/api/client', () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { enabled: true, publicKey: 'BKxQ_test' } })),
    post: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  },
}));

import { usePushNotifications } from '../src/hooks/usePushNotifications';

describe('the test notification', () => {
  beforeEach(() => { shown.length = 0; vi.clearAllMocks(); });

  it('draws one even when this browser has no subscription yet', async () => {
    browser({ permission: 'granted' });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Not subscribed - the old code returned here and did nothing.
    expect(result.current.isSubscribed).toBe(false);

    let answer: boolean | undefined;
    await act(async () => { answer = await result.current.testNotification(); });

    expect(answer).toBe(true);
    expect(shown.map(n => n.title)).toEqual(['AmiExpress']);
  });

  it('says why when the browser refuses, instead of failing silently', async () => {
    browser({ permission: 'denied' });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let answer: boolean | undefined;
    await act(async () => { answer = await result.current.testNotification(); });

    expect(answer).toBe(false);
    expect(shown).toHaveLength(0);
    expect(result.current.error).toMatch(/blocking notifications/i);
  });

  it('says so when there is no worker to draw with', async () => {
    browser({ permission: 'granted', registration: null });
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      configurable: true, writable: true,
      value: {
        ready: new Promise<never>(() => {}),
        getRegistration: vi.fn(async () => undefined),
        register: vi.fn(async () => { throw new Error('404'); }),
      },
    });

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let answer: boolean | undefined;
    await act(async () => { answer = await result.current.testNotification(); });

    expect(answer).toBe(false);
    expect(result.current.error).toMatch(/service worker could not be registered/i);
  });
});
