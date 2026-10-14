/**
 * The dispatcher tick: what it sends, what it holds, what it re-times.
 */
import { dispatchOnce, _resetPurgeClockForTests, digestItem } from '../../src/notify/dispatcher';
import type { ChannelSender, DispatcherDeps } from '../../src/notify/dispatcher';
import { enqueue, pendingCount, purgeOlderThan, recordSent, setPrefs, setSettings, sentSince } from '../../src/notify/repository';
import { queueNotification } from '../../src/notify/intake';
import { DEFAULT_SETTINGS, notifyRef } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifyChannel, NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';

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
const it1 = (id: string): NotifyItem => ({ event: 'msg.reply', title: `Reply ${id}`, body: 'b', at: NOW, objectId: id });

function put(userId: string, channel: NotifyChannel, id: string, over: { digest?: boolean; deliverAfter?: number } = {}): void {
  enqueue(db, { ref: notifyRef('msg.reply', id, userId, channel), userId, channel, item: it1(id), deliverAfter: over.deliverAfter ?? NOW, digest: over.digest ?? false }, NOW);
}

const deps = (senders: DispatcherDeps['senders'] = {}): DispatcherDeps => ({
  rawDb: () => db, now: () => NOW * 1000, log: jest.fn(), boardZone: () => 'UTC', senders,
  showBoard: jest.fn().mockReturnValue('shown'),
});

beforeAll(async () => { db = (await waitForTestDb()).db; }, 30000);
beforeEach(() => {
  for (const t of ['notify_outbox', 'notify_inbox', 'notify_sent_log', 'notify_settings']) db.exec(`DELETE FROM ${t}`);
  _resetPurgeClockForTests();
});

describe('dispatchOnce - batches and holds', () => {
  it('a paused caller with more than a batch of due rows does not starve the next caller', async () => {
    setSettings(db, 'paused', { ...DEFAULT_SETTINGS, paused: true });
    for (let i = 0; i < 250; i++) enqueue(db, { ref: `p${i}`, userId: 'paused', channel: 'email', item: it1(`p${i}`), deliverAfter: NOW, digest: false }, NOW - 10);
    // The paused caller's rows are the OLDEST, so a row-limited batch is all theirs.
    enqueue(db, { ref: notifyRef('msg.reply', 'o1', 'other', 'email'), userId: 'other', channel: 'email', item: it1('o1'), deliverAfter: NOW, digest: false }, NOW);
    const email = jest.fn().mockResolvedValue({ ok: true });
    await dispatchOnce(deps({ email }));
    expect(email).toHaveBeenCalledTimes(1);
    expect(email.mock.calls[0][0]).toBe('other');
    expect(pendingCount(db)).toBe(250);
  });

  it('a paused caller rows survive the fourteen-day purge', () => {
    setSettings(db, 'paused', { ...DEFAULT_SETTINGS, paused: true });
    enqueue(db, { ref: 'old-p', userId: 'paused', channel: 'email', item: it1('x'), deliverAfter: NOW, digest: false }, NOW - 20 * 86400);
    enqueue(db, { ref: 'old-q', userId: 'other', channel: 'email', item: it1('y'), deliverAfter: NOW, digest: false }, NOW - 20 * 86400);
    expect(purgeOlderThan(db, NOW - 14 * 86400)).toBe(1);
    expect(pendingCount(db)).toBe(1);
  });

  it('250 digest rows over 50 callers at one slot send exactly one message per caller', async () => {
    const email = jest.fn().mockResolvedValue({ ok: true });
    for (let u = 0; u < 50; u++) for (let i = 0; i < 5; i++) put(`u${u}`, 'email', `${i}-${u}`, { digest: true });
    await dispatchOnce(deps({ email }));
    await dispatchOnce(deps({ email }));
    expect(email).toHaveBeenCalledTimes(50);
    for (const c of email.mock.calls) expect(c[1]).toHaveLength(5);
    expect(pendingCount(db)).toBe(0);
  });

  it('ten items held overnight by quiet hours go out as one message at quiet end', async () => {
    setPrefs(db, 'u1', { 'msg.reply': { email: 'instant' } });
    setSettings(db, 'u1', { ...DEFAULT_SETTINGS, quietFrom: '22:00', quietTo: '07:00', timeZone: 'UTC' });
    const night = Date.UTC(2026, 6, 1, 23, 0) / 1000;
    for (let i = 0; i < 10; i++) queueNotification(db, 'u1', it1(`n${i}`), night + i, 'UTC');
    const email = jest.fn().mockResolvedValue({ ok: true });
    const at = (t: number): DispatcherDeps => ({ ...deps({ email }), now: () => t * 1000 });
    await dispatchOnce(at(night + 3600));
    expect(email).not.toHaveBeenCalled();
    await dispatchOnce(at(Date.UTC(2026, 6, 2, 7, 0) / 1000));
    expect(email).toHaveBeenCalledTimes(1);
    expect(email.mock.calls[0][1]).toHaveLength(10);
    expect(db.prepare("SELECT COUNT(*) AS n FROM notify_sent_log WHERE user_id='u1'").get().n).toBe(1);
  });
});

