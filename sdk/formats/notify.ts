/**
 * The notification system's rules, in ONE place.
 *
 * The board (web/backend/src/notify) decides what to send and when; the NOTIFY
 * door lets a caller choose. A catalogue, a preference shape and a "when does
 * this go out" rule declared on both sides drift apart silently, so both
 * import them from here - the way the MAG door and the magazine writer share
 * `formats/magazine`.
 *
 * Browser-safe: no Node imports, no filesystem, no database. Time arithmetic
 * uses `Intl` only. All instants are epoch SECONDS, the unit the outbox stores.
 */

export type NotifyMode = 'instant' | 'digest' | 'off';
export type NotifyChannel = 'email' | 'push' | 'board';
/** A mode that actually delivers something. */
export type NotifyDeliveringMode = Exclude<NotifyMode, 'off'>;

export const NOTIFY_CHANNELS: readonly NotifyChannel[] = ['email', 'push', 'board'];
export const NOTIFY_MODES: readonly NotifyMode[] = ['instant', 'digest', 'off'];

export interface NotifyEventDef {
  /** Catalogue name, e.g. 'msg.reply'. Doors' events are 'door.<command>.<slug>'. */
  id: string;
  /** Full words for the caller. */
  label: string;
  /** The channels this event may use. */
  channels: readonly NotifyChannel[];
  /** Only sysops may receive it. */
  sysopOnly?: boolean;
  /** Has a per-conference subscription (notify_follow). */
  followsConference?: boolean;
}

/**
 * The events the board itself emits. Private mail offers Email and Push only:
 * the logon mail scan already tells a caller about mail (sysop decision 3).
 */
export const NOTIFY_EVENTS: readonly NotifyEventDef[] = [
  { id: 'mail.private', label: 'Private mail', channels: ['email', 'push'] },
  { id: 'msg.reply', label: 'Reply to my message', channels: ['email', 'push', 'board'] },
  { id: 'file.new', label: 'New file in a followed conference', channels: ['email', 'push', 'board'], followsConference: true },
  { id: 'page.sysop', label: 'Sysop page', channels: ['email', 'push', 'board'], sysopOnly: true },
  { id: 'mag.story', label: 'New magazine stories', channels: ['email', 'push', 'board'] },
  { id: 'ach.unlock', label: 'Achievement unlocked', channels: ['email', 'push', 'board'] },
];

/** `door.<command>.<slug>`: the namespace a door declares its own events in. */
const DOOR_EVENT = /^door\.([a-z0-9_-]+)\.([a-z0-9_-]+)$/i;

export function isDoorEventId(id: string): boolean {
  return DOOR_EVENT.test(id);
}

/** The command a door event belongs to, or null when `id` is not a door event. */
export function doorEventCommand(id: string): string | null {
  const m = DOOR_EVENT.exec(id);
  return m ? m[1].toUpperCase() : null;
}

/** The definition of a door-declared event: every channel, no special flags. */
export function doorEventDef(id: string, label: string): NotifyEventDef | null {
  return isDoorEventId(id) ? { id, label, channels: NOTIFY_CHANNELS } : null;
}

/** The catalogue entry for an id; a well-formed door event id resolves too. */
export function findEvent(id: string, catalogue: readonly NotifyEventDef[] = NOTIFY_EVENTS): NotifyEventDef | null {
  const hit = catalogue.find((e) => e.id === id);
  if (hit) return hit;
  return doorEventDef(id, id);
}

/** event id -> channel -> mode. A missing cell is 'off' (pure opt-in). */
export type NotifyPrefs = Record<string, Partial<Record<NotifyChannel, NotifyMode>>>;

export interface NotifySettings {
  /** 'HH:MM' or null. Equal from/to means no quiet hours. */
  quietFrom: string | null;
  quietTo: string | null;
  /** IANA zone, or null for the board's zone. */
  timeZone: string | null;
  digestKind: 'daily' | 'weekly';
  /** 0-23, local to timeZone. */
  digestHour: number;
  /** 0 (Sunday) to 6, used when weekly. */
  digestWeekday: number | null;
  paused: boolean;
}

