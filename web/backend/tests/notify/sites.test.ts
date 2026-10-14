/**
 * The notification sites, each at the level it lives: who receives what.
 * (The wiring - a real reply reaching a sender through the funnel - is the ONE
 * reachability test, a-reply-reaches-the-author-by-email.test.ts.)
 */
jest.mock('../../src/services/MessageFileManager', () => ({
  messageFileManager: { writeMessageFile: jest.fn(), deleteMessageFile: jest.fn() },
}));
jest.mock('../../src/services/MessageIndexManager', () => ({
  messageIndexManager: { getNextMessageNumber: jest.fn().mockReturnValue(1), appendMessageHeader: jest.fn(), deleteMessageHeader: jest.fn() },
  MsgStatus: { NORMAL: 0, PRIVATE: 1 },
}));

import { MessageRepository } from '../../src/database/message-repository';
import {
  notifyFileFiled, notifyFromDoor, notifyMagazine, notifyMessage, notifySysopPage, notifyUnlock,
} from '../../src/notify/sites';
import type { SiteDeps } from '../../src/notify/sites';
import { setFollows, setPrefs } from '../../src/notify/repository';
import { SYSOP_LEVEL } from '../../src/server/socket-guard';

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
const NOW_MS = 1_800_000_000_000;
// The disk record is stood in for here (account.ts is tested against a mocked
// user.data in sites-read-the-disk.test.ts): a user is a sysop when the test row says so.
const testIsSysop = (h: any, id: string): boolean => ((h.prepare('SELECT seclevel FROM users WHERE id = ?').get(id) as any)?.seclevel ?? 0) >= SYSOP_LEVEL;
const deps = (hasConfAccess: SiteDeps['hasConfAccess'] = () => true): SiteDeps => ({ rawDb: () => db, now: () => NOW_MS, hasConfAccess, isSysop: testIsSysop });

const addUser = (id: string, username: string, seclevel = 10, confaccess = 'XXX'): void => {
  db.prepare(`INSERT INTO users (id, username, passwordhash, realname, email, seclevel, confaccess) VALUES (?, ?, 'x', 'r', ?, ?, ?)`)
    .run(id, username, `${id}@example.com`, seclevel, confaccess);
};
const outbox = (): { user_id: string; channel: string; event: string; payload: any }[] =>
  (db.prepare('SELECT user_id, channel, event, payload FROM notify_outbox ORDER BY ref').all() as any[]).map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
const usersInOutbox = (): string[] => outbox().map((r) => r.user_id).sort();

beforeAll(async () => { db = (await waitForTestDb()).db; }, 30000);

beforeEach(() => {
  for (const t of ['notify_prefs', 'notify_outbox', 'notify_follow', 'notify_settings']) db.exec(`DELETE FROM ${t}`);
  db.exec(`DELETE FROM users WHERE id LIKE 'ns-%'`);
  db.exec(`DELETE FROM messages WHERE subject LIKE 'ns-%'`);
  addUser('ns-alice', 'ns_alice');
  addUser('ns-bob', 'ns_bob');
  addUser('ns-sysop', 'ns_sysop', SYSOP_LEVEL);
});