describe('dispatchOnce', () => {
  it('leaves rows for an unconfigured channel in the outbox untouched', async () => {
    put('u1', 'email', 'a');
    put('u1', 'push', 'b');
    const out = await dispatchOnce(deps());
    expect(out.sent).toBe(0);
    expect(pendingCount(db)).toBe(2);
  });

  it('sends through an injected sender, deletes on success, and logs the send for the cap window', async () => {
    const email: ChannelSender = jest.fn().mockResolvedValue({ ok: true });
    put('u1', 'email', 'a');
    const out = await dispatchOnce(deps({ email }));
    expect(email).toHaveBeenCalledTimes(1);
    expect(out.sent).toBe(1);
    expect(pendingCount(db)).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM notify_sent_log WHERE channel='email'").get().n).toBe(1);
  });

  it('a failing sender keeps the row and backs it off; a throwing sender is the same', async () => {
    put('u1', 'email', 'a');
    put('u2', 'email', 'b');
    const email: ChannelSender = jest.fn(async (u) => { if (u === 'u2') throw new Error('boom'); return { ok: false, error: 'smtp 451', retry: true }; });
    const out = await dispatchOnce(deps({ email }));
    expect(out.failed).toBe(2);
    expect(pendingCount(db)).toBe(2);
    expect((await dispatchOnce(deps({ email }))).sent).toBe(0); // still backing off
    expect(db.prepare('SELECT last_error FROM notify_outbox ORDER BY ref').all().map((r: any) => r.last_error)).toEqual(['smtp 451', 'boom']);
  });

  it('a non-retryable failure deletes the row with a WARN', async () => {
    put('u1', 'email', 'a');
    const d = deps({ email: jest.fn().mockResolvedValue({ ok: false, error: 'address gone', retry: false }) });
    await dispatchOnce(d);
    expect(pendingCount(db)).toBe(0);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
  });

  it('groups digest rows per user and channel into one message', async () => {
    const email = jest.fn().mockResolvedValue({ ok: true });
    for (const id of ['a', 'b', 'c']) put('u1', 'email', id, { digest: true });
    put('u2', 'email', 'd', { digest: true });
    await dispatchOnce(deps({ email }));
    expect(email).toHaveBeenCalledTimes(2);
    const u1Call = email.mock.calls.find((c: unknown[]) => c[0] === 'u1')!;
    expect(u1Call[1]).toHaveLength(3);
    expect(u1Call[2]).toBe(true);
    expect(pendingCount(db)).toBe(0);
  });

  it('an instant email over the hourly cap is re-timed into the next digest, not sent and not dropped', async () => {
    for (let i = 0; i < 6; i++) recordSent(db, 'u1', 'email', NOW - 60 * (i + 1));
    const email = jest.fn().mockResolvedValue({ ok: true });
    put('u1', 'email', 'over');
    const out = await dispatchOnce(deps({ email }));
    expect(email).not.toHaveBeenCalled();
    expect(out.retimed).toBe(1);
    const row = db.prepare('SELECT digest, deliver_after FROM notify_outbox').get();
    expect(row.digest).toBe(1);
    expect(row.deliver_after).toBeGreaterThan(NOW);
  });

  it('the cap counts sends made earlier in the same tick', async () => {
    const email = jest.fn().mockResolvedValue({ ok: true });
    for (let i = 0; i < 8; i++) put('u1', 'email', `m${i}`);
    const out = await dispatchOnce(deps({ email }));
    expect(email).toHaveBeenCalledTimes(6);
    expect(out.retimed).toBe(2);
  });

  it('a paused caller is held: nothing sent, nothing deleted', async () => {
    setSettings(db, 'u1', { ...DEFAULT_SETTINGS, paused: true });
    const email = jest.fn().mockResolvedValue({ ok: true });
    put('u1', 'email', 'a');
    const out = await dispatchOnce(deps({ email }));
    expect(out.sent).toBe(0);
    expect(email).not.toHaveBeenCalled();
    expect(pendingCount(db)).toBe(1);
  });

  it('digestItem of one item is that item; of several is one summary', () => {
    expect(digestItem([it1('a')], NOW)).toEqual(it1('a'));
    const d = digestItem([it1('a'), it1('b')], NOW);
    expect(d.title).toBe('2 notifications');
    expect(d.body).toBe('Reply a; Reply b');
  });
});