export const DEFAULT_SETTINGS: Readonly<NotifySettings> = {
  quietFrom: null,
  quietTo: null,
  timeZone: null,
  digestKind: 'daily',
  digestHour: 8,
  digestWeekday: null,
  paused: false,
};

export interface NotifyItem {
  event: string;
  title: string;
  body: string;
  url?: string;
  /** Epoch seconds the thing happened. */
  at: number;
  /** The object the event is about (message id, file id); part of the idempotency ref. */
  objectId: string;
}

/** The outbox idempotency key. */
export function notifyRef(event: string, objectId: string, userId: string, channel: NotifyChannel): string {
  return `${event}:${objectId}:${userId}:${channel}`;
}

/** The mode a caller has chosen for one cell; unset means off. */
export function modeFor(prefs: NotifyPrefs, event: string, channel: NotifyChannel): NotifyMode {
  return prefs[event]?.[channel] ?? 'off';
}

/**
 * Keep only what the catalogue allows: unknown events, unknown channels,
 * channels the event does not offer and unknown modes are dropped. A well-formed
 * `door.<cmd>.<slug>` event is accepted without being in `catalogue`.
 */
export function normalizePrefs(raw: unknown, catalogue: readonly NotifyEventDef[] = NOTIFY_EVENTS): NotifyPrefs {
  const out: NotifyPrefs = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [eventId, cells] of Object.entries(raw as Record<string, unknown>)) {
    const def = findEvent(eventId, catalogue);
    if (!def || !cells || typeof cells !== 'object') continue;
    const kept: Partial<Record<NotifyChannel, NotifyMode>> = {};
    for (const [channel, mode] of Object.entries(cells as Record<string, unknown>)) {
      if (!(NOTIFY_CHANNELS as readonly string[]).includes(channel)) continue;
      if (!def.channels.includes(channel as NotifyChannel)) continue;
      if (typeof mode !== 'string' || !(NOTIFY_MODES as readonly string[]).includes(mode)) continue;
      kept[channel as NotifyChannel] = mode as NotifyMode;
    }
    if (Object.keys(kept).length > 0) out[eventId] = kept;
  }
  return out;
}

// ---------------------------------------------------------------- time

const HOUR = 3600;
const DAY = 86400;

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The caller's zone, else the board's, else UTC. A bad zone name never throws. */
export function resolveZone(settings: Pick<NotifySettings, 'timeZone'>, boardZone: string): string {
  if (settings.timeZone && validZone(settings.timeZone)) return settings.timeZone;
  return validZone(boardZone) ? boardZone : 'UTC';
}

interface Wall { year: number; month: number; day: number; hour: number; minute: number; second: number }

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The wall clock in `zone` at epoch seconds `t`. */
function wallAt(t: number, zone: string): Wall {
  const w: Record<string, number> = {};
  for (const p of formatter(zone).formatToParts(new Date(t * 1000))) {
    if (p.type !== 'literal') w[p.type] = Number(p.value);
  }
  return { year: w.year, month: w.month, day: w.day, hour: w.hour % 24, minute: w.minute, second: w.second };
}

/** Seconds that the zone is ahead of UTC at instant `t`. */
function offsetAt(t: number, zone: string): number {
  const w = wallAt(t, zone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) / 1000 - t;
}

/** The instant at which the zone's wall clock reads the given date and time. */
function wallToEpoch(year: number, month: number, day: number, hour: number, minute: number, zone: string): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0) / 1000;
  // Two passes settle the offset across a DST change.
  let t = asUtc - offsetAt(asUtc, zone);
  t = asUtc - offsetAt(t, zone);
  return t;
}

