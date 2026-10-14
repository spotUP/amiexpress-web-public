/**
 * A REPLY REACHES THE AUTHOR BY EMAIL (plan 2026-10-14-notification-door.md section 9).
 *
 * The one test that proves the sites are WIRED: a reply posted through the
 * board's message funnel (Database.createMessage - what the message editor,
 * doors, AREXX and the co-sysop all call) ends, one dispatcher tick later, in
 * the real email sender (notify/email.ts) with an injected transport: sent
 * exactly once to the author's VERIFIED address, naming the replier, with the
 * List-Unsubscribe header; the outbox row is gone; a second tick sends nothing.
 *
 * BBSApi.postMessage cannot post a reply (it has no parent argument), so the
 * funnel it shares with every writer is the driver.
 */
jest.mock('../../src/services/MessageFileManager', () => ({
  messageFileManager: { writeMessageFile: jest.fn(), deleteMessageFile: jest.fn() },
}));
jest.mock('../../src/services/MessageIndexManager', () => ({
  messageIndexManager: { getNextMessageNumber: jest.fn().mockReturnValue(1), appendMessageHeader: jest.fn(), deleteMessageHeader: jest.fn() },
  MsgStatus: { NORMAL: 0, PRIVATE: 1 },
}));

import { dispatchOnce, _resetPurgeClockForTests } from '../../src/notify/dispatcher';
import type { ChannelSender, DispatcherDeps } from '../../src/notify/dispatcher';
import { makeEmailSender } from '../../src/notify/email';
import { pendingCount, setPrefs } from '../../src/notify/repository';

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

let board: any;
let raw: any;

beforeAll(async () => {
  board = await waitForTestDb();
  raw = board.db;
}, 30000);

beforeEach(() => {
  for (const t of ['notify_prefs', 'notify_outbox', 'notify_settings']) raw.exec(`DELETE FROM ${t}`);
  raw.exec(`DELETE FROM users WHERE id LIKE 'rr-%'`);
  raw.exec(`DELETE FROM messages WHERE subject LIKE 'rr-%'`);
  _resetPurgeClockForTests();
  const add = raw.prepare(`INSERT INTO users (id, username, passwordhash, realname, email) VALUES (?, ?, 'x', 'r', ?)`);
  add.run('rr-author', 'rr_author', 'author@example.com');
  raw.prepare("INSERT INTO notify_settings (user_id, email_verified, email_verified_at) VALUES ('rr-author', 'author@example.com', 1) ON CONFLICT(user_id) DO UPDATE SET email_verified = excluded.email_verified").run();
  add.run('rr-replier', 'rr_replier', 'replier@example.com');
});

describe('a reply posted on the board reaches its author', () => {
  it('queues, sends once through the email sender, and a second tick sends nothing', async () => {
    // The author chose email, instant - set the way the door will (prefs rows).
    setPrefs(raw, 'rr-author', { 'msg.reply': { email: 'instant' } });
    const parentId = await board.createMessage({ subject: 'rr-thread', body: 'first', author: 'rr_author', timestamp: new Date(), conferenceId: 1, messageBaseId: 1, isPrivate: false, attachments: [], edited: false }, { skipDiskWrite: true });

    const send = jest.fn(async (_to: string, _subject: string, _text: string, _headers?: Record<string, string>) => ({ ok: true as const }));
    const email: ChannelSender = makeEmailSender({
      rawDb: () => raw, send: send as any, isOnline: () => false, baseUrl: () => 'https://bbs.example', bbsName: async () => 'TestBBS',
    });
    const deps: DispatcherDeps = {
      rawDb: () => raw, now: () => Date.now(), log: () => undefined, boardZone: () => 'UTC',
      senders: { email }, showBoard: () => 'dropped',
    };

    // The real entry point: the funnel every writer shares.
    await board.createMessage({ subject: 'Re: rr-thread', body: 'agreed', author: 'rr_replier', timestamp: new Date(), conferenceId: 1, messageBaseId: 1, isPrivate: false, parentId, attachments: [], edited: false }, { skipDiskWrite: true });
    expect(pendingCount(raw)).toBe(1);

    await dispatchOnce(deps);
    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject, text, headers] = send.mock.calls[0];
    expect(to).toBe('author@example.com');
    expect(subject).toContain('Reply from rr_replier');
    expect(text).toContain('Reply from rr_replier');
    expect(headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/bbs\.example\//);
    expect(pendingCount(raw)).toBe(0);

    await dispatchOnce(deps);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('the replier posting in their own thread sends the author-poster nothing', async () => {
    setPrefs(raw, 'rr-author', { 'msg.reply': { email: 'instant' } });
    const parentId = await board.createMessage({ subject: 'rr-own', body: 'x', author: 'rr_author', timestamp: new Date(), conferenceId: 1, messageBaseId: 1, isPrivate: false, attachments: [], edited: false }, { skipDiskWrite: true });
    await board.createMessage({ subject: 'Re: rr-own', body: 'y', author: 'rr_author', timestamp: new Date(), conferenceId: 1, messageBaseId: 1, isPrivate: false, parentId, attachments: [], edited: false }, { skipDiskWrite: true });
    expect(pendingCount(raw)).toBe(0);
  });
});
