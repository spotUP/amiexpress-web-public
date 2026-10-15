/**
 * SP2-2 - the outbox and the pending notices.
 *
 * Against the test database the startup schema created, so the tables
 * here are the tables the board has.
 */
import {
  addLinkNotice, addUnlockNotice, backoffAfter, due, enqueue, markFailed, noticeCount,
  OUTBOX_MAX_AGE_SECONDS, pendingCount, purgeOlderThan, remove, takeNotices,
} from '../../src/achievements/outbox.repository';
import type { EventIn, UnlockOut } from '../../src/achievements/contract';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

let db: any;
const NOW = 1800000000;
const event = (ref: string): EventIn => ({ ref, email: 'caller@example.com', type: 'msg.post', at: '2026-09-07T10:00:00.000Z' });

beforeAll(async () => {
  db = (await waitForTestDb()).db;
}, 30000);

beforeEach(() => {
  db.exec('DELETE FROM achievement_outbox; DELETE FROM achievement_pending_notices;');
});

describe('the outbox', () => {
  it('a duplicate ref is one row', () => {
    expect(enqueue(db, event('uprough:a'), NOW)).toBe(true);
    expect(enqueue(db, event('uprough:a'), NOW + 1)).toBe(false);
    expect(pendingCount(db)).toBe(1);
    expect(due(db, NOW, 100).map((r) => r.ref)).toEqual(['uprough:a']);
  });

  it('a failed row waits 5, 15, 60, 300, 1800 seconds and then an hour, in that order', () => {
    enqueue(db, event('uprough:a'), NOW);
    const waits: number[] = [];
    let t = NOW;
    for (let i = 0; i < 7; i += 1) {
      markFailed(db, ['uprough:a'], 'connect ECONNREFUSED', t);
      const row = due(db, t + 100000, 10)[0];
      waits.push(row.next_attempt_at - t);
      t = row.next_attempt_at;
    }
    expect(waits).toEqual([5, 15, 60, 300, 1800, 3600, 3600]);
    expect(backoffAfter(1)).toBe(5);
    expect(backoffAfter(99)).toBe(3600);
    // Not due before its time, due at it; the error is kept.
    expect(due(db, t - 1, 10)).toEqual([]);
    expect(due(db, t, 10)[0]).toMatchObject({ attempts: 7, last_error: 'connect ECONNREFUSED' });
    // Retry-After overrides the ladder.
    markFailed(db, ['uprough:a'], 'rate limited', t, 42);
    expect(due(db, t + 42, 10)[0].next_attempt_at).toBe(t + 42);
  });

  it('a row older than fourteen days is purged, and removed refs are gone', () => {
    enqueue(db, event('uprough:old'), NOW - OUTBOX_MAX_AGE_SECONDS - 1);
    enqueue(db, event('uprough:new'), NOW);
    expect(purgeOlderThan(db, NOW - OUTBOX_MAX_AGE_SECONDS)).toBe(1);
    expect(due(db, NOW, 10).map((r) => r.ref)).toEqual(['uprough:new']);
    expect(remove(db, ['uprough:new', 'uprough:missing'])).toBe(1);
    expect(pendingCount(db)).toBe(0);
  });

  it('a link notice for an address is stored once, however many events were refused; unlocks queue in order', () => {
    expect(addLinkNotice(db, 'u1', NOW)).toBe(true);
    expect(addLinkNotice(db, 'u1', NOW + 1)).toBe(false);
    const unlock: UnlockOut = { id: 'msg.post.1', name: 'First Words', tier: 'bronze', points: 5, hidden: false, rarityPctTenths: 1000, at: '2026-09-07T10:00:00Z' };
    addUnlockNotice(db, 'u1', unlock, NOW + 2);
    addUnlockNotice(db, 'u2', unlock, NOW + 3);
    expect(noticeCount(db, 'u1')).toBe(2);

    const taken = takeNotices(db, 'u1');
    expect(taken.map((n) => n.kind)).toEqual(['link', 'unlock']);
    expect(taken[1].unlock).toEqual(unlock);
    // Taken is gone; the other caller's is not.
    expect(takeNotices(db, 'u1')).toEqual([]);
    expect(noticeCount(db, 'u2')).toBe(1);
    // And the link explanation may be armed again once it was shown.
    expect(addLinkNotice(db, 'u1', NOW + 4)).toBe(true);
  });
});