/** Add whole calendar days to a y/m/d (month 1-12). */
function addDays(y: number, m: number, d: number, n: number): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function parseHm(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

/** Epoch seconds of the next time the zone's clock reads `minuteOfDay`, at or after `from`. */
function nextWallTime(from: number, minuteOfDay: number, zone: string, strictlyAfter: boolean): number {
  const w = wallAt(from, zone);
  for (let add = 0; add <= 2; add++) {
    const day = addDays(w.year, w.month, w.day, add);
    const t = wallToEpoch(day.year, day.month, day.day, Math.floor(minuteOfDay / 60), minuteOfDay % 60, zone);
    if (strictlyAfter ? t > from : t >= from) return t;
  }
  return from + DAY;
}

/** True when `now` falls inside the caller's quiet hours. Spans midnight when from > to. */
export function inQuietHours(settings: NotifySettings, now: number, boardZone: string): boolean {
  const from = parseHm(settings.quietFrom);
  const to = parseHm(settings.quietTo);
  if (from === null || to === null || from === to) return false;
  const w = wallAt(now, resolveZone(settings, boardZone));
  const cur = w.hour * 60 + w.minute;
  return from < to ? cur >= from && cur < to : cur >= from || cur < to;
}

/** The next digest slot strictly after `now`, in the caller's zone. */
export function nextDigestSlot(settings: NotifySettings, now: number, boardZone: string): number {
  const zone = resolveZone(settings, boardZone);
  const hour = Math.min(23, Math.max(0, Math.trunc(settings.digestHour)));
  const minute = hour * 60;
  if (settings.digestKind !== 'weekly' || settings.digestWeekday === null) {
    return nextWallTime(now, minute, zone, true);
  }
  const w = wallAt(now, zone);
  const wanted = ((Math.trunc(settings.digestWeekday) % 7) + 7) % 7;
  for (let add = 0; add <= 7; add++) {
    const day = addDays(w.year, w.month, w.day, add);
    if (new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() !== wanted) continue;
    const t = wallToEpoch(day.year, day.month, day.day, hour, 0, zone);
    if (t > now) return t;
  }
  return now + 7 * DAY;
}

/**
 * When an item may go out, in epoch seconds.
 *
 *   instant -> `now`, unless it falls in quiet hours: then the quiet end.
 *   digest  -> the next digest slot in the caller's zone.
 *
 * `boardZone` is the zone used when the caller has none. `paused` is not
 * handled here: a paused caller's rows are held by the dispatcher and
 * re-timed at unpause (plan section 6).
 */
export function deliverAfter(
  _item: Pick<NotifyItem, 'event'>,
  mode: NotifyDeliveringMode,
  settings: NotifySettings,
  now: number,
  boardZone: string,
): number {
  if (mode === 'digest') return nextDigestSlot(settings, now, boardZone);
  if (!inQuietHours(settings, now, boardZone)) return now;
  const to = parseHm(settings.quietTo) as number;
  return nextWallTime(now, to, resolveZone(settings, boardZone), true);
}

// ---------------------------------------------------------------- cap

/** Instant deliveries per rolling hour, per user. The board channel is uncapped. */
export const DEFAULT_CAPS: Readonly<Record<'email' | 'push', number>> = { email: 6, push: 20 };
export const CAP_WINDOW_SECONDS = HOUR;

/**
 * May one more instant message go out on `channel`? `sentTimes` are the epoch
 * seconds of this user's earlier sends on it; only those in the last hour count.
 * Over the cap an instant item rolls into the next digest - never dropped.
 */
export function capAllows(
  sentTimes: readonly number[],
  channel: NotifyChannel,
  now: number,
  caps: Readonly<Record<'email' | 'push', number>> = DEFAULT_CAPS,
): boolean {
  if (channel === 'board') return true;
  const recent = sentTimes.filter((t) => t > now - CAP_WINDOW_SECONDS && t <= now).length;
  return recent < caps[channel];
}
