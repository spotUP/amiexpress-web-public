/**
 * Push for callers (phase N5): who a page reaches, what the sender does with a
 * dead browser, and how a browser gets subscribed for the SESSION's user.
 */
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';
import { doorNotificationsApi } from '../../src/notify/door-api';
import type { NotificationsDeps } from '../../src/notify/door-api';
import { acceptPushSubscription, buildPushPayload, makePushSender, requestPushSubscription, validEndpoint } from '../../src/notify/push';
import type { PushDeps } from '../../src/notify/push';
import { notifyPushOf, saveNotifyPush } from '../../src/notify/repository';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';
import { putUser, waitForTestDb } from './helpers';

let raw: any;
let repo: OperatorChatRepository;
const NOW = 1_800_000_000;
const sub = (n: string) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: `pp-${n}-0000000`, auth: `aa-${n}-0000000` } });
const item = (id: string, over: Partial<NotifyItem> = {}): NotifyItem => ({ event: 'msg.reply', title: `Reply ${id}`, body: `body ${id}`, at: NOW, objectId: id, ...over });

beforeAll(async () => { raw = (await waitForTestDb()).db; repo = new OperatorChatRepository(raw); }, 30000);
beforeEach(() => {
  raw.exec('DELETE FROM operator_push_subscriptions');
  putUser(raw, 'u1', 'one@example.com');
  putUser(raw, 'u2', 'two@example.com');
});

describe('a caller\'s browser never receives a sysop page (R1 hazard)', () => {
  it('the operator page lists operator browsers only, however many callers subscribed', () => {
    repo.savePushSubscription('sysop1', sub('sysop'));
    saveNotifyPush(raw, 'u1', sub('caller1'), null, NOW);
    saveNotifyPush(raw, 'u2', sub('caller2'), null, NOW);
    expect(repo.getAllPushSubscriptions('operator').map((s) => s.endpoint)).toEqual(['https://push.example/sysop']);
    expect(repo.getAllPushSubscriptions('notify').map((s) => s.endpoint).sort()).toEqual(['https://push.example/caller1', 'https://push.example/caller2']);
  });

  it('a sysop\'s own status and removal ignore their caller browser', () => {
    saveNotifyPush(raw, 'u1', sub('caller1'), null, NOW);
    expect(repo.hasPushSubscriptions('u1')).toBe(false);
    repo.removePushSubscriptionsForSysop('u1');
    expect(notifyPushOf(raw, 'u1')).toHaveLength(1);
  });

  it('a caller cannot take over a browser the sysop registered, and the sysop can claim one', () => {
    repo.savePushSubscription('sysop1', sub('shared'));
    expect(saveNotifyPush(raw, 'u1', sub('shared'), null, NOW)).toBe(false);
    expect(repo.getAllPushSubscriptions('operator')).toHaveLength(1);
    saveNotifyPush(raw, 'u2', sub('mine'), null, NOW);
    repo.savePushSubscription('sysop1', sub('mine'));
    expect(notifyPushOf(raw, 'u2')).toHaveLength(0);
  });
});

function pushDeps(over: Partial<PushDeps> = {}): PushDeps & { send: jest.Mock } {
  return {
    rawDb: () => raw, enabled: () => true, baseUrl: () => 'https://bbs.example',
    send: jest.fn(async (subs: any[]) => subs.map((s) => ({ subscription: s, success: true, gone: false }))),
    ...over,
  } as any;
}

