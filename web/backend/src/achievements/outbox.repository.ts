/**
 * The achievements outbox and the pending notices - the two tables in
 * achievements.schema.sql, and nothing else touches them.
 *
 * Every function takes the open better-sqlite3 handle the caller already
 * holds (the Database singleton's `db`, or a test's), the way
 * doors/door-installs.repository.ts does: no second connection, no pool.
 * Writes are synchronous and take microseconds; the reporter relies on
 * that to be non-blocking in BBS flow.
 */
import type Database from 'better-sqlite3';
import type { EventIn, UnlockOut } from './contract';

/** The retry ladder, in seconds: 5 s, 15 s, 60 s, 5 min, 30 min, then hourly. */
export const BACKOFF_SECONDS: readonly number[] = [5, 15, 60, 300, 1800];
export const BACKOFF_CEILING_SECONDS = 3600;
/** A row older than this is given up on and purged, with one WARN per purge. */
export const OUTBOX_MAX_AGE_SECONDS = 14 * 24 * 3600;

export interface OutboxRow {
  ref: string;
  email: string;
  payload: string;
  created_at: number;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
}

export type NoticeKind = 'unlock' | 'link';

export interface NoticeRow {
  id: number;
  user_id: string;
  kind: NoticeKind;
  payload: string;
  created_at: number;
}

export interface Notice {
  id: number;
  kind: NoticeKind;
  unlock: UnlockOut | null;
}

/** Enqueue one event. A ref already present is left alone (one row per ref). */
export function enqueue(db: Database.Database, event: EventIn, now: number): boolean {
  const info = db
    .prepare(
      `INSERT INTO achievement_outbox (ref, email, payload, created_at, attempts, next_attempt_at, last_error)
       VALUES (?, ?, ?, ?, 0, ?, NULL)
       ON CONFLICT(ref) DO NOTHING`
    )
    .run(event.ref, event.email, JSON.stringify(event), now, now);
  return info.changes > 0;
}

/** The rows due now, oldest first, at most `limit`. */
export function due(db: Database.Database, now: number, limit: number): OutboxRow[] {
  return db
    .prepare('SELECT * FROM achievement_outbox WHERE next_attempt_at <= ? ORDER BY created_at, ref LIMIT ?')
    .all(now, limit) as OutboxRow[];
}

export function pendingCount(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM achievement_outbox').get() as { n: number }).n;
}

/** Seconds to wait after the `attempts`-th failure (1-based). */
export function backoffAfter(attempts: number): number {
  return BACKOFF_SECONDS[attempts - 1] ?? BACKOFF_CEILING_SECONDS;
}

/**
 * A retryable failure: attempts + 1, the ladder or the server's Retry-After,
 * and the error kept for a sysop to read.
 */
export function markFailed(db: Database.Database, refs: string[], error: string, now: number, retryAfterSeconds?: number): void {
  if (refs.length === 0) return;
  const stmt = db.prepare(
    `UPDATE achievement_outbox
        SET attempts = attempts + 1,
            next_attempt_at = ?,
            last_error = ?
      WHERE ref = ?`
  );
  const tx = db.transaction((rows: string[]) => {
    for (const ref of rows) {
      const row = db.prepare('SELECT attempts FROM achievement_outbox WHERE ref = ?').get(ref) as { attempts: number } | undefined;
      if (!row) continue;
      const wait = retryAfterSeconds !== undefined ? Math.max(1, retryAfterSeconds) : backoffAfter(row.attempts + 1);
      stmt.run(now + wait, error.slice(0, 500), ref);
    }
  });
  tx(refs);
}

export function remove(db: Database.Database, refs: string[]): number {
  if (refs.length === 0) return 0;
  const stmt = db.prepare('DELETE FROM achievement_outbox WHERE ref = ?');
  let n = 0;
  const tx = db.transaction((rows: string[]) => {
    for (const ref of rows) n += stmt.run(ref).changes;
  });
  tx(refs);
  return n;
}

/** Rows older than the age limit are deleted; returns how many. */
export function purgeOlderThan(db: Database.Database, cutoff: number): number {
  return db.prepare('DELETE FROM achievement_outbox WHERE created_at < ?').run(cutoff).changes;
}

/** An unlock the caller has not seen. */
export function addUnlockNotice(db: Database.Database, userId: string, unlock: UnlockOut, now: number): void {
  db.prepare(
    `INSERT INTO achievement_pending_notices (user_id, kind, payload, created_at) VALUES (?, 'unlock', ?, ?)`
  ).run(userId, JSON.stringify(unlock), now);
}

/** The link explanation, at most once per caller until it is shown. */
export function addLinkNotice(db: Database.Database, userId: string, now: number): boolean {
  const has = db
    .prepare(`SELECT 1 FROM achievement_pending_notices WHERE user_id = ? AND kind = 'link'`)
    .get(userId);
  if (has) return false;
  db.prepare(`INSERT INTO achievement_pending_notices (user_id, kind, payload, created_at) VALUES (?, 'link', '{}', ?)`).run(userId, now);
  return true;
}

/** Read and delete every notice for the caller, oldest first. */
export function takeNotices(db: Database.Database, userId: string): Notice[] {
  const rows = db
    .prepare('SELECT * FROM achievement_pending_notices WHERE user_id = ? ORDER BY id')
    .all(userId) as NoticeRow[];
  if (rows.length === 0) return [];
  const tx = db.transaction((ids: number[]) => {
    const del = db.prepare('DELETE FROM achievement_pending_notices WHERE id = ?');
    for (const id of ids) del.run(id);
  });
  tx(rows.map((r) => r.id));
  return rows.map((r) => ({ id: r.id, kind: r.kind, unlock: r.kind === 'unlock' ? (JSON.parse(r.payload) as UnlockOut) : null }));
}

export function noticeCount(db: Database.Database, userId: string): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM achievement_pending_notices WHERE user_id = ?').get(userId) as { n: number }).n;
}
