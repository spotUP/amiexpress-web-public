/**
 * What the NOTIFY door may ask of the board: `BBSApi.notifications()`.
 *
 * The ACHIEVE precedent (achievements/door-api.ts): the door gets answers and
 * refusals, never a table, a credential or another caller's rows. Every method
 * acts on the SESSION's user - there is no user parameter to forge - and every
 * check that decides who may see or choose what is made here, not in the door:
 *
 *   catalogue   the events this caller may receive (sysop-only ones only for a
 *               sysop, by the disk record - account.ts) and the channels the
 *               board can deliver on NOW
 *   set         refuses an event that does not exist, a channel an event does
 *               not offer, and a delivering mode on a channel the board cannot
 *               deliver now; settings are validated, not trusted
 *   follow      a conference the caller cannot enter (express.e checkConfAccess
 *               from the disk record) is refused, the whole call with it
 *   test        one item through the real sender for the channel
 *
 * Push: `deliverable.push` is the board's ability to push at all (VAPID keys),
 * NOT the session's: a telnet caller who set Push on the web must still be able
 * to save other cells, which `set` refuses for any delivering cell the board
 * cannot deliver. enablePush is the web-only part (it needs a browser to ask);
 * disablePush needs none. See push.ts.
 */
import type Database from 'better-sqlite3';
import {
  DEFAULT_SETTINGS, NOTIFY_CHANNELS, NOTIFY_EVENTS, NOTIFY_MODES, TEST_EVENT, normalizePrefs,
} from '@amiexpress/bbs-door-sdk/formats/notify';
import type {
  DoorNotificationsApi, NotifyCatalogue, NotifyChannel, NotifyEventDef, NotifyItem, NotifyPrefs, NotifySettings, NotifyState,
} from '@amiexpress/bbs-door-sdk/formats/notify';
import { db as boardDb } from '../database';
import { adminBaseUrl } from '../utils/admin-base-url.util';
import { getBbsName, isSmtpConfigured, sendMailTo } from '../services/mail-notification.service';
import { diskHasConfAccess, diskIsSysop } from './account';
import { productionDoorEvents } from './door-events';
import type { ChannelSender } from './dispatcher';
import { makeEmailSender } from './email';
import { makePushSender, productionPushDeps, requestPushSubscription, vapidKey } from './push';
import { boardTimeZone } from './intake';
import {
  accountEmail, addInbox, erasePushSubscriptions, getFollows, notifyPushCount, getPrefs, getSettings, markOffered, sameAddress, setFollows, setPrefs, setSettings,
} from './repository';
import { confirmEmail, productionVerifyDeps, startEmailVerification } from './verify';
import type { VerifyDeps } from './verify';

type Db = Database.Database;

export interface NotificationsDeps {
  rawDb: () => Db | undefined;
  /** Epoch seconds. */
  now: () => number;
  smtpConfigured: () => Promise<boolean>;
  /** The board can push at all: VAPID keys are configured. */
  pushAvailable: () => boolean;
  /** The VAPID public key a browser subscribes with. */
  vapidKey: () => string | null;
  /** The push sender Send Test calls directly (online suppression lives in the dispatcher). */
  pushSender: ChannelSender;
  /** How long enablePush waits for the browser, ms. */
  pushTimeoutMs?: number;
  conferences: () => Promise<{ id: number; name: string }[]>;
  hasConfAccess: (db: Db, userId: string, conferenceId: number) => boolean;
  isSysop: (db: Db, userId: string) => boolean;
  verify: VerifyDeps;
  /** The email sender Send Test calls directly: online suppression lives in the dispatcher, so a caller inside the door is still mailed. */
  emailSender: ChannelSender;
  boardZone: () => string;
  /** The events installed doors declare in door.settings.json (door-events.ts). */
  doorEvents: () => NotifyEventDef[];
}

export const productionNotificationsDeps = (): NotificationsDeps => ({
  rawDb: () => (boardDb as any).db as Db | undefined,
  now: () => Math.floor(Date.now() / 1000),
  smtpConfigured: isSmtpConfigured,
  pushAvailable: productionPushDeps().enabled,
  vapidKey,
  pushSender: makePushSender(productionPushDeps()),
  conferences: async () => (await boardDb.getConferences()).map((c: any) => ({ id: Number(c.id), name: String(c.name ?? '') })),
  hasConfAccess: diskHasConfAccess,
  isSysop: diskIsSysop,
  verify: productionVerifyDeps(getBbsName),
  emailSender: makeEmailSender({
    rawDb: () => (boardDb as any).db as Db | undefined,
    send: sendMailTo,
    baseUrl: adminBaseUrl,
    bbsName: getBbsName,
  }),
  boardZone: boardTimeZone,
  doorEvents: productionDoorEvents,
});

