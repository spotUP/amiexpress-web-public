/**
 * The notification tables in notify.schema.sql, and nothing else touches them.
 *
 * Every function takes the open better-sqlite3 handle the caller already holds
 * (the Database singleton's `db`, or a test's), the achievements repository's
 * rule: no second connection. Writes are synchronous and take microseconds.
 * Times are epoch seconds.
 */
import type Database from 'better-sqlite3';
import { BACKOFF_CEILING_SECONDS, BACKOFF_SECONDS } from '../achievements/outbox.repository';
import {
  DEFAULT_SETTINGS, normalizePrefs,
} from '@amiexpress/bbs-door-sdk/formats/notify';
import type {
  NotifyChannel, NotifyItem, NotifyMode, NotifyPrefs, NotifySettings,
} from '@amiexpress/bbs-door-sdk/formats/notify';

export { BACKOFF_SECONDS, BACKOFF_CEILING_SECONDS };

/** A row older than this is given up on and purged, with one WARN per purge. */
export const NOTIFY_MAX_AGE_SECONDS = 14 * 24 * 3600;

type Db = Database.Database;

// ---------------------------------------------------------------- prefs

/** The caller's cells. Rows the catalogue no longer allows are dropped on read. */
export function getPrefs(db: Db, userId: string): NotifyPrefs {
  const rows = db
    .prepare('SELECT event, channel, mode FROM notify_prefs WHERE user_id = ?')
    .all(userId) as { event: string; channel: string; mode: string }[];
  const raw: Record<string, Record<string, string>> = {};
  for (const r of rows) (raw[r.event] ??= {})[r.channel] = r.mode;
  return normalizePrefs(raw);
}

/** Replace the caller's cells with `prefs` (normalised first), atomically. */
export function setPrefs(db: Db, userId: string, prefs: unknown): NotifyPrefs {
  const clean = normalizePrefs(prefs);
  const del = db.prepare('DELETE FROM notify_prefs WHERE user_id = ?');
  const ins = db.prepare('INSERT INTO notify_prefs (user_id, event, channel, mode) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    del.run(userId);
    for (const [event, cells] of Object.entries(clean)) {
      for (const [channel, mode] of Object.entries(cells)) ins.run(userId, event, channel, mode);
    }
  })();
  return clean;
}

/** Users who chose a delivering mode for `event` on `channel`. */
export function usersWanting(db: Db, event: string, channel: NotifyChannel): { userId: string; mode: Exclude<NotifyMode, 'off'> }[] {
  const rows = db
    .prepare(`SELECT user_id, mode FROM notify_prefs WHERE event = ? AND channel = ? AND mode != 'off'`)
    .all(event, channel) as { user_id: string; mode: Exclude<NotifyMode, 'off'> }[];
  return rows.map((r) => ({ userId: r.user_id, mode: r.mode }));
}

// ---------------------------------------------------------------- settings

interface SettingsRow {
  quiet_from: string | null; quiet_to: string | null; time_zone: string | null;
  digest_kind: string; digest_hour: number; digest_weekday: number | null; paused: number;
  email_verified: string | null; email_verified_at: number | null;
}

export interface StoredSettings extends NotifySettings {
  emailVerified: string | null;
  emailVerifiedAt: number | null;
}

/** The caller's settings, or the defaults when they never opened NOTIFY. */
export function getSettings(db: Db, userId: string): StoredSettings {
  const r = db.prepare('SELECT * FROM notify_settings WHERE user_id = ?').get(userId) as SettingsRow | undefined;
  if (!r) return { ...DEFAULT_SETTINGS, emailVerified: null, emailVerifiedAt: null };
  return {
    quietFrom: r.quiet_from, quietTo: r.quiet_to, timeZone: r.time_zone,
    digestKind: r.digest_kind === 'weekly' ? 'weekly' : 'daily',
    digestHour: r.digest_hour, digestWeekday: r.digest_weekday, paused: r.paused === 1,
    emailVerified: r.email_verified, emailVerifiedAt: r.email_verified_at,
  };
}

