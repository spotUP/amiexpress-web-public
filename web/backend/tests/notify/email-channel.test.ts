/**
 * The Email channel: who it sends to, what it says, when it stays quiet.
 */
import { makeEmailSender, buildEmail } from '../../src/notify/email';
import type { EmailDeps } from '../../src/notify/email';
import { dispatchOnce, _resetPurgeClockForTests } from '../../src/notify/dispatcher';
import type { DispatcherDeps } from '../../src/notify/dispatcher';
import { enqueue, markEmailVerified, pendingCount } from '../../src/notify/repository';
import { verifyUnsubscribeToken } from '../../src/notify/unsubscribe';
import { notifyRef } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';
import { putUser, waitForTestDb } from './helpers';

let db: any;
const NOW = 1_800_000_000;
const reply = (id: string): NotifyItem => ({ event: 'msg.reply', title: `Reply ${id}`, body: 'text of the reply', at: NOW, objectId: id });
const priv: NotifyItem = { event: 'mail.private', title: 'New private mail from Sven', body: 'SECRET SUBJECT and body text', url: 'https://x/secret', at: NOW, objectId: 'm1' };

function deps(over: Partial<EmailDeps> = {}): EmailDeps & { send: jest.Mock } {
  return {
    rawDb: () => db,
    send: jest.fn().mockResolvedValue({ ok: true }),
    baseUrl: () => 'https://bbs.example',
    bbsName: async () => 'Test BBS',
    ...over,
  } as any;
}

beforeAll(async () => { db = (await waitForTestDb()).db; }, 30000);
beforeEach(() => {
  for (const t of ['notify_outbox', 'notify_settings', 'notify_sent_log']) db.exec(`DELETE FROM ${t}`);
  _resetPurgeClockForTests();
  putUser(db, 'u1', 'Sven@Example.com');
});

describe('email goes only to the verified address', () => {
  it('sends to the account address when the verified one matches, ignoring case and blanks', async () => {
    markEmailVerified(db, 'u1', ' sven@example.COM ', NOW);
    const d = deps();
    const res = await makeEmailSender(d)('u1', [reply('1')], false);
    expect(res).toEqual({ ok: true });
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send.mock.calls[0][0]).toBe('Sven@Example.com');
  });

  it('holds (retryable, nothing sent) for a caller who never verified', async () => {
    const d = deps();
    const res = await makeEmailSender(d)('u1', [reply('1')], false);
    expect(res).toMatchObject({ ok: false, retry: true });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('holds when the account address changed after verification', async () => {
    markEmailVerified(db, 'u1', 'old@example.com', NOW);
    const d = deps();
    expect((await makeEmailSender(d)('u1', [reply('1')], false)).ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('through the dispatcher an unverified caller\'s row stays in the outbox, and is sent after verifying', async () => {
    enqueue(db, { ref: notifyRef('msg.reply', '1', 'u1', 'email'), userId: 'u1', channel: 'email', item: reply('1'), deliverAfter: NOW, digest: false }, NOW);
    const d = deps();
    const dd: DispatcherDeps = { rawDb: () => db, now: () => NOW * 1000, log: jest.fn(), boardZone: () => 'UTC', senders: { email: makeEmailSender(d) }, showBoard: jest.fn() as any };
    await dispatchOnce(dd);
    expect(pendingCount(db)).toBe(1);
    expect(d.send).not.toHaveBeenCalled();
    markEmailVerified(db, 'u1', 'sven@example.com', NOW);
    db.exec('UPDATE notify_outbox SET next_attempt_at = 0');
    await dispatchOnce(dd);
    expect(pendingCount(db)).toBe(0);
    expect(d.send).toHaveBeenCalledTimes(1);
  });
});

describe('what the email carries', () => {
  beforeEach(() => markEmailVerified(db, 'u1', 'sven@example.com', NOW));

  it('private mail names the sender only: no subject, body or link', async () => {
    const d = deps();
    await makeEmailSender(d)('u1', [priv], false);
    const [, subject, text] = d.send.mock.calls[0];
    expect(subject).toContain('New private mail from Sven');
    expect(text).toContain('New private mail from Sven');
    for (const leak of ['SECRET', 'body text', 'https://x/secret']) {
      expect(subject).not.toContain(leak);
      expect(text).not.toContain(leak);
    }
  });

  it('private mail inside a digest is listed by its title only', () => {
    const b = buildEmail([priv, reply('2')], true, 'Test BBS', 'https://bbs.example', 'https://u');
    expect(b.text).toContain('- New private mail from Sven');
    expect(b.text).not.toContain('SECRET');
    expect(b.text).toContain('text of the reply');
  });

  it('a digest is one email listing every item', async () => {
    const d = deps();
    await makeEmailSender(d)('u1', [reply('1'), reply('2'), reply('3')], true);
    expect(d.send).toHaveBeenCalledTimes(1);
    const [, subject, text] = d.send.mock.calls[0];
    expect(subject).toBe('Test BBS: 3 notifications');
    for (const n of ['1', '2', '3']) expect(text).toContain(`- Reply ${n}`);
  });

  it('carries RFC 8058 headers whose link is a valid unsubscribe token for that event', async () => {
    const d = deps();
    await makeEmailSender(d)('u1', [reply('1')], false);
    const headers = d.send.mock.calls[0][3];
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const link = /^<(https:\/\/bbs\.example\/notify\/unsubscribe\?t=[^>]+)>$/.exec(headers['List-Unsubscribe'])![1];
    const claims = verifyUnsubscribeToken(decodeURIComponent(link.split('?t=')[1]));
    expect(claims).toEqual({ userId: 'u1', evt: 'msg.reply' });
    expect(d.send.mock.calls[0][2]).toContain(link);
  });

  it('a mixed digest\'s link pauses everything', async () => {
    const d = deps();
    await makeEmailSender(d)('u1', [reply('1'), priv], true);
    const link = /<([^>]+)>/.exec(d.send.mock.calls[0][3]['List-Unsubscribe'])![1];
    expect(verifyUnsubscribeToken(decodeURIComponent(link.split('?t=')[1]))?.evt).toBe('all');
  });
});