describe('message site', () => {
  it('private mail tells the addressee the sender and nothing else', () => {
    setPrefs(db, 'ns-alice', { 'mail.private': { email: 'instant' } });
    expect(notifyMessage({ author: 'ns_bob', subject: 'ns-secret subject', isPrivate: true, toUser: 'NS_ALICE' }, 11, deps())).toBe(1);
    const [row] = outbox();
    expect(row.user_id).toBe('ns-alice');
    expect(row.payload.title).toBe('New private mail from ns_bob');
    expect(row.payload.body).toBe('');
    expect(JSON.stringify(row.payload)).not.toContain('secret');
  });

  it('mail a caller sends to themself, or to nobody, notifies no one', () => {
    setPrefs(db, 'ns-bob', { 'mail.private': { email: 'instant' } });
    expect(notifyMessage({ author: 'ns_bob', subject: 'ns-x', isPrivate: true, toUser: 'ns_bob' }, 12, deps())).toBe(0);
    expect(notifyMessage({ author: 'ns_bob', subject: 'ns-x', isPrivate: true, toUser: 'ghost' }, 13, deps())).toBe(0);
  });

  it('a reply tells the parent author and never the poster', () => {
    db.prepare(`INSERT INTO messages (id, subject, body, author, conferenceid, messagebaseid) VALUES (9001, 'ns-thread', 'b', 'ns_alice', 1, 1)`).run();
    setPrefs(db, 'ns-alice', { 'msg.reply': { email: 'instant' } });
    setPrefs(db, 'ns-bob', { 'msg.reply': { email: 'instant' } });
    expect(notifyMessage({ author: 'ns_bob', subject: 'Re: ns-thread', parentId: 9001 }, 9002, deps())).toBe(1);
    expect(usersInOutbox()).toEqual(['ns-alice']);
    // alice replying to her own thread: she is the parent author AND the poster.
    expect(notifyMessage({ author: 'ns_alice', subject: 'Re: ns-thread', parentId: 9001 }, 9003, deps())).toBe(0);
    expect(usersInOutbox()).toEqual(['ns-alice']);
  });

  it('a private reply is mail, not also a reply notice', () => {
    db.prepare(`INSERT INTO messages (id, subject, body, author, conferenceid, messagebaseid) VALUES (9010, 'ns-thread', 'b', 'ns_alice', 1, 1)`).run();
    setPrefs(db, 'ns-alice', { 'msg.reply': { email: 'instant' }, 'mail.private': { email: 'instant' } });
    notifyMessage({ author: 'ns_bob', subject: 'Re: ns-thread', parentId: 9010, isPrivate: true, toUser: 'ns_alice' }, 9011, deps());
    expect(outbox().map((r) => r.event)).toEqual(['mail.private']);
  });

  it('createMessage tells the recipient, and an import (skipNotify) tells nobody', async () => {
    setPrefs(db, 'ns-alice', { 'mail.private': { email: 'instant' } });
    const repo = new MessageRepository(db);
    const mail = { subject: 'ns-mail', body: 'b', author: 'ns_bob', timestamp: new Date(), conferenceId: 1, messageBaseId: 1, isPrivate: true, toUser: 'ns_alice', attachments: [], edited: false };
    await repo.createMessage(mail as any, { skipDiskWrite: true, skipNotify: true });
    expect(outbox()).toHaveLength(0);
    await repo.createMessage(mail as any, { skipDiskWrite: true });
    expect(outbox()).toHaveLength(1);
  });

  it('a failure inside the site is swallowed', () => {
    const broken: SiteDeps = { ...deps(), rawDb: () => { throw new Error('boom'); } };
    expect(notifyMessage({ author: 'a', subject: 's', isPrivate: true, toUser: 'b' }, 1, broken)).toBe(0);
  });
});

describe('file site', () => {
  const file = { filename: 'Demo.lha', description: 'a demo', conferenceId: 2, uploader: 'ns_bob' };

  it('tells followers except the uploader, and not a follower who lost access', () => {
    for (const u of ['ns-alice', 'ns-bob', 'ns-sysop']) {
      setPrefs(db, u, { 'file.new': { email: 'instant' } });
      setFollows(db, u, [2]);
    }
    const access = (_h: unknown, userId: string): boolean => userId !== 'ns-sysop';
    expect(notifyFileFiled(file, deps(access))).toBe(1);
    expect(usersInOutbox()).toEqual(['ns-alice']);
  });

  it('a follower of another conference is not told', () => {
    setPrefs(db, 'ns-alice', { 'file.new': { email: 'instant' } });
    setFollows(db, 'ns-alice', [3]);
    expect(notifyFileFiled(file, deps())).toBe(0);
  });
});

