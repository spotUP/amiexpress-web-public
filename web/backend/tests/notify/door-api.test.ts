/**
 * bbs.notifications(): the door's only road to the board's notification rows.
 * The caller is the SESSION's user, sysop-only events are hidden from
 * everyone else, a channel an event does not offer is refused, a conference
 * the caller cannot enter cannot be followed, and the logon offer is made once.
 */
import { doorNotificationsApi, checkSettings } from '../../src/notify/door-api';
import type { NotificationsDeps } from '../../src/notify/door-api';
import { DEFAULT_SETTINGS } from '@amiexpress/bbs-door-sdk/formats/notify';
import { getFollows, getPrefs, markOffered, needsOffer } from '../../src/notify/repository';
import { waitForTestDb, putUser } from './helpers';

let handle: any;
beforeAll(async () => { handle = (await waitForTestDb()).db; }, 30000);
beforeEach(() => {
  for (const t of ['notify_prefs', 'notify_follow', 'notify_settings', 'notify_inbox']) handle.prepare(`DELETE FROM ${t}`).run();
  putUser(handle, 'u1', 'one@example.com');
  putUser(handle, 'u2', 'two@example.com');
});

const sysops = new Set<string>();
const access = new Map<string, Set<number>>();
function deps(over: Partial<NotificationsDeps> = {}): NotificationsDeps {
  return {
    rawDb: () => handle, now: () => 1_000_000, smtpConfigured: async () => true, pushAvailable: () => false, vapidKey: () => null, pushSender: async () => ({ ok: false, error: 'no subscribed browser', retry: true }),
    conferences: async () => [{ id: 1, name: 'General' }, { id: 2, name: 'Secret' }],
    hasConfAccess: (_d, u, c) => access.get(u)?.has(c) ?? false,
    isSysop: (_d, u) => sysops.has(u),
    verify: { send: async () => ({ ok: true }), now: () => 1_000_000, makeCode: () => '123456', bbsName: async () => 'Test' },
    emailSender: async () => ({ ok: true }), boardZone: () => 'UTC', doorEvents: () => [], ...over,
  };
}
const as = (id: string, d = deps()) => doorNotificationsApi({ user: { id } }, d);