const HM = /^([01]?\d|2[0-3]):[0-5]\d$/;

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The settings a caller may store, or the reason they may not. Never trusts the door. */
export function checkSettings(raw: unknown): { ok: true; settings: NotifySettings } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'settings missing' };
  const s = raw as Record<string, unknown>;
  const hm = (v: unknown): string | null | undefined => (v === null || v === undefined || v === '' ? null : typeof v === 'string' && HM.test(v) ? v : undefined);
  const quietFrom = hm(s.quietFrom);
  const quietTo = hm(s.quietTo);
  if (quietFrom === undefined || quietTo === undefined) return { ok: false, error: 'quiet hours must be HH:MM' };
  if ((quietFrom === null) !== (quietTo === null)) return { ok: false, error: 'quiet hours need both a start and an end' };
  const timeZone = s.timeZone === null || s.timeZone === undefined || s.timeZone === '' ? null : String(s.timeZone);
  if (timeZone !== null && !validZone(timeZone)) return { ok: false, error: `unknown time zone ${timeZone}` };
  const digestKind = s.digestKind === 'weekly' ? 'weekly' : s.digestKind === 'daily' ? 'daily' : null;
  if (!digestKind) return { ok: false, error: 'digest must be daily or weekly' };
  const hour = Number(s.digestHour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { ok: false, error: 'digest hour must be 0 to 23' };
  let weekday: number | null = null;
  if (digestKind === 'weekly') {
    weekday = Number(s.digestWeekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { ok: false, error: 'digest weekday must be 0 to 6' };
  }
  const pad = (v: string | null): string | null => (v === null ? null : v.padStart(5, '0'));
  return {
    ok: true,
    settings: { quietFrom: pad(quietFrom), quietTo: pad(quietTo), timeZone, digestKind, digestHour: hour, digestWeekday: weekday, paused: s.paused === true },
  };
}

export function doorNotificationsApi(
  session: { user?: { id?: string | number } | null },
  deps: NotificationsDeps = productionNotificationsDeps(),
  /** The caller's own socket; absent for a session with no browser. */
  socket?: { emit: (event: string, payload: unknown) => unknown },
): DoorNotificationsApi {
  /** The caller's id and the board's handle, or a refusal; there is no other source of "who". */
  const who = (): { db: Db; userId: string } => {
    const db = deps.rawDb();
    const id = session.user?.id;
    if (!db || id === undefined || id === null || String(id) === '') throw new Error('not available');
    return { db, userId: String(id) };
  };

  const deliverable = async (): Promise<Record<NotifyChannel, boolean>> => ({
    email: await deps.smtpConfigured(),
    push: deps.pushAvailable(),
    board: true,
  });

  const eventsFor = (db: Db, userId: string): NotifyEventDef[] => {
    const sysop = deps.isSysop(db, userId);
    const board = NOTIFY_EVENTS.filter((e) => !e.sysopOnly || sysop);
    return [...board, ...deps.doorEvents()].map((e) => ({ ...e, channels: [...e.channels] }));
  };

  const stateOf = (db: Db, userId: string): NotifyState => {
    const stored = getSettings(db, userId);
    const address = accountEmail(db, userId);
    const { emailVerified: _v, emailVerifiedAt: _a, ...settings } = stored;
    return {
      prefs: getPrefs(db, userId),
      settings,
      follows: getFollows(db, userId),
      email: { address, verified: sameAddress(stored.emailVerified, address) },
      pushBrowsers: notifyPushCount(db, userId),
    };
  };

  return {
    async catalogue(): Promise<NotifyCatalogue> {
      const { db, userId } = who();
      const events = eventsFor(db, userId);
      const conferences: { id: number; name: string }[] = [];
      if (events.some((e) => e.followsConference)) {
        for (const c of await deps.conferences()) if (deps.hasConfAccess(db, userId, c.id)) conferences.push(c);
      }
      return { events, deliverable: await deliverable(), conferences, boardZone: deps.boardZone() };
    },

    async get(): Promise<NotifyState> {
      const { db, userId } = who();
      // Opening NOTIFY is as good as being offered it.
      markOffered(db, userId, deps.now());
      return stateOf(db, userId);
    },

    async set(prefs: NotifyPrefs, settings: NotifySettings) {
      const { db, userId } = who();
      const allowed = eventsFor(db, userId);
      const can = await deliverable();
      if (!prefs || typeof prefs !== 'object') return { ok: false as const, error: 'preferences missing' };
      for (const [eventId, cells] of Object.entries(prefs)) {
        // Board events this caller may receive, and the events installed doors declare; nothing else.
        const def = allowed.find((e) => e.id === eventId);
        if (!def) return { ok: false as const, error: `unknown event ${eventId}` };
        for (const [channel, mode] of Object.entries(cells ?? {})) {
          if (!(NOTIFY_CHANNELS as readonly string[]).includes(channel)) return { ok: false as const, error: `unknown channel ${channel}` };
          if (!(NOTIFY_MODES as readonly string[]).includes(mode as string)) return { ok: false as const, error: `unknown mode ${String(mode)}` };
          if (!def.channels.includes(channel as NotifyChannel)) return { ok: false as const, error: `${def.label} does not offer ${channel}` };
          if (mode !== 'off' && !can[channel as NotifyChannel]) return { ok: false as const, error: `${channel} is not available on this board` };
        }
      }
      const checked = checkSettings(settings ?? DEFAULT_SETTINGS);
      if (!checked.ok) return checked;
      setPrefs(db, userId, normalizePrefs(prefs, allowed));
      setSettings(db, userId, checked.settings);
      markOffered(db, userId, deps.now());
      return { ok: true as const, state: stateOf(db, userId) };
    },

    async follow(conferenceIds: readonly number[]) {
      const { db, userId } = who();
      if (!Array.isArray(conferenceIds)) return { ok: false as const, error: 'conferences missing' };
      const ids = [...new Set(conferenceIds.map(Number))];
      if (ids.some((n) => !Number.isInteger(n) || n < 1)) return { ok: false as const, error: 'not a conference number' };
      for (const id of ids) {
        if (!deps.hasConfAccess(db, userId, id)) return { ok: false as const, error: `no access to conference ${id}` };
      }
      setFollows(db, userId, ids);
      return { ok: true as const, follows: getFollows(db, userId) };
    },

    async startEmailVerification() {
      const { db, userId } = who();
      return startEmailVerification(db, userId, deps.verify);
    },

    async confirmEmail(code: string) {
      const { db, userId } = who();
      return confirmEmail(db, userId, String(code ?? ''), deps.now());
    },

    async test(channel: NotifyChannel) {
      const { db, userId } = who();
      const can = await deliverable();
      if (!(NOTIFY_CHANNELS as readonly string[]).includes(channel)) return { ok: false as const, error: `unknown channel ${String(channel)}` };
      if (!can[channel]) return { ok: false as const, error: `${channel} is not available on this board` };
      const now = deps.now();
      const item: NotifyItem = {
        event: TEST_EVENT, title: 'Test notification', body: 'This is a test from the Notifications door.', at: now, objectId: `test:${now}`,
      };
      if (channel === 'board') {
        addInbox(db, userId, item, now);
        return { ok: true as const, detail: 'It appears when you leave the door.' };
      }
      if (channel === 'email') {
        const res = await deps.emailSender(userId, [item], false);
        return res.ok ? { ok: true as const, detail: 'Sent. Check your mail.' } : { ok: false as const, error: res.error };
      }
      const res = await deps.pushSender(userId, [item], false);
      return res.ok ? { ok: true as const, detail: 'Sent. It arrives on your subscribed browsers.' }
        : { ok: false as const, error: res.error === 'no subscribed browser' ? 'Turn push on in a browser first.' : res.error };
    },

    async enablePush() {
      who();
      if (!deps.pushAvailable()) return { ok: false as const, error: 'push is not set up on this board' };
      if (!socket || ((session as { connectionType?: string }).connectionType ?? 'web') !== 'web') {
        return { ok: false as const, error: 'push needs the web terminal' };
      }
      return requestPushSubscription(session, socket, {
        enabled: deps.pushAvailable, vapidKey: deps.vapidKey, timeoutMs: deps.pushTimeoutMs,
      });
    },

    async disablePush() {
      const { db, userId } = who();
      const n = erasePushSubscriptions(db, userId);
      return { ok: true as const, detail: n > 0 ? 'Push is off.' : 'Push was already off.' };
    },
  };
}
