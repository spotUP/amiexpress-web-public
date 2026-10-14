/**
 * Turn one event for one user into outbox rows - the single place the SDK's
 * rules (`deliverAfter`) meet the repository. Sites (N3) call this and nothing
 * else; they never compute a delivery time themselves.
 */
import type Database from 'better-sqlite3';
import { deliverAfter, findEvent, modeFor, NOTIFY_CHANNELS, notifyRef } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';
import { enqueue, getPrefs, getSettings } from './repository';

/** The board's own zone: the process's TZ (docker-compose.yml), as config.ts documents. */
export function boardTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * One row per channel the user chose for `item.event` (unset = off), timed by
 * their quiet hours / digest slot. Returns the number of NEW rows; a repeat of
 * the same event and object adds none (the ref is the idempotency key).
 */
export function queueNotification(db: Database.Database, userId: string, item: NotifyItem, now: number, zone: string = boardTimeZone()): number {
  const def = findEvent(item.event);
  if (!def) return 0;
  const prefs = getPrefs(db, userId);
  const settings = getSettings(db, userId);
  let added = 0;
  for (const channel of NOTIFY_CHANNELS) {
    const mode = modeFor(prefs, item.event, channel);
    if (mode === 'off' || !def.channels.includes(channel)) continue;
    const at = deliverAfter(item, mode, settings, now, zone);
    if (enqueue(db, { ref: notifyRef(item.event, item.objectId, userId, channel), userId, channel, item, deliverAfter: at, digest: mode === 'digest' }, now)) added++;
  }
  return added;
}