describe('the push sender', () => {
  it('removes a browser the push service reports gone (404/410), keeps one that merely failed, and still succeeds', async () => {
    saveNotifyPush(raw, 'u1', sub('ok'), null, NOW);
    saveNotifyPush(raw, 'u1', sub('dead'), null, NOW);
    saveNotifyPush(raw, 'u1', sub('flaky'), null, NOW);
    const d = pushDeps({
      send: jest.fn(async (subs: any[]) => subs.map((s) => ({
        subscription: s, success: s.endpoint.endsWith('/ok'), gone: s.endpoint.endsWith('/dead'),
      }))) as any,
    });
    expect(await makePushSender(d)('u1', [item('1')], false)).toEqual({ ok: true });
    expect(notifyPushOf(raw, 'u1').map((r) => r.endpoint).sort()).toEqual(['https://push.example/flaky', 'https://push.example/ok']);
  });

  it('sends nothing to another caller\'s browser or a sysop\'s', async () => {
    saveNotifyPush(raw, 'u2', sub('other'), null, NOW);
    repo.savePushSubscription('sysop1', sub('sysop'));
    const d = pushDeps();
    const res = await makePushSender(d)('u1', [item('1')], false);
    expect(res).toMatchObject({ ok: false, retry: true });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('holds (retryable) when every browser failed without being gone, and when the board has no VAPID keys', async () => {
    saveNotifyPush(raw, 'u1', sub('a'), null, NOW);
    const failing = pushDeps({ send: jest.fn(async (subs: any[]) => subs.map((s) => ({ subscription: s, success: false, gone: false }))) as any });
    expect(await makePushSender(failing)('u1', [item('1')], false)).toMatchObject({ ok: false, retry: true });
    expect(notifyPushOf(raw, 'u1')).toHaveLength(1);
    const dark = pushDeps({ enabled: () => false });
    expect(await makePushSender(dark)('u1', [item('1')], false)).toMatchObject({ ok: false, retry: true });
    expect(dark.send).not.toHaveBeenCalled();
  });

  it('a digest is ONE push per browser, with the board URL as data.url', async () => {
    saveNotifyPush(raw, 'u1', sub('a'), null, NOW);
    const d = pushDeps();
    await makePushSender(d)('u1', [item('1'), item('2'), item('3')], true);
    expect(d.send).toHaveBeenCalledTimes(1);
    const payload = d.send.mock.calls[0][1];
    expect(payload.title).toBe('3 notifications');
    expect(payload.data.url).toBe('https://bbs.example');
    expect(payload.actions).toEqual([]);
  });

  it('private mail carries its title only', () => {
    const p = buildPushPayload([item('m', { event: 'mail.private', title: 'New private mail from Sven', body: 'SECRET SUBJECT' })], false, 'https://x');
    expect(p.title).toBe('New private mail from Sven');
    expect(JSON.stringify(p)).not.toContain('SECRET');
  });
});

const socket = () => ({ emit: jest.fn() });
function apiDeps(over: Partial<NotificationsDeps> = {}): NotificationsDeps {
  return {
    rawDb: () => raw, now: () => 1_000_000, smtpConfigured: async () => true, pushAvailable: () => true, vapidKey: () => 'KEY123',
    pushSender: async () => ({ ok: true }), conferences: async () => [], hasConfAccess: () => true, isSysop: () => false,
    verify: { send: async () => ({ ok: true }), now: () => 1, makeCode: () => '1', bbsName: async () => 'T' },
    emailSender: async () => ({ ok: true }), boardZone: () => 'UTC', pushTimeoutMs: 200, ...over,
  } as NotificationsDeps;
}

describe('enablePush / disablePush', () => {
  it('asks the caller\'s own socket for a subscription and saves the answer under the SESSION user, ignoring any id in it', async () => {
    const session = { user: { id: 'u1' }, connectionType: 'web' };
    const sock = socket();
    const pending = doorNotificationsApi(session, apiDeps(), sock).enablePush();
    expect(sock.emit).toHaveBeenCalledWith('notify:push-subscribe', { publicKey: 'KEY123' });
    const ok = acceptPushSubscription(session, { ...sub('b1'), userId: 'u2', sysop_id: 'u2', userAgent: 'UA' }, () => raw);
    expect(ok).toBe(true);
    expect(await pending).toMatchObject({ ok: true });
    expect(notifyPushOf(raw, 'u1').map((r) => r.endpoint)).toEqual(['https://push.example/b1']);
    expect(notifyPushOf(raw, 'u2')).toHaveLength(0);
    expect(raw.prepare('SELECT purpose FROM operator_push_subscriptions').get().purpose).toBe('notify');
  });

  it('drops an answer nobody asked for, a bad endpoint, and surfaces a refusal from the browser', async () => {
    const session = { user: { id: 'u1' }, connectionType: 'web' };
    expect(acceptPushSubscription(session, sub('x'), () => raw)).toBe(false);
    expect(notifyPushOf(raw, 'u1')).toHaveLength(0);

    const api = doorNotificationsApi(session, apiDeps(), socket());
    const bad = api.enablePush();
    acceptPushSubscription(session, { endpoint: 'http://127.0.0.1/x', keys: sub('x').keys }, () => raw);
    expect(await bad).toMatchObject({ ok: false });
    expect(notifyPushOf(raw, 'u1')).toHaveLength(0);

    const denied = api.enablePush();
    acceptPushSubscription(session, { error: 'notifications are blocked in this browser' }, () => raw);
    expect(await denied).toEqual({ ok: false, error: 'notifications are blocked in this browser' });
  });

  it('refuses on a telnet session, with no VAPID keys, and times out when the browser is silent', async () => {
    const sock = socket();
    expect(await doorNotificationsApi({ user: { id: 'u1' }, connectionType: 'telnet' } as any, apiDeps(), sock).enablePush())
      .toEqual({ ok: false, error: 'push needs the web terminal' });
    expect(await doorNotificationsApi({ user: { id: 'u1' } }, apiDeps({ pushAvailable: () => false }), sock).enablePush())
      .toMatchObject({ ok: false });
    expect(sock.emit).not.toHaveBeenCalled();
    expect(await doorNotificationsApi({ user: { id: 'u1' } }, apiDeps(), sock).enablePush()).toEqual({ ok: false, error: 'the browser did not answer' });
  });

  it('a new request replaces the one waiting', async () => {
    const session = {};
    const first = requestPushSubscription(session, socket(), { enabled: () => true, vapidKey: () => 'K', timeoutMs: 1000 });
    const second = requestPushSubscription(session, socket(), { enabled: () => true, vapidKey: () => 'K', timeoutMs: 20 });
    expect(await first).toMatchObject({ ok: false });
    expect(await second).toMatchObject({ ok: false });
  });

  it('disablePush removes every notify browser of the session user, not a sysop\'s or another caller\'s', async () => {
    saveNotifyPush(raw, 'u1', sub('a'), null, NOW);
    saveNotifyPush(raw, 'u1', sub('b'), null, NOW);
    saveNotifyPush(raw, 'u2', sub('c'), null, NOW);
    repo.savePushSubscription('u1', sub('sysop'));
    const res = await doorNotificationsApi({ user: { id: 'u1' } }, apiDeps()).disablePush();
    expect(res).toMatchObject({ ok: true });
    expect(notifyPushOf(raw, 'u1')).toHaveLength(0);
    expect(notifyPushOf(raw, 'u2')).toHaveLength(1);
    expect(repo.getAllPushSubscriptions('operator')).toHaveLength(1);
  });

  it('get() reports how many browsers receive push; Send Test goes through the push sender', async () => {
    saveNotifyPush(raw, 'u1', sub('a'), null, NOW);
    const sender = jest.fn(async () => ({ ok: true as const }));
    const api = doorNotificationsApi({ user: { id: 'u1' } }, apiDeps({ pushSender: sender }));
    expect((await api.get()).pushBrowsers).toBe(1);
    expect(await api.test('push')).toMatchObject({ ok: true });
    expect(sender).toHaveBeenCalledTimes(1);
  });
});

describe('endpoints the board will POST to', () => {
  it('accepts public https push services and refuses local, plain-http and IP-literal addresses', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x']) expect(validEndpoint(ok)).toBe(true);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://printer.local/x', 'https://u:p@fcm.googleapis.com/x', 'notaurl', 'https://intranet/x'])
      expect([bad, validEndpoint(bad)]).toEqual([bad, false]);
  });
});