describe('sysop page site', () => {
  it('tells sysops who chose it and never a non-sysop who somehow holds the cell', () => {
    setPrefs(db, 'ns-sysop', { 'page.sysop': { email: 'instant' } });
    setPrefs(db, 'ns-alice', { 'page.sysop': { email: 'instant' } });
    notifySysopPage({ id: 'page-1', userHandle: 'ns_bob', nodeId: 3, conferenceName: 'General' }, deps());
    expect(usersInOutbox()).toEqual(['ns-sysop']);
    expect(outbox()[0].payload.title).toBe('Operator page from ns_bob');
  });
});

describe('unlock site', () => {
  it('reaches the unlocker on email and push, and a Board cell cannot exist (the flusher already draws the toast)', () => {
    setPrefs(db, 'ns-alice', { 'ach.unlock': { email: 'instant', board: 'instant' } });
    expect(notifyUnlock('ns-alice', { id: 'first-call', name: 'First Call', tier: 'bronze', points: 5 }, deps())).toBe(1);
    expect(outbox().map((r) => r.channel)).toEqual(['email']);
  });
});

describe('magazine site', () => {
  it('queues ONE summary item per tick per subscriber, and nothing when no story was added', () => {
    setPrefs(db, 'ns-alice', { 'mag.story': { email: 'instant' } });
    setPrefs(db, 'ns-bob', { 'mag.story': { board: 'digest' } });
    expect(notifyMagazine(0, deps())).toBe(0);
    expect(notifyMagazine(7, deps())).toBe(2);
    expect(notifyMagazine(7, deps())).toBe(0); // the same tick again is idempotent
    expect(outbox().every((r) => r.payload.title === '7 new magazine stories')).toBe(true);
  });
});

describe('door notify', () => {
  const item = { title: 'Your turn', body: 'bob moved', objectId: 'turn-1' };

  it('a door raises its own event for a user named by id or by name', () => {
    setPrefs(db, 'ns-alice', { 'door.tetris.your-turn': { email: 'instant' } });
    expect(notifyFromDoor('tetris', 'door.tetris.your-turn', 'ns-alice', item, deps())).toBe(true);
    expect(notifyFromDoor('tetris', 'door.tetris.your-turn', 'NS_ALICE', { ...item, objectId: 'second' }, deps())).toBe(true);
    expect(outbox()).toHaveLength(2);
  });

  it('refuses another door\'s namespace and a board event', () => {
    setPrefs(db, 'ns-alice', { 'door.tetris.your-turn': { email: 'instant' }, 'msg.reply': { email: 'instant' } });
    expect(notifyFromDoor('chess', 'door.tetris.your-turn', 'ns-alice', item, deps())).toBe(false);
    expect(notifyFromDoor('tetris', 'msg.reply', 'ns-alice', item, deps())).toBe(false);
    expect(notifyFromDoor('', 'door..x', 'ns-alice', item, deps())).toBe(false);
    expect(outbox()).toHaveLength(0);
  });

  it('a call without an objectId is refused, so a looping door cannot flood', () => {
    setPrefs(db, 'ns-alice', { 'door.tetris.your-turn': { email: 'instant' } });
    expect(notifyFromDoor('tetris', 'door.tetris.your-turn', 'ns-alice', { title: 't', body: 'b' } as any, deps())).toBe(false);
    expect(notifyFromDoor('tetris', 'door.tetris.your-turn', 'ns-alice', { title: 't', body: 'b', objectId: '  ' }, deps())).toBe(false);
    expect(outbox()).toHaveLength(0);
    // The same objectId twice is one row: the key does its job.
    notifyFromDoor('tetris', 'door.tetris.your-turn', 'ns-alice', { title: 't', body: 'b', objectId: 'k' }, deps());
    notifyFromDoor('tetris', 'door.tetris.your-turn', 'ns-alice', { title: 't', body: 'b', objectId: 'k' }, deps());
    expect(outbox()).toHaveLength(1);
  });

  it('an unknown recipient queues nothing', () => {
    expect(notifyFromDoor('tetris', 'door.tetris.your-turn', 'nobody', item, deps())).toBe(false);
  });
});