/**
 * Write the caller's own settings. The verified-address columns are not touched here.
 *
 * Unpausing (paused 1 -> 0) regroups what piled up: every instant row already
 * due becomes a group member, so the dispatcher sends ONE message per channel
 * instead of a burst of instants (and instead of the cap pushing most of them
 * into a digest one by one). Rows still waiting for quiet end or a digest slot
 * keep their time. `now` is epoch seconds.
 */
export function setSettings(db: Db, userId: string, s: NotifySettings, now: number = Math.floor(Date.now() / 1000)): void {
  const was = db.prepare('SELECT paused FROM notify_settings WHERE user_id = ?').get(userId) as { paused: number } | undefined;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO notify_settings (user_id, quiet_from, quiet_to, time_zone, digest_kind, digest_hour, digest_weekday, paused)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, time_zone = excluded.time_zone,
         digest_kind = excluded.digest_kind, digest_hour = excluded.digest_hour,
         digest_weekday = excluded.digest_weekday, paused = excluded.paused`
    ).run(userId, s.quietFrom, s.quietTo, s.timeZone, s.digestKind, s.digestHour, s.digestWeekday, s.paused ? 1 : 0);
    if (was?.paused === 1 && !s.paused) {
      db.prepare('UPDATE notify_outbox SET digest = 1, deliver_after = ? WHERE user_id = ? AND digest = 0 AND deliver_after <= ?').run(now, userId, now);
    }
  })();
}

/** The caller's account address, or null. The board's one address column: users.email. */
export function accountEmail(db: Db, userId: string): string | null {
  const r = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string | null } | undefined;
  const e = r?.email?.trim();
  return e ? e : null;
}

/** Same mailbox: case-insensitive, surrounding blanks ignored. */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Record the address that passed verification (settings row created at defaults if the caller has none). */
export function markEmailVerified(db: Db, userId: string, email: string, now: number): void {
  db.prepare(
    `INSERT INTO notify_settings (user_id, email_verified, email_verified_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET email_verified = excluded.email_verified, email_verified_at = excluded.email_verified_at`
  ).run(userId, email, now);
}

// ---------------------------------------------------------------- email codes

export interface EmailCodeRow { user_id: string; email: string; code_hash: string; expires_at: number; attempts: number }

export function getEmailCode(db: Db, userId: string): EmailCodeRow | undefined {
  return db.prepare('SELECT * FROM notify_email_codes WHERE user_id = ?').get(userId) as EmailCodeRow | undefined;
}

/** One pending code per caller: a new one replaces the old and resets the attempts. */
export function putEmailCode(db: Db, userId: string, email: string, codeHash: string, expiresAt: number): void {
  db.prepare(
    `INSERT INTO notify_email_codes (user_id, email, code_hash, expires_at, attempts) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`
  ).run(userId, email, codeHash, expiresAt);
}

/** Count one wrong guess; returns the attempts used so far. */
export function bumpEmailAttempts(db: Db, userId: string): number {
  db.prepare('UPDATE notify_email_codes SET attempts = attempts + 1 WHERE user_id = ?').run(userId);
  return (db.prepare('SELECT attempts FROM notify_email_codes WHERE user_id = ?').get(userId) as { attempts: number } | undefined)?.attempts ?? 0;
}

export function deleteEmailCode(db: Db, userId: string): void {
  db.prepare('DELETE FROM notify_email_codes WHERE user_id = ?').run(userId);
}

// ---------------------------------------------------------------- follow

export function getFollows(db: Db, userId: string): number[] {
  return (db.prepare('SELECT conference_id FROM notify_follow WHERE user_id = ? ORDER BY conference_id').all(userId) as { conference_id: number }[])
    .map((r) => r.conference_id);
}

export function setFollows(db: Db, userId: string, conferenceIds: readonly number[]): void {
  const ins = db.prepare('INSERT OR IGNORE INTO notify_follow (user_id, conference_id) VALUES (?, ?)');
  db.transaction(() => {
    db.prepare('DELETE FROM notify_follow WHERE user_id = ?').run(userId);
    for (const id of conferenceIds) ins.run(userId, id);
  })();
}

export function followersOf(db: Db, conferenceId: number): string[] {
  return (db.prepare('SELECT user_id FROM notify_follow WHERE conference_id = ?').all(conferenceId) as { user_id: string }[])
    .map((r) => r.user_id);
}

// ---------------------------------------------------------------- outbox

export interface OutboxRow {
  ref: string;
  user_id: string;
  channel: NotifyChannel;
  event: string;
  payload: string;
  created_at: number;
  deliver_after: number;
  digest: number;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
}

export interface OutboxInsert {
  ref: string;
  userId: string;
  channel: NotifyChannel;
  item: NotifyItem;
  deliverAfter: number;
  digest: boolean;
}

/** Enqueue one item. A ref already present is left alone; returns whether a row was added. */
export function enqueue(db: Db, o: OutboxInsert, now: number): boolean {
  return db
    .prepare(
      `INSERT OR IGNORE INTO notify_outbox
         (ref, user_id, channel, event, payload, created_at, deliver_after, digest, attempts, next_attempt_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`
    )
    .run(o.ref, o.userId, o.channel, o.item.event, JSON.stringify(o.item), now, o.deliverAfter, o.digest ? 1 : 0, now)
    .changes > 0;
}

/**
 * The due rows of up to `groupLimit` (user, channel) groups, oldest group first.
 *
 * The limit counts GROUPS, never rows: a digest is one message per group, and a
 * row cut in the middle of a group would send a partial digest now and the rest
 * a minute later. Every due row of a chosen group comes back together.
 *
 * Due = delivery time and retry time both come. A paused caller's rows are
 * not selected at all (they are held until unpause, and must not fill the batch
 * and starve everyone else). `channels` limits the selection to channels the
 * board can deliver on right now, so rows for an unconfigured channel stay in
 * the outbox untouched.
 */
export function due(db: Db, now: number, groupLimit: number, channels: readonly NotifyChannel[] = ['email', 'push', 'board']): OutboxRow[] {
  if (channels.length === 0) return [];
  const marks = channels.map(() => '?').join(',');
  const where = `o.deliver_after <= ? AND o.next_attempt_at <= ? AND o.channel IN (${marks})
                 AND COALESCE((SELECT s.paused FROM notify_settings s WHERE s.user_id = o.user_id), 0) = 0`;
  const groups = db
    .prepare(`SELECT o.user_id AS user_id, o.channel AS channel FROM notify_outbox o WHERE ${where}
              GROUP BY o.user_id, o.channel ORDER BY MIN(o.created_at), o.user_id, o.channel LIMIT ?`)
    .all(now, now, ...channels, groupLimit) as { user_id: string; channel: string }[];
  const rowsOf = db.prepare(`SELECT * FROM notify_outbox o WHERE ${where} AND o.user_id = ? AND o.channel = ? ORDER BY o.created_at, o.ref`);
  const out: OutboxRow[] = [];
  for (const g of groups) out.push(...(rowsOf.all(now, now, ...channels, g.user_id, g.channel) as OutboxRow[]));
  return out;
}

export function pendingCount(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM notify_outbox').get() as { n: number }).n;
}

/** Seconds to wait after the `attempts`-th failure (1-based). */
export function backoffAfter(attempts: number): number {
  return BACKOFF_SECONDS[attempts - 1] ?? BACKOFF_CEILING_SECONDS;
}

export function markFailed(db: Db, refs: readonly string[], error: string, now: number): void {
  const get = db.prepare('SELECT attempts FROM notify_outbox WHERE ref = ?');
  const upd = db.prepare('UPDATE notify_outbox SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE ref = ?');
  db.transaction(() => {
    for (const ref of refs) {
      const row = get.get(ref) as { attempts: number } | undefined;
      if (row) upd.run(now + backoffAfter(row.attempts + 1), error.slice(0, 500), ref);
    }
  })();
}

/** Push rows to a later delivery time (cap overflow into a digest; unpause). */
export function retime(db: Db, refs: readonly string[], deliverAfter: number, asDigest: boolean): void {
  const upd = db.prepare('UPDATE notify_outbox SET deliver_after = ?, digest = ? WHERE ref = ?');
  db.transaction(() => { for (const ref of refs) upd.run(deliverAfter, asDigest ? 1 : 0, ref); })();
}

export function remove(db: Db, refs: readonly string[]): number {
  const del = db.prepare('DELETE FROM notify_outbox WHERE ref = ?');
  let n = 0;
  db.transaction(() => { for (const ref of refs) n += del.run(ref).changes; })();
  return n;
}

/** Stale rows go; a paused caller's rows are held until unpause (plan section 6), however old. */
export function purgeOlderThan(db: Db, cutoff: number): number {
  return db
    .prepare('DELETE FROM notify_outbox WHERE created_at < ? AND user_id NOT IN (SELECT user_id FROM notify_settings WHERE paused = 1)')
    .run(cutoff).changes;
}

// ---------------------------------------------------------------- sent log (cap window)

export function recordSent(db: Db, userId: string, channel: NotifyChannel, sentAt: number): void {
  db.prepare('INSERT INTO notify_sent_log (user_id, channel, sent_at) VALUES (?, ?, ?)').run(userId, channel, sentAt);
}

/** The user's sends on `channel` since `since`, as epoch seconds. */
export function sentSince(db: Db, userId: string, channel: NotifyChannel, since: number): number[] {
  return (db.prepare('SELECT sent_at FROM notify_sent_log WHERE user_id = ? AND channel = ? AND sent_at > ?').all(userId, channel, since) as { sent_at: number }[])
    .map((r) => r.sent_at);
}

export function purgeSentLog(db: Db, cutoff: number): number {
  return db.prepare('DELETE FROM notify_sent_log WHERE sent_at < ?').run(cutoff).changes;
}

// ---------------------------------------------------------------- inbox (the Board channel)

export function addInbox(db: Db, userId: string, item: NotifyItem, now: number): void {
  db.prepare('INSERT INTO notify_inbox (user_id, payload, created_at) VALUES (?, ?, ?)').run(userId, JSON.stringify(item), now);
}

/** Read and delete every item waiting for the caller, oldest first. */
export function takeInbox(db: Db, userId: string): NotifyItem[] {
  const rows = db.prepare('SELECT id, payload FROM notify_inbox WHERE user_id = ? ORDER BY id').all(userId) as { id: number; payload: string }[];
  if (rows.length === 0) return [];
  const del = db.prepare('DELETE FROM notify_inbox WHERE id = ?');
  db.transaction(() => { for (const r of rows) del.run(r.id); })();
  return rows.map((r) => JSON.parse(r.payload) as NotifyItem);
}

export function inboxCount(db: Db, userId: string): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM notify_inbox WHERE user_id = ?').get(userId) as { n: number }).n;
}

// ---------------------------------------------------------------- erasure

/**
 * GDPR: delete everything the caller has in the notification tables. The set
 * is read from the schema, not listed here: every `notify_*` table with a
 * `user_id` column, so a table added to notify.schema.sql is erased without
 * anyone remembering to add it. Returns the number of rows removed.
 */
export function eraseUserNotifyData(db: Db, userId: string): number {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'notify\\_%' ESCAPE '\\'").all() as { name: string }[];
  let n = 0;
  db.transaction(() => {
    for (const { name } of tables) {
      const cols = db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === 'user_id')) continue;
      n += db.prepare(`DELETE FROM ${name} WHERE user_id = ?`).run(userId).changes;
    }
    n += erasePushSubscriptions(db, userId);
  })();
  return n;
}

/**
 * N5 SEAM: a caller's browser push subscriptions for notifications are rows of
 * the push table with purpose = 'notify' (the column lands in N5). Until then
 * there are none to erase. N5 replaces this body with the DELETE and extends
 * the erasure test to insert one.
 */
export function erasePushSubscriptions(_db: Db, _userId: string): number {
  return 0;
}
