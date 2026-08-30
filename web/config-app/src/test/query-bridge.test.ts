import { describe, expect, it, vi } from 'vitest';
import {
  COALESCE_WINDOW_MS,
  createInvalidationScheduler,
  queryKeysForEvent,
} from '../realtime/query-bridge';
import type { BBSEvent } from '../types/realtime';

function event(type: BBSEvent['type'], nodeId = 1): BBSEvent {
  return { type, username: 'SPOT', nodeId, timestamp: 0 } as BBSEvent;
}

/** A hand-driven clock, so the test never waits on a real timer. */
function fakeScheduler() {
  const queue = new Map<number, () => void>();
  let nextHandle = 1;

  return {
    schedule(fn: () => void) {
      const handle = nextHandle++;
      queue.set(handle, fn);
      return handle;
    },
    cancel(handle: number) {
      queue.delete(handle);
    },
    tick() {
      const due = [...queue.values()];
      queue.clear();
      for (const fn of due) fn();
    },
    get scheduledCount() {
      return queue.size;
    },
  };
}

describe('queryKeysForEvent', () => {
  it('invalidates node status for anything carrying a node', () => {
    for (const type of ['user_login', 'user_logout', 'upload', 'download', 'door_activity'] as const) {
      expect(queryKeysForEvent(event(type))).toContainEqual(['nodes', 'status']);
    }
  });

  it('refreshes the callers list on a login, not on a transfer', () => {
    expect(queryKeysForEvent(event('user_login'))).toContainEqual(['stats', 'last-callers']);
    expect(queryKeysForEvent(event('upload'))).not.toContainEqual(['stats', 'last-callers']);
  });

  it('separates uploads from downloads', () => {
    expect(queryKeysForEvent(event('upload'))).toContainEqual(['stats', 'last-uploads']);
    expect(queryKeysForEvent(event('download'))).toContainEqual(['stats', 'last-downloads']);
  });

  it('moves only the node cards for door activity', () => {
    // A caller stepping into a door does not change any statistic; refetching
    // them on every door event is exactly the hammering this exists to avoid.
    expect(queryKeysForEvent(event('door_activity'))).toEqual([['nodes', 'status']]);
    expect(queryKeysForEvent(event('custom_door_event'))).toEqual([['nodes', 'status']]);
  });
});

describe('createInvalidationScheduler', () => {
  it('turns a burst of events into one flush', () => {
    // A busy board emits several events a second and bbs:event is a global
    // emit, so one invalidation per event would hammer /api/nodes/status.
    const flush = vi.fn();
    const clock = fakeScheduler();
    const scheduler = createInvalidationScheduler(flush, COALESCE_WINDOW_MS, clock.schedule, clock.cancel);

    for (let i = 0; i < 20; i += 1) scheduler.push(event('door_activity', i));
    expect(flush).not.toHaveBeenCalled();

    clock.tick();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toEqual([['nodes', 'status']]);
  });

  it('collects the union of the keys in the window, without duplicates', () => {
    const flush = vi.fn();
    const clock = fakeScheduler();
    const scheduler = createInvalidationScheduler(flush, COALESCE_WINDOW_MS, clock.schedule, clock.cancel);

    scheduler.push(event('user_login'));
    scheduler.push(event('upload'));
    clock.tick();

    const keys = flush.mock.calls[0][0] as string[][];
    expect(keys).toContainEqual(['nodes', 'status']);
    expect(keys).toContainEqual(['stats', 'last-callers']);
    expect(keys).toContainEqual(['stats', 'last-uploads']);
    expect(keys.filter((key) => key.join('/') === 'nodes/status')).toHaveLength(1);
  });

  it('starts a new window after a flush', () => {
    const flush = vi.fn();
    const clock = fakeScheduler();
    const scheduler = createInvalidationScheduler(flush, COALESCE_WINDOW_MS, clock.schedule, clock.cancel);

    scheduler.push(event('upload'));
    clock.tick();
    scheduler.push(event('download'));
    clock.tick();

    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('does not flush an empty window', () => {
    const flush = vi.fn();
    const clock = fakeScheduler();
    createInvalidationScheduler(flush, COALESCE_WINDOW_MS, clock.schedule, clock.cancel);

    clock.tick();
    expect(flush).not.toHaveBeenCalled();
  });

  it('flushes immediately on demand and drops the pending timer', () => {
    const flush = vi.fn();
    const clock = fakeScheduler();
    const scheduler = createInvalidationScheduler(flush, COALESCE_WINDOW_MS, clock.schedule, clock.cancel);

    scheduler.push(event('user_login'));
    scheduler.flushNow();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(clock.scheduledCount).toBe(0);
  });

  it('forgets everything when disposed, so an unmounted provider flushes nothing', () => {
    const flush = vi.fn();
    const clock = fakeScheduler();
    const scheduler = createInvalidationScheduler(flush, COALESCE_WINDOW_MS, clock.schedule, clock.cancel);

    scheduler.push(event('user_login'));
    scheduler.dispose();
    clock.tick();

    expect(flush).not.toHaveBeenCalled();
    expect(scheduler.pendingCount).toBe(0);
  });
});