describe('bbs.notifications()', () => {
  beforeEach(() => { sysops.clear(); access.clear(); access.set('u1', new Set([1])); });

  it('writes the SESSION user\'s rows and nobody else\'s', async () => {
    const res = await as('u1').set({ 'msg.reply': { email: 'instant' } }, DEFAULT_SETTINGS);
    expect(res.ok).toBe(true);
    expect(getPrefs(handle, 'u1')['msg.reply']).toEqual({ email: 'instant' });
    expect(getPrefs(handle, 'u2')).toEqual({});
    await expect(doorNotificationsApi({ user: null }, deps()).get()).rejects.toThrow('not available');
  });

  it('hides sysop-only events from a caller who is not a sysop (disk check), shows them to a sysop', async () => {
    expect((await as('u1').catalogue()).events.map((e) => e.id)).not.toContain('page.sysop');
    sysops.add('u1');
    expect((await as('u1').catalogue()).events.map((e) => e.id)).toContain('page.sysop');
    sysops.delete('u1');
    const r = await as('u1').set({ 'page.sysop': { email: 'instant' } }, DEFAULT_SETTINGS);
    expect(r).toEqual({ ok: false, error: 'unknown event page.sysop' });
  });

  it('refuses a channel the event does not offer, and a delivering mode on a channel the board cannot deliver', async () => {
    const board = await as('u1').set({ 'mail.private': { board: 'instant' } }, DEFAULT_SETTINGS);
    expect(board.ok).toBe(false);
    const push = await as('u1').set({ 'msg.reply': { push: 'instant' } }, DEFAULT_SETTINGS);
    expect(push).toEqual({ ok: false, error: 'push is not available on this board' });
    expect((await as('u1').set({ 'msg.reply': { push: 'off' } }, DEFAULT_SETTINGS)).ok).toBe(true);
    const noMail = await as('u1', deps({ smtpConfigured: async () => false })).set({ 'msg.reply': { email: 'digest' } }, DEFAULT_SETTINGS);
    expect(noMail.ok).toBe(false);
    expect(getPrefs(handle, 'u1')['msg.reply']).toEqual({ push: 'off' });
  });

  it('reports what the board can deliver now', async () => {
    expect((await as('u1').catalogue()).deliverable).toEqual({ email: true, push: false, board: true });
    expect((await as('u1', deps({ smtpConfigured: async () => false })).catalogue()).deliverable.email).toBe(false);
  });

  it('lists and follows only conferences the caller may enter', async () => {
    expect((await as('u1').catalogue()).conferences).toEqual([{ id: 1, name: 'General' }]);
    expect(await as('u1').follow([1])).toEqual({ ok: true, follows: [1] });
    expect(await as('u1').follow([1, 2])).toEqual({ ok: false, error: 'no access to conference 2' });
    expect(getFollows(handle, 'u1')).toEqual([1]);
  });

  it('validates settings instead of trusting the door', () => {
    expect(checkSettings({ ...DEFAULT_SETTINGS, quietFrom: '25:00', quietTo: '07:00' }).ok).toBe(false);
    expect(checkSettings({ ...DEFAULT_SETTINGS, quietFrom: '22:00' }).ok).toBe(false);
    expect(checkSettings({ ...DEFAULT_SETTINGS, timeZone: 'Mars/Base' }).ok).toBe(false);
    expect(checkSettings({ ...DEFAULT_SETTINGS, digestKind: 'weekly', digestWeekday: 9 }).ok).toBe(false);
    const ok = checkSettings({ ...DEFAULT_SETTINGS, quietFrom: '9:30', quietTo: '07:00', timeZone: 'Europe/Stockholm' });
    expect(ok.ok && ok.settings.quietFrom).toBe('09:30');
  });

  it('Send Test goes through the real sender and reports its failure; board test lands in the inbox', async () => {
    const calls: unknown[] = [];
    const d = deps({ emailSender: async (u, items) => { calls.push([u, items[0].event]); return { ok: false, error: 'email address not verified', retry: true }; } });
    expect(await as('u1', d).test('email')).toEqual({ ok: false, error: 'email address not verified' });
    expect(calls).toEqual([['u1', 'notify.test']]);
    expect((await as('u1').test('board')).ok).toBe(true);
    expect(handle.prepare('SELECT COUNT(*) n FROM notify_inbox WHERE user_id = ?').get('u1').n).toBe(1);
    expect((await as('u1').test('push')).ok).toBe(false);
  });

  it('verification: mails a code to the account address and confirms it', async () => {
    const sent: string[] = [];
    const d = deps({ verify: { ...deps().verify, send: async (to) => { sent.push(to); return { ok: true }; } } });
    const api = as('u1', d);
    expect((await api.startEmailVerification()).ok).toBe(true);
    expect(sent).toEqual(['one@example.com']);
    expect((await api.confirmEmail('000000')).ok).toBe(false);
    expect((await api.confirmEmail('123456')).ok).toBe(true);
    expect((await api.get()).email).toEqual({ address: 'one@example.com', verified: true });
  });

  it('opening NOTIFY (get) counts as having been offered it', async () => {
    expect(needsOffer(handle, 'u1')).toBe(true);
    await as('u1').get();
    expect(needsOffer(handle, 'u1')).toBe(false);
  });
});

describe('the logon offer', () => {
  it('is made once to a caller who never set NOTIFY up, never again, and never to one who opened it', () => {
    const { drainNotifyInbox } = require('../../src/notify/board');
    const wire: string[] = [];
    const socket = { emit: (_e: string, d: string) => { wire.push(d); } };
    const deps2 = { rawDb: () => handle, now: () => 5_000_000 };
    const session = { user: { id: 'u1' }, screenWidth: 80 };
    expect(drainNotifyInbox(socket, session, deps2)).toBe(1);
    expect(wire.join('')).toContain('NOTIFY');
    wire.length = 0;
    expect(drainNotifyInbox(socket, session, deps2)).toBe(0);
    expect(wire).toEqual([]);
    markOffered(handle, 'u2', 1);
    expect(drainNotifyInbox(socket, { user: { id: 'u2' }, screenWidth: 80 }, deps2)).toBe(0);
  });
});
