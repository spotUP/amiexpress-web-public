/**
 * Subscribe THIS browser for the board's notifications (NOTIFY door, Enable push).
 *
 * The board asks over the socket (`notify:push-subscribe`, carrying its VAPID
 * public key); this registers the root-scope worker the board serves at
 * `/sw.js`, asks permission, subscribes, and returns what the board needs to
 * reach the browser. The answer goes back as `notify:push-subscription` and is
 * saved for the session's user; it carries no user id.
 *
 * Every browser object comes in through `env`, so the steps are testable
 * without a browser.
 */

export interface PushSubscriptionLike {
  toJSON(): { endpoint?: string; keys?: Record<string, string> };
  options?: { applicationServerKey?: ArrayBuffer | null };
  unsubscribe(): Promise<boolean>;
}

export interface PushEnv {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  requestPermission: () => Promise<'granted' | 'denied' | 'default'>;
  register: (url: string) => Promise<unknown>;
  /** Resolves with a registration whose worker is active. */
  ready: () => Promise<{ pushManager: {
    getSubscription(): Promise<PushSubscriptionLike | null>;
    subscribe(o: { userVisibleOnly: boolean; applicationServerKey: ArrayBuffer }): Promise<PushSubscriptionLike>;
  } }>;
  userAgent: string;
}

export type PushSubscribeResult =
  | { endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string }
  | { error: string };

export const ROOT_WORKER_URL = '/sw.js';

export function urlBase64ToBytes(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array): boolean => {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
};

export async function subscribeThisBrowser(publicKey: string, env: PushEnv): Promise<PushSubscribeResult> {
  if (!env.hasServiceWorker || !env.hasPushManager) return { error: 'this browser cannot receive push' };
  try {
    if ((await env.requestPermission()) !== 'granted') return { error: 'notifications are blocked in this browser' };
    await env.register(ROOT_WORKER_URL);
    const { pushManager } = await env.ready();
    const key = urlBase64ToBytes(publicKey);
    let sub = await pushManager.getSubscription();
    // A subscription made with another key (the board's keys changed) cannot be reused.
    if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: new Uint8Array(key).buffer as ArrayBuffer });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { error: 'the browser returned no subscription' };
    return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, userAgent: env.userAgent };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'subscribing failed' };
  }
}

/** The real browser's objects. */
export function browserPushEnv(): PushEnv {
  return {
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPushManager: typeof window !== 'undefined' && 'PushManager' in window && typeof Notification !== 'undefined',
    requestPermission: () => Notification.requestPermission(),
    register: (url) => navigator.serviceWorker.register(url),
    ready: () => navigator.serviceWorker.ready as unknown as ReturnType<PushEnv['ready']>,
    userAgent: navigator.userAgent,
  };
}
