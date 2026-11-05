/**
 * Enable push, browser half: what the web terminal does when the board sends
 * `notify:push-subscribe`.
 */
import { describe, it, expect, vi } from 'vitest';
import { subscribeThisBrowser, ROOT_WORKER_URL, urlBase64ToBytes } from '../../../packages/terminal/src/utils/push-subscribe';
import type { PushEnv, PushSubscriptionLike } from '../../../packages/terminal/src/utils/push-subscribe';

const KEY = 'REDACTED';
const sub = (endpoint = 'https://push.example/abc', key: Uint8Array = urlBase64ToBytes(KEY)): PushSubscriptionLike => ({
  toJSON: () => ({ endpoint, keys: { p256dh: 'pp', auth: 'aa' } }),
  options: { applicationServerKey: new Uint8Array(key).buffer as ArrayBuffer },
  unsubscribe: vi.fn().mockResolvedValue(true),
});

function env(over: Partial<PushEnv> & { existing?: PushSubscriptionLike | null; created?: PushSubscriptionLike } = {}) {
  const subscribe = vi.fn().mockResolvedValue(over.created ?? sub());
  const e: PushEnv = {
    hasServiceWorker: true, hasPushManager: true,
    requestPermission: vi.fn().mockResolvedValue('granted'),
    register: vi.fn().mockResolvedValue({}),
    ready: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(over.existing ?? null), subscribe } }),
    userAgent: 'UA',
    ...over,
  };
  return { e, subscribe };
}

describe('Enable push in the web terminal', () => {
  it('registers the root worker, subscribes with the board key and returns the endpoint and keys', async () => {
    const { e, subscribe } = env();
    const r = await subscribeThisBrowser(KEY, e);
    expect(e.register).toHaveBeenCalledWith(ROOT_WORKER_URL);
    expect(ROOT_WORKER_URL).toBe('/sw.js');
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ endpoint: 'https://push.example/abc', keys: { p256dh: 'pp', auth: 'aa' }, userAgent: 'UA' });
  });

  it('reuses a subscription made with the same key and replaces one made with another', async () => {
    const same = env({ existing: sub('https://push.example/old') });
    expect(await subscribeThisBrowser(KEY, same.e)).toMatchObject({ endpoint: 'https://push.example/old' });
    expect(same.subscribe).not.toHaveBeenCalled();

    const stale = sub('https://push.example/stale', new Uint8Array([1, 2, 3]));
    const other = env({ existing: stale });
    await subscribeThisBrowser(KEY, other.e);
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(other.subscribe).toHaveBeenCalledTimes(1);
  });

  it('answers with an error, not a throw, when permission is refused or the browser cannot push', async () => {
    expect(await subscribeThisBrowser(KEY, env({ requestPermission: vi.fn().mockResolvedValue('denied') }).e)).toEqual({ error: 'notifications are blocked in this browser' });
    expect(await subscribeThisBrowser(KEY, env({ hasPushManager: false }).e)).toEqual({ error: 'this browser cannot receive push' });
    const boom = env({ register: vi.fn().mockRejectedValue(new Error('worker 404')) });
    expect(await subscribeThisBrowser(KEY, boom.e)).toEqual({ error: 'worker 404' });
  });
});
