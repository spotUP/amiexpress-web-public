/**
 * Turn one event for one user into outbox rows - the single place the SDK's
 * rules (`deliverAfter`) meet the repository. Sites (N3) call this and nothing
 * else; they never compute a delivery time themselves.
 */
import type Database from 'better-sqlite3';
import { deliverAfter, findEvent, modeFor, NOTIFY_CHANNELS, notifyRef } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';
import { diskIsSysop } from './account';
import { enqueue, getPrefs, getSettings } from './repository';

/** The board's own zone: the process's TZ (docker-compose.yml), as config.ts documents. */
export function boardTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** The board's sysop test: the socket guard's level over the DISK record (account.ts), not the SQL mirror. */
export function isSysop(db: Database.Database, userId: string): boolean {
  return diskIsSysop(db, userId);
}

/**
 * One row per channel the user chose for `item.event` (unset = off), timed by
 * their quiet hours / digest slot. Returns the number of NEW rows; a repeat of
 * the same event and object adds none (the ref is the idempotency key).
 */
export function queueNotification(
  db: Database.Database, userId: string, item: NotifyItem, now: number, zone: string = boardTimeZone(),
  sysopTest: (db: Database.Database, userId: string) => boolean = isSysop,
): number {
  const def = findEvent(item.event);
  if (!def) return 0;
  if (def.sysopOnly && !sysopTest(db, userId)) return 0;
  const prefs = getPrefs(db, userId);
  const settings = getSettings(db, userId);
  let added = 0;
  for (const channel of NOTIFY_CHANNELS) {
    const mode = modeFor(prefs, item.event, channel);
    if (mode === 'off' || !def.channels.includes(channel)) continue;
    const at = deliverAfter(item, mode, settings, now, zone);
    // An instant item held back by quiet hours is stored as a group member:
    // everything held overnight goes out as ONE message at quiet end (plan
    // section 6), and the dispatcher counts that message once against the cap.
    const grouped = mode === 'digest' || at > now;
    if (enqueue(db, { ref: notifyRef(item.event, item.objectId, userId, channel), userId, channel, item, deliverAfter: at, digest: grouped }, now)) added++;
  }
  return added;
}
