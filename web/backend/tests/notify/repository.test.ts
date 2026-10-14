/**
 * The notify_* tables, against the schema the board creates at startup.
 */
import {
  addInbox, backoffAfter, BACKOFF_SECONDS, due, enqueue, followersOf, getFollows, getPrefs, getSettings, inboxCount, markFailed,
  pendingCount, purgeOlderThan, recordSent, remove, retime, sentSince, setFollows, setPrefs, setSettings, takeInbox, usersWanting,
} from '../../src/notify/repository';
import { BACKOFF_SECONDS as ACHIEVEMENT_BACKOFF } from '../../src/achievements/outbox.repository';
import { queueNotification } from '../../src/notify/intake';
import { DEFAULT_SETTINGS } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';

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
const NOW = 1_800_000_000;
const item = (objectId: string): NotifyItem => ({ event: 'msg.reply', title: 'Reply from bob', body: 'Re: hello', at: NOW, objectId });

beforeAll(async () => {
  db = (await waitForTestDb()).db;
}, 30000);

beforeEach(() => {
  for (const t of ['notify_prefs', 'notify_follow', 'notify_settings', 'notify_outbox', 'notify_inbox', 'notify_sent_log']) db.exec(`DELETE FROM ${t}`);
});

describe('prefs and settings', () => {
  it('round-trips prefs and drops what the catalogue does not allow on the way in', () => {
    setPrefs(db, 'u1', { 'msg.reply': { email: 'instant', push: 'digest', fax: 'instant' }, 'bogus.event': { email: 'instant' }, 'mail.private': { board: 'instant' } });
    expect(getPrefs(db, 'u1')).toEqual({ 'msg.reply': { email: 'instant', push: 'digest' } });
  });

  it('setPrefs replaces the caller rows and leaves other callers alone', () => {
    setPrefs(db, 'u1', { 'msg.reply': { email: 'instant' } });
    setPrefs(db, 'u2', { 'msg.reply': { email: 'digest' } });
    setPrefs(db, 'u1', { 'ach.unlock': { board: 'instant' } });
    expect(getPrefs(db, 'u1')).toEqual({ 'ach.unlock': { board: 'instant' } });
    expect(getPrefs(db, 'u2')).toEqual({ 'msg.reply': { email: 'digest' } });
  });

  it('usersWanting skips off cells', () => {
    setPrefs(db, 'u1', { 'msg.reply': { email: 'instant' } });
    setPrefs(db, 'u2', { 'msg.reply': { email: 'off' } });
    expect(usersWanting(db, 'msg.reply', 'email')).toEqual([{ userId: 'u1', mode: 'instant' }]);
  });

  it('a caller who never opened NOTIFY gets the defaults', () => {
    expect(getSettings(db, 'nobody')).toEqual({ ...DEFAULT_SETTINGS, emailVerified: null, emailVerifiedAt: null });
  });

  it('round-trips settings', () => {
    setSettings(db, 'u1', { quietFrom: '22:00', quietTo: '07:00', timeZone: 'Europe/Oslo', digestKind: 'weekly', digestHour: 9, digestWeekday: 1, paused: true });
    expect(getSettings(db, 'u1')).toMatchObject({ quietFrom: '22:00', quietTo: '07:00', timeZone: 'Europe/Oslo', digestKind: 'weekly', digestHour: 9, digestWeekday: 1, paused: true });
  });

  it('round-trips follows', () => {
    setFollows(db, 'u1', [3, 1, 3]);
    setFollows(db, 'u2', [1]);
    expect(getFollows(db, 'u1')).toEqual([1, 3]);
    expect(followersOf(db, 1).sort()).toEqual(['u1', 'u2']);
  });
});

