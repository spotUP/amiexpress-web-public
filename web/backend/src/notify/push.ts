/**
 * The Push channel: the sender the dispatcher calls, and the socket round trip
 * that gets a caller's browser subscribed.
 *
 * Sending reuses the board's one web-push path (utils/web-push.util.ts,
 * `sendPushNotifications`, the same call the sysop page makes) against the
 * caller's rows of `operator_push_subscriptions` with purpose = 'notify'.
 * Only a 404/410 from the push service removes a row: that is the push service
 * saying the browser is gone. Any other failure is a passing outage and the
 * outbox retries it.
 *
 * Content rules live here, like email.ts: `mail.private` carries its title
 * only (sysop decision 4); a digest is ONE push. Decision 6 (a caller who is
 * logged on is not pushed) is the dispatcher's, for every outbound channel.
 *
 * Subscribing. `enablePush()` emits `notify:push-subscribe` with the VAPID public
 * key to the caller's own socket; the web terminal registers the worker,
 * subscribes, and answers `notify:push-subscription`. The backend accepts that
 * answer ONLY while a request from this session is waiting (the browser cannot
 * volunteer an endpoint: the board will POST to it), and saves it for the
 * SESSION's user id - the payload carries no user.
 */
import type Database from 'better-sqlite3';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';
import { db } from '../database';
import { adminBaseUrl } from '../utils/admin-base-url.util';
import { getVapidPublicKey, isWebPushEnabled, sendPushNotifications } from '../utils/web-push.util';
import type { PushNotificationPayload } from '../utils/web-push.util';
import type { ChannelSender } from './dispatcher';
import { PRIVATE_MAIL_EVENT } from './email';
import { notifyPushOf, removeNotifyPushEndpoint, saveNotifyPush } from './repository';

const LINE_MAX = 200;
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, LINE_MAX);

export interface PushDeps {
  rawDb: () => Database.Database | undefined;
  enabled: () => boolean;
  send: typeof sendPushNotifications;
  /** The board's web address: where a tapped notification opens. */
  baseUrl: () => string;
}

export const productionPushDeps = (): PushDeps => ({
  rawDb: () => (db as any).db as Database.Database | undefined,
  enabled: isWebPushEnabled,
  send: sendPushNotifications,
  baseUrl: adminBaseUrl,
});

export function buildPushPayload(items: readonly NotifyItem[], digest: boolean, baseUrl: string): PushNotificationPayload {
  const base = {
    icon: '/admin/icon.svg',
    badge: '/admin/icon.svg',
    // An empty list: the worker would otherwise add the sysop page's Respond / Dismiss buttons.
    actions: [] as PushNotificationPayload['actions'],
  };
  if (!digest && items.length === 1) {
    const it = items[0];
    return {
      ...base,
      title: oneLine(it.title),
      body: it.event === PRIVATE_MAIL_EVENT ? '' : oneLine(it.body),
      tag: `notify-${it.objectId}`,
      data: { type: 'notify', url: baseUrl },
    };
  }
  return {
    ...base,
    title: `${items.length} notification${items.length === 1 ? '' : 's'}`,
    body: oneLine(items.map((i) => i.title).join('; ')),
    tag: 'notify-digest',
    data: { type: 'notify', url: baseUrl },
  };
}

export function makePushSender(deps: PushDeps): ChannelSender {
  return async (userId, items, digest) => {
    const raw = deps.rawDb();
    if (!raw) return { ok: false, error: 'no database', retry: true };
    if (!deps.enabled()) return { ok: false, error: 'the board has no VAPID keys', retry: true };
    const rows = notifyPushOf(raw, userId);
    if (rows.length === 0) return { ok: false, error: 'no subscribed browser', retry: true };
    const results = await deps.send(rows, buildPushPayload(items, digest, deps.baseUrl()));
    for (const r of results) if (r.gone) removeNotifyPushEndpoint(raw, r.subscription.endpoint);
    if (results.some((r) => r.success)) return { ok: true };
    return { ok: false, error: results.every((r) => r.gone) ? 'every subscribed browser has expired' : 'the push service refused', retry: true };
  };
}

