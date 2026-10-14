/**
 * The dispatcher: drains notify_outbox to the channels.
 *
 * Every minute (and once at start): the rows whose delivery time has come,
 * for the channels this board can deliver on right now, oldest first.
 *
 *   paused caller        held; the row stays and goes out after unpause
 *   digest rows          one message per (user, channel) listing every item
 *   instant rows         one message each; over the per-user cap (capAllows)
 *                        the row is re-timed into the next digest, never dropped
 *   success              rows deleted, the send logged for the cap window
 *   failure              the achievements backoff ladder; a non-retryable
 *                        failure deletes the row with one WARN
 *
 * N1 delivers the Board channel. Email and push are typed seams: a sender
 * injected in `deps.senders` makes that channel live. A channel with NO sender
 * is excluded from the selection, so its rows stay in the outbox untouched
 * (and do not crowd the batch) until a sender is wired - they are never
 * dropped. Rows older than fourteen days are purged with one WARN.
 *
 * The timer is unref'd; a tick still running when the next fires is skipped.
 */
import type Database from 'better-sqlite3';
import { capAllows, nextDigestSlot, CAP_WINDOW_SECONDS } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifyChannel, NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';
import { db } from '../database';
import { boardTimeZone } from './intake';
import { deliverBoard } from './board';
import {
  due, getSettings, markFailed, NOTIFY_MAX_AGE_SECONDS, purgeOlderThan, purgeSentLog, recordSent, remove, retime, sentSince,
} from './repository';
import type { OutboxRow } from './repository';

export const DISPATCH_INTERVAL_MS = 60_000;
export const DISPATCH_BATCH = 200;

export type SendResult = { ok: true } | { ok: false; error: string; retry: boolean };

/**
 * What a channel's sender receives: one user's items (several for a digest) and
 * whether it is a digest. A sender may also throw; that counts as a retryable
 * failure.
 */
export type ChannelSender = (userId: string, items: NotifyItem[], digest: boolean) => Promise<SendResult>;

export interface DispatcherDeps {
  rawDb: () => Database.Database | undefined;
  /** Epoch milliseconds. */
  now: () => number;
  log: (line: string) => void;
  boardZone: () => string;
  /** Email (N2) and push (N5) senders; absent = that channel is not delivered yet. */
  senders: Partial<Record<Exclude<NotifyChannel, 'board'>, ChannelSender>>;
  /** The Board channel: drawn now, or kept for the next menu. */
  showBoard: (userId: string, item: NotifyItem) => 'shown' | 'kept' | 'dropped';
}

export interface TickOutcome {
  sent: number;
  failed: number;
  held: number;
  retimed: number;
  purged: number;
}

/** One message standing in for several items. */
export function digestItem(items: readonly NotifyItem[], now: number): NotifyItem {
  if (items.length === 1) return items[0];
  return {
    event: 'digest',
    title: `${items.length} notifications`,
    body: items.map((i) => i.title).join('; '),
    at: now,
    objectId: items.map((i) => i.objectId).join(','),
  };
}

export function productionDispatcherDeps(io: unknown): DispatcherDeps {
  const rawDb = (): Database.Database | undefined => (db as any).db as Database.Database | undefined;
  return {
    rawDb,
    now: () => Date.now(),
    log: (line) => console.log(line),
    boardZone: boardTimeZone,
    senders: {},
    showBoard: (userId, item) => deliverBoard(io, userId, item, { rawDb, now: () => Date.now() }),
  };
}

let lastPurgeAt = 0;

export function _resetPurgeClockForTests(): void {
  lastPurgeAt = 0;
}

