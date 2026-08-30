/**
 * Turns BBS events into query invalidations, coalesced.
 *
 * `bbs:event` is a global emit and a busy board produces several a second. An
 * invalidation per event would hammer /api/nodes/status, so keys are collected
 * over a trailing window and flushed once.
 *
 * The mapping is a pure function and the scheduler holds no React state, so
 * both can be tested without a socket or a component.
 */

import type { BBSEvent } from '../types/realtime';

/** A query key prefix, as TanStack Query matches them. */
export type QueryKeyPrefix = readonly string[];

const NODES: QueryKeyPrefix = ['nodes', 'status'];
const STATS_SYSTEM: QueryKeyPrefix = ['stats', 'system'];
const STATS_SESSION: QueryKeyPrefix = ['stats', 'session'];
const LAST_CALLERS: QueryKeyPrefix = ['stats', 'last-callers'];
const LAST_UPLOADS: QueryKeyPrefix = ['stats', 'last-uploads'];
const LAST_DOWNLOADS: QueryKeyPrefix = ['stats', 'last-downloads'];

/** Trailing window, in milliseconds. */
export const COALESCE_WINDOW_MS = 250;

export function queryKeysForEvent(event: BBSEvent): QueryKeyPrefix[] {
  switch (event.type) {
    case 'user_login':
    case 'user_logout':
      // Who is on which node, how many calls today, and the callers list.
      return [NODES, STATS_SYSTEM, STATS_SESSION, LAST_CALLERS];
    case 'upload':
      return [NODES, STATS_SYSTEM, LAST_UPLOADS];
    case 'download':
      return [NODES, STATS_SYSTEM, LAST_DOWNLOADS];
    case 'door_activity':
    case 'custom_door_event':
      // The node card shows the door a caller is in; nothing else moves.
      return [NODES];
  }
}

type Flush = (keys: QueryKeyPrefix[]) => void;

/**
 * Collects keys and flushes them once per window.
 *
 * `now` and `schedule` are injectable so a test can drive the clock instead of
 * waiting for one.
 */
export function createInvalidationScheduler(
  flush: Flush,
  windowMs: number = COALESCE_WINDOW_MS,
  schedule: (fn: () => void, ms: number) => number = (fn, ms) => window.setTimeout(fn, ms),
  cancel: (handle: number) => void = (handle) => window.clearTimeout(handle)
) {
  // Keyed by the joined key so the same query is never invalidated twice in
  // one window.
  const pending = new Map<string, QueryKeyPrefix>();
  let handle: number | null = null;

  function run() {
    handle = null;
    if (pending.size === 0) return;
    const keys = [...pending.values()];
    pending.clear();
    flush(keys);
  }

  return {
    push(event: BBSEvent) {
      for (const key of queryKeysForEvent(event)) {
        pending.set(key.join('/'), key);
      }
      if (handle === null) {
        handle = schedule(run, windowMs);
      }
    },
    /** Flush now - used on reconnect, where waiting adds nothing. */
    flushNow() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      run();
    },
    dispose() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      pending.clear();
    },
    get pendingCount() {
      return pending.size;
    },
  };
}
