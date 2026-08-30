/**
 * The realtime layer under a busy board.
 *
 * Everything here was built against a quiet board and exercised by hand and
 * by unit tests with a handful of events. The condition it has never met is
 * the one the redesign plan names as its fifth risk: `bbs:event` is a global
 * io.emit, a busy board produces several a second, and the admin holds one
 * socket open for as long as the tab is.
 *
 * Real traffic is the only thing that proves this, and these tests are not
 * that. What they do is drive the volume a busy board would produce through
 * the two pieces that have to stay bounded under it - the invalidation
 * scheduler and the activity buffer - with an injected clock, so the
 * properties are checked deterministically rather than by watching a graph.
 *
 * The properties, stated as they would fail:
 *   - an invalidation per event would hammer /api/nodes/status
 *   - keys accumulating across windows would grow without limit
 *   - a feed that never discards would grow until the tab dies
 */

import { describe, expect, it } from 'vitest';
import { createInvalidationScheduler, COALESCE_WINDOW_MS } from '../realtime/query-bridge';
import type { QueryKeyPrefix } from '../realtime/query-bridge';
import { appendEntry, type ActivityEntry } from '../pages/ActivityPage';
import type { BBSEvent } from '../types/realtime';

/** A clock the test drives, standing in for window.setTimeout. */
function fakeClock() {
  let pending: (() => void) | null = null;
  return {
    schedule: (fn: () => void) => {
      pending = fn;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
    /** Run the trailing window's flush, as a real timer eventually would. */
    tick() {
      const fn = pending;
      pending = null;
      fn?.();
    },
    get armed() {
      return pending !== null;
    },
  };
}

const EVENT_TYPES = ['user_login', 'user_logout', 'upload', 'download', 'door_activity'] as const;

function busyBoardEvent(n: number): BBSEvent {
  return {
    type: EVENT_TYPES[n % EVENT_TYPES.length],
    username: `caller${n % 40}`,
    nodeId: n % 14,
    timestamp: Date.now(),
  } as BBSEvent;
}

describe('the invalidation scheduler under sustained load', () => {
  it('turns thousands of events into one flush per window', () => {
    // 200 events a window is far past anything this board will see; the point
    // is that the flush count follows the WINDOWS, not the events.
    const flushes: QueryKeyPrefix[][] = [];
    const clock = fakeClock();
    const scheduler = createInvalidationScheduler(
      (keys) => flushes.push(keys),
      COALESCE_WINDOW_MS,
      clock.schedule,
      clock.cancel
    );

    const windows = 50;
    const perWindow = 200;
    for (let w = 0; w < windows; w++) {
      for (let i = 0; i < perWindow; i++) {
        scheduler.push(busyBoardEvent(w * perWindow + i));
      }
      clock.tick();
    }

    expect(flushes).toHaveLength(windows);
    // 10 000 events, 50 invalidation rounds.
    expect(windows * perWindow).toBe(10_000);
  });

  it('never carries more keys than there are distinct queries', () => {
    // The pending map is keyed by the query key, so a burst of the same event
    // collapses. If this ever grew with the event count, the map would be a
    // leak that only shows up on a busy board.
    const clock = fakeClock();
    const scheduler = createInvalidationScheduler(() => {}, COALESCE_WINDOW_MS, clock.schedule, clock.cancel);

    let highWater = 0;
    for (let i = 0; i < 5_000; i++) {
      scheduler.push(busyBoardEvent(i));
      highWater = Math.max(highWater, scheduler.pendingCount);
    }

    // nodes/status, stats/system, stats/session, last-callers, last-uploads,
    // last-downloads - six, whatever the traffic.
    expect(highWater).toBeLessThanOrEqual(6);
  });

  it('empties its pending set on every flush, over and over', () => {
    const clock = fakeClock();
    const scheduler = createInvalidationScheduler(() => {}, COALESCE_WINDOW_MS, clock.schedule, clock.cancel);

    for (let w = 0; w < 100; w++) {
      for (let i = 0; i < 20; i++) scheduler.push(busyBoardEvent(i));
      expect(scheduler.pendingCount).toBeGreaterThan(0);
      clock.tick();
      expect(scheduler.pendingCount).toBe(0);
    }
  });

  it('rearms rather than stacking timers while a window is open', () => {
    // One timer per window. A timer per event would be the same hammering in
    // a different place.
    const clock = fakeClock();
    const scheduler = createInvalidationScheduler(() => {}, COALESCE_WINDOW_MS, clock.schedule, clock.cancel);

    for (let i = 0; i < 500; i++) scheduler.push(busyBoardEvent(i));
    expect(clock.armed).toBe(true);

    clock.tick();
    expect(clock.armed).toBe(false);

    scheduler.push(busyBoardEvent(1));
    expect(clock.armed).toBe(true);
  });

  it('drops everything pending when the provider unmounts mid-burst', () => {
    // A sysop closing the tab during a busy spell must not leave a timer
    // holding a reference to an unmounted tree.
    let flushed = false;
    const clock = fakeClock();
    const scheduler = createInvalidationScheduler(
      () => { flushed = true; },
      COALESCE_WINDOW_MS,
      clock.schedule,
      clock.cancel
    );

    for (let i = 0; i < 1_000; i++) scheduler.push(busyBoardEvent(i));
    scheduler.dispose();
    clock.tick();

    expect(flushed).toBe(false);
    expect(scheduler.pendingCount).toBe(0);
  });
});

describe('the activity feed under sustained load', () => {
  function entry(n: number): ActivityEntry {
    return {
      id: `live-${n}`,
      type: 'user_login',
      username: `caller${n}`,
      nodeId: n % 14,
      timestamp: n,
      detail: 'logged on',
    };
  }

  it('holds at its cap however long the board stays busy', () => {
    let feed: ActivityEntry[] = [];
    for (let i = 0; i < 20_000; i++) {
      feed = appendEntry(feed, entry(i));
      expect(feed.length).toBeLessThanOrEqual(500);
    }

    expect(feed).toHaveLength(500);
  });

  it('keeps the newest and discards the oldest', () => {
    let feed: ActivityEntry[] = [];
    for (let i = 0; i < 600; i++) feed = appendEntry(feed, entry(i));

    expect(feed[0].id).toBe('live-599');
    expect(feed[feed.length - 1].id).toBe('live-100');
    expect(feed.some((row) => row.id === 'live-99')).toBe(false);
  });
});