/** One pass. Returns what happened, for the log and the tests. */
export async function dispatchOnce(deps: DispatcherDeps): Promise<TickOutcome> {
  const out: TickOutcome = { sent: 0, failed: 0, held: 0, retimed: 0, purged: 0 };
  const handle = deps.rawDb();
  if (!handle) return out;
  const now = Math.floor(deps.now() / 1000);

  if (now - lastPurgeAt > 3600) {
    lastPurgeAt = now;
    out.purged = purgeOlderThan(handle, now - NOTIFY_MAX_AGE_SECONDS);
    purgeSentLog(handle, now - 24 * 3600);
    if (out.purged > 0) deps.log(`[WARN] notify: gave up on ${out.purged} notifications older than fourteen days`);
  }

  const channels: NotifyChannel[] = ['board'];
  if (deps.senders.email) channels.push('email');
  if (deps.senders.push) channels.push('push');
  const rows = due(handle, now, DISPATCH_BATCH, channels);
  if (rows.length === 0) return out;

  const zone = deps.boardZone();
  const sendOne = async (channel: NotifyChannel, userId: string, items: NotifyItem[], digest: boolean): Promise<SendResult> => {
    if (channel === 'board') {
      const item = digestItem(items, now);
      return deps.showBoard(userId, item) === 'dropped' ? { ok: false, error: 'no database', retry: true } : { ok: true };
    }
    const sender = deps.senders[channel];
    if (!sender) return { ok: false, error: 'no sender', retry: true };
    try {
      return await sender(userId, items, digest);
    } catch (err) {
      return { ok: false, error: (err as Error).message, retry: true };
    }
  };

  const settle = (refs: string[], res: SendResult, userId: string, channel: NotifyChannel): void => {
    if (res.ok) {
      remove(handle, refs);
      recordSent(handle, userId, channel, now);
      out.sent += refs.length;
    } else if (res.retry) {
      markFailed(handle, refs, res.error, now);
      out.failed += refs.length;
    } else {
      remove(handle, refs);
      out.failed += refs.length;
      deps.log(`[WARN] notify: dropped ${refs.length} ${channel} notification(s) for ${userId}: ${res.error}`);
    }
  };

  const pausedUsers = new Map<string, boolean>();
  const isPaused = (userId: string): boolean => {
    let p = pausedUsers.get(userId);
    if (p === undefined) { p = getSettings(handle, userId).paused; pausedUsers.set(userId, p); }
    return p;
  };

  const digests = new Map<string, OutboxRow[]>();
  const instants: OutboxRow[] = [];
  for (const row of rows) {
    if (isPaused(row.user_id)) { out.held++; continue; }
    if (row.digest === 1) {
      const key = `${row.user_id}\u0000${row.channel}`;
      (digests.get(key) ?? digests.set(key, []).get(key)!).push(row);
    } else {
      instants.push(row);
    }
  }

  for (const group of digests.values()) {
    const { user_id: userId, channel } = group[0];
    const items = group.map((r) => JSON.parse(r.payload) as NotifyItem);
    settle(group.map((r) => r.ref), await sendOne(channel, userId, items, true), userId, channel);
  }

  const sentMemo = new Map<string, number[]>();
  for (const row of instants) {
    const userId = row.user_id;
    const channel = row.channel;
    if (channel !== 'board') {
      const key = `${userId}\u0000${channel}`;
      let times = sentMemo.get(key);
      if (!times) { times = sentSince(handle, userId, channel, now - CAP_WINDOW_SECONDS); sentMemo.set(key, times); }
      if (!capAllows(times, channel, now)) {
        retime(handle, [row.ref], nextDigestSlot(getSettings(handle, userId), now, zone), true);
        out.retimed++;
        continue;
      }
      const before = out.sent;
      settle([row.ref], await sendOne(channel, userId, [JSON.parse(row.payload) as NotifyItem], false), userId, channel);
      if (out.sent > before) times.push(now);
    } else {
      settle([row.ref], await sendOne(channel, userId, [JSON.parse(row.payload) as NotifyItem], false), userId, channel);
    }
  }
  return out;
}

let running = false;

/** The 60 s timer, unref'd, with an immediate first tick and an overlap guard. */
export function startNotifyDispatcher(deps: DispatcherDeps, intervalMs: number = DISPATCH_INTERVAL_MS): NodeJS.Timeout {
  const tick = (): void => {
    if (running) return;
    running = true;
    dispatchOnce(deps)
      .catch((err: Error) => deps.log(`[WARN] notify: dispatch failed: ${err.message}`))
      .finally(() => { running = false; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}