describe('dispatchOnce - decision 6 holds for every outbound channel', () => {
  const online = (ids: string[]) => ({ ...deps({}), isOnline: (u: string) => ids.includes(u) });

  it('an online caller gets no instant email or push, even over the cap: consumed, not re-timed, not counted', async () => {
    const email = jest.fn().mockResolvedValue({ ok: true });
    const push = jest.fn().mockResolvedValue({ ok: true });
    for (let i = 0; i < 8; i++) put('u1', 'email', `e${i}`);
    for (let i = 0; i < 3; i++) put('u1', 'push', `p${i}`);
    const out = await dispatchOnce({ ...online(['u1']), senders: { email, push } });
    expect(email).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(out).toMatchObject({ sent: 0, retimed: 0, suppressed: 11 });
    expect(pendingCount(db)).toBe(0);
    expect(sentSince(db, 'u1', 'email', 0)).toEqual([]);
  });

  it('an online caller still gets a digest, and the Board channel is never suppressed', async () => {
    const email = jest.fn().mockResolvedValue({ ok: true });
    put('u1', 'email', 'a', { digest: true });
    put('u1', 'email', 'b', { digest: true });
    put('u1', 'board', 'c');
    const d = online(['u1']);
    await dispatchOnce({ ...d, senders: { email } });
    expect(email).toHaveBeenCalledTimes(1);
    expect(email.mock.calls[0][2]).toBe(true);
    expect(d.showBoard).toHaveBeenCalledTimes(1);
  });

  it('a caller who is not online is sent to as before', async () => {
    const email = jest.fn().mockResolvedValue({ ok: true });
    put('u2', 'email', 'a');
    await dispatchOnce({ ...online(['u1']), senders: { email } });
    expect(email).toHaveBeenCalledTimes(1);
  });
});