describe('outbox', () => {
  const row = (ref: string, over: Record<string, unknown> = {}) => ({ ref, userId: 'u1', channel: 'board' as const, item: item(ref), deliverAfter: NOW, digest: false, ...over });

  it('is idempotent on ref: the same event twice is one row', () => {
    expect(enqueue(db, row('r1'), NOW)).toBe(true);
    expect(enqueue(db, row('r1'), NOW)).toBe(false);
    expect(pendingCount(db)).toBe(1);
  });

  it('due holds back rows whose delivery time or retry time has not come', () => {
    enqueue(db, row('now'), NOW);
    enqueue(db, row('later', { deliverAfter: NOW + 100 }), NOW);
    expect(due(db, NOW, 10).map((r: any) => r.ref)).toEqual(['now']);
    expect(due(db, NOW + 100, 10).map((r: any) => r.ref).sort()).toEqual(['later', 'now']);
  });

  it('due can be limited to the channels the board can deliver on', () => {
    enqueue(db, row('b'), NOW);
    enqueue(db, row('e', { channel: 'email' }), NOW);
    expect(due(db, NOW, 10, ['board']).map((r: any) => r.ref)).toEqual(['b']);
    expect(due(db, NOW, 10, [])).toEqual([]);
  });

  it('a failure backs off on the achievements ladder, which is imported, not copied', () => {
    expect(BACKOFF_SECONDS).toBe(ACHIEVEMENT_BACKOFF);
    enqueue(db, row('r1'), NOW);
    markFailed(db, ['r1'], 'smtp down', NOW);
    expect(due(db, NOW, 10)).toEqual([]);
    expect(due(db, NOW + backoffAfter(1), 10)).toHaveLength(1);
    expect((due(db, NOW + backoffAfter(1), 10)[0] as any).attempts).toBe(1);
  });

  it('retime moves a row to a digest slot and remove deletes it', () => {
    enqueue(db, row('r1'), NOW);
    retime(db, ['r1'], NOW + 500, true);
    expect(due(db, NOW, 10)).toEqual([]);
    const r = due(db, NOW + 500, 10)[0] as any;
    expect(r.digest).toBe(1);
    expect(remove(db, ['r1'])).toBe(1);
    expect(pendingCount(db)).toBe(0);
  });

  it('purgeOlderThan deletes only stale rows', () => {
    enqueue(db, row('old'), NOW - 1000);
    enqueue(db, row('new'), NOW);
    expect(purgeOlderThan(db, NOW - 500)).toBe(1);
    expect(pendingCount(db)).toBe(1);
  });

  it('queueNotification makes one row per chosen channel and a repeat adds none', () => {
    setPrefs(db, 'u1', { 'msg.reply': { email: 'instant', board: 'digest', push: 'off' } });
    expect(queueNotification(db, 'u1', item('m7'), NOW, 'UTC')).toBe(2);
    expect(queueNotification(db, 'u1', item('m7'), NOW, 'UTC')).toBe(0);
    const rows = db.prepare('SELECT channel, digest, deliver_after FROM notify_outbox ORDER BY channel').all();
    expect(rows[0]).toMatchObject({ channel: 'board', digest: 1 });
    expect(rows[0].deliver_after).toBeGreaterThan(NOW);
    expect(rows[1]).toMatchObject({ channel: 'email', digest: 0, deliver_after: NOW });
  });

  it('a caller with nothing chosen gets nothing queued (pure opt-in)', () => {
    expect(queueNotification(db, 'u1', item('m8'), NOW, 'UTC')).toBe(0);
    expect(pendingCount(db)).toBe(0);
  });
});

describe('sysop-only events', () => {
  const addUser = (id: string, level: number): void => {
    db.prepare('INSERT OR REPLACE INTO users (id, username, passwordhash, realname, seclevel) VALUES (?, ?, ?, ?, ?)').run(id, `n-${id}`, 'x', id, level);
  };
  afterEach(() => { db.exec("DELETE FROM users WHERE id LIKE 'ntf-%'"); });

  it('a page for the sysop is queued for a sysop and never for a caller', () => {
    addUser('ntf-sysop', 255);
    addUser('ntf-caller', 10);
    const page: NotifyItem = { event: 'page.sysop', title: 'Page from bob', body: 'hi', at: NOW, objectId: 'p1' };
    setPrefs(db, 'ntf-sysop', { 'page.sysop': { board: 'instant' } });
    setPrefs(db, 'ntf-caller', { 'page.sysop': { board: 'instant' } });
    expect(queueNotification(db, 'ntf-caller', page, NOW, 'UTC')).toBe(0);
    expect(queueNotification(db, 'ntf-sysop', page, NOW, 'UTC')).toBe(1);
  });
});

describe('sent log and inbox', () => {
  it('sentSince returns only sends inside the window', () => {
    recordSent(db, 'u1', 'email', NOW - 7200);
    recordSent(db, 'u1', 'email', NOW - 60);
    recordSent(db, 'u1', 'push', NOW - 60);
    expect(sentSince(db, 'u1', 'email', NOW - 3600)).toEqual([NOW - 60]);
  });

  it('takeInbox returns the caller items oldest first and deletes them', () => {
    addInbox(db, 'u1', item('a'), NOW);
    addInbox(db, 'u1', item('b'), NOW);
    addInbox(db, 'u2', item('c'), NOW);
    expect(takeInbox(db, 'u1').map((i) => i.objectId)).toEqual(['a', 'b']);
    expect(inboxCount(db, 'u1')).toBe(0);
    expect(inboxCount(db, 'u2')).toBe(1);
    expect(takeInbox(db, 'u1')).toEqual([]);
  });
});