export const productionPushSender = (): ChannelSender => makePushSender(productionPushDeps());

// ------------------------------------------------------------ the subscribe round trip

/** Events: server -> browser `notify:push-subscribe` (above), browser -> server `notify:push-subscription` (socket.ts). */
/** The browser may be showing a permission prompt; a minute is a person deciding. */
export const SUBSCRIBE_TIMEOUT_MS = 60_000;

type Outcome = { ok: true; detail: string } | { ok: false; error: string };
interface Waiting { settle: (o: Outcome) => void; timer: ReturnType<typeof setTimeout> }

/** One pending request per session, keyed by the session object itself. */
const waiting = new WeakMap<object, Waiting>();

/**
 * A push endpoint is a URL the board will POST to, so it is checked: https, a
 * host name (not an IP literal), nothing local. The push services (FCM, Mozilla,
 * Windows, Apple) are all public https names.
 */
export function validEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^[\d.]+$/.test(h) || h.includes(':')) return false;
  return h.includes('.');
}

const KEY_RE = /^[A-Za-z0-9_-]{8,256}={0,2}$/;

/** Ask the session's browser to subscribe. Resolves when it answers, refuses, or times out. */
export function requestPushSubscription(
  session: object,
  socket: { emit: (event: string, payload: unknown) => unknown },
  deps: Pick<PushDeps, 'enabled'> & { vapidKey: () => string | null; timeoutMs?: number },
): Promise<Outcome> {
  const key = deps.enabled() ? deps.vapidKey() : null;
  if (!key) return Promise.resolve({ ok: false, error: 'push is not set up on this board' });
  return new Promise<Outcome>((resolve) => {
    waiting.get(session)?.settle({ ok: false, error: 'a newer request replaced this one' });
    const settle = (o: Outcome): void => {
      clearTimeout(entry.timer);
      if (waiting.get(session) === entry) waiting.delete(session);
      resolve(o);
    };
    const entry: Waiting = {
      settle,
      timer: setTimeout(() => settle({ ok: false, error: 'the browser did not answer' }), deps.timeoutMs ?? SUBSCRIBE_TIMEOUT_MS),
    };
    waiting.set(session, entry);
    socket.emit('notify:push-subscribe', { publicKey: key });
  });
}

/**
 * The browser's answer. The user is the SESSION's, never the payload's; with no
 * request waiting the answer is dropped.
 */
export function acceptPushSubscription(
  session: { user?: { id?: string | number } | null },
  payload: unknown,
  rawDb: () => Database.Database | undefined,
  now: () => number = Date.now,
): boolean {
  const entry = waiting.get(session);
  if (!entry) return false;
  const p = (payload ?? {}) as { error?: unknown; endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; userAgent?: unknown };
  const id = session.user?.id;
  const raw = rawDb();
  if (typeof p.error === 'string' && p.error) {
    entry.settle({ ok: false, error: oneLine(p.error) });
    return true;
  }
  const p256dh = p.keys?.p256dh;
  const auth = p.keys?.auth;
  if (!raw || id === undefined || id === null || String(id) === '') {
    entry.settle({ ok: false, error: 'not available' });
    return true;
  }
  if (!validEndpoint(p.endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string' || !KEY_RE.test(p256dh) || !KEY_RE.test(auth)) {
    entry.settle({ ok: false, error: 'the browser sent a subscription the board cannot use' });
    return true;
  }
  const saved = saveNotifyPush(raw, String(id), { endpoint: p.endpoint, keys: { p256dh, auth } },
    typeof p.userAgent === 'string' ? p.userAgent.slice(0, 300) : null, now());
  entry.settle(saved
    ? { ok: true, detail: 'Push is on in this browser.' }
    : { ok: false, error: 'this browser is already registered for something else' });
  return true;
}

export const vapidKey = (): string | null => getVapidPublicKey();