describe('unpause', () => {
  it('rows that piled up while paused go out as ONE grouped message per channel, not a burst of instants', async () => {
    setSettings(db, 'u1', { ...DEFAULT_SETTINGS, paused: true }, NOW - 5000);
    for (let i = 0; i < 10; i++) put('u1', 'email', `m${i}`, { deliverAfter: NOW - 4000 + i });
    const email = jest.fn().mockResolvedValue({ ok: true });
    await dispatchOnce(deps({ email }));
    expect(email).not.toHaveBeenCalled();
    setSettings(db, 'u1', { ...DEFAULT_SETTINGS, paused: false }, NOW);
    const out = await dispatchOnce(deps({ email }));
    expect(email).toHaveBeenCalledTimes(1);
    expect(email.mock.calls[0][1]).toHaveLength(10);
    expect(email.mock.calls[0][2]).toBe(true);
    expect(out).toMatchObject({ sent: 10, retimed: 0 });
    expect(pendingCount(db)).toBe(0);
  });

  it('rows still waiting for their digest slot keep it; saving settings without a pause change regroups nothing', async () => {
    setSettings(db, 'u1', { ...DEFAULT_SETTINGS, paused: true }, NOW);
    put('u1', 'email', 'later', { digest: true, deliverAfter: NOW + 3600 });
    put('u1', 'email', 'now');
    setSettings(db, 'u1', { ...DEFAULT_SETTINGS, paused: false }, NOW);
    const rows = db.prepare('SELECT ref, digest, deliver_after FROM notify_outbox ORDER BY ref').all();
    expect(rows.find((r: any) => r.ref.includes('later')).deliver_after).toBe(NOW + 3600);
    setSettings(db, 'u2', { ...DEFAULT_SETTINGS }, NOW);
    put('u2', 'email', 'x');
    setSettings(db, 'u2', { ...DEFAULT_SETTINGS, digestHour: 9 }, NOW);
    expect(db.prepare("SELECT digest FROM notify_outbox WHERE user_id = 'u2'").get().digest).toBe(0);
  });
});

describe('digest slots (audit of plan section 6)', () => {
  const at = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

  it('a weekly digest lands on digest_weekday at digest_hour in the caller zone, defaulting to the board zone', () => {
    const base = { ...DEFAULT_SETTINGS, digestKind: 'weekly' as const, digestHour: 9, digestWeekday: 1 };
    setPrefs(db, 'w1', { 'msg.reply': { email: 'digest' } });
    setSettings(db, 'w1', { ...base, timeZone: 'Europe/Oslo' }, NOW);
    setPrefs(db, 'w2', { 'msg.reply': { email: 'digest' } });
    setSettings(db, 'w2', { ...base, timeZone: null }, NOW);
    const wed = at('2026-10-14T12:00:00Z');
    queueNotification(db, 'w1', { ...it1('w'), at: wed }, wed, 'UTC');
    queueNotification(db, 'w2', { ...it1('w'), at: wed }, wed, 'UTC');
    const slot = (u: string): number => db.prepare('SELECT deliver_after FROM notify_outbox WHERE user_id = ?').get(u).deliver_after;
    expect(slot('w1')).toBe(at('2026-10-19T07:00:00Z'));  // Monday 09:00 Oslo (CEST, UTC+2)
    expect(slot('w2')).toBe(at('2026-10-19T09:00:00Z'));  // board zone UTC
  });

  it('an empty digest is not sent: no rows, no message', async () => {
    const email = jest.fn().mockResolvedValue({ ok: true });
    const out = await dispatchOnce(deps({ email }));
    expect(email).not.toHaveBeenCalled();
    expect(out.sent).toBe(0);
  });

  it('a row queued for the NEXT slot while this slot is due is not pulled into this digest', async () => {
    const email = jest.fn().mockResolvedValue({ ok: true });
    put('u1', 'email', 'a', { digest: true });
    put('u1', 'email', 'b', { digest: true });
    put('u1', 'email', 'next', { digest: true, deliverAfter: NOW + 86400 });
    await dispatchOnce(deps({ email }));
    expect(email.mock.calls[0][1]).toHaveLength(2);
    expect(pendingCount(db)).toBe(1);
  });
});
