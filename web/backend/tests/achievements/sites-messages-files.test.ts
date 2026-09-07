/**
 * SP2-8 - sites: messages and files, with the real outbox and the real
 * messages and users tables for the facts that read them.
 */
import { defaultSiteDeps, reportMessage, reportUpload, reportDownload, RATIO_MIN_UPLOADS } from '../../src/achievements/sites';
import type { ReporterDeps } from '../../src/achievements/reporter';
import { due } from '../../src/achievements/outbox.repository';
import type { EventIn } from '../../src/achievements/contract';

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
let NOW = new Date(2026, 8, 7, 14, 30).getTime();
const reporterDeps = (): ReporterDeps => ({
  rawDb: () => db,
  settings: () => ({ serverUrl: 'https://doors.example', boardKey: 'uprough.k', boardId: 'uprough', enabled: true }),
  now: () => NOW,
  warn: (l) => { throw new Error(l); },
});
const events = (): EventIn[] => due(db, NOW / 1000 + 1, 1000).map((r) => JSON.parse(r.payload) as EventIn);
const kinds = (): string[] => events().map((e) => `${e.type}${e.key ? ':' + e.key : ''}`).sort();
const alice = { user: { id: 'u-alice', email: 'alice@example.com' }, connectionType: 'telnet' as const };
const lines = (n: number): string[] => Array.from({ length: n }, (_, i) => `line ${i}`);

beforeAll(async () => {
  db = (await waitForTestDb()).db;
  defaultSiteDeps.reporter = reporterDeps();
  defaultSiteDeps.rawDb = () => db;
  defaultSiteDeps.now = () => NOW;
  db.prepare(`INSERT OR IGNORE INTO users (id, username, passwordhash, realname, email) VALUES ('u-alice', 'alice', 'x', 'Alice', 'alice@example.com')`).run();
  db.prepare(`INSERT OR IGNORE INTO users (id, username, passwordhash, realname, email) VALUES ('u-bob', 'bob', 'x', 'Bob', 'bob@example.com')`).run();
}, 30000);

beforeEach(() => {
  db.exec("DELETE FROM achievement_outbox; DELETE FROM messages WHERE subject LIKE 'ach-test%'");
  NOW = new Date(2026, 8, 7, 14, 30).getTime();
});

function message(author: string, timestamp: number, parentId: number | null = null): number {
  const info = db.prepare(`INSERT INTO messages (subject, body, author, timestamp, conferenceid, messagebaseid, parentid) VALUES ('ach-test', 'b', ?, ?, 1, 1, ?)`).run(author, timestamp, parentId);
  return Number(info.lastInsertRowid);
}

describe('messages', () => {
  it('a public post writes msg.post keyed by its conference, and a private one writes msg.private too', () => {
    expect(reportMessage(alice, { body: lines(3) }, 2)).toBe(1);
    expect(kinds()).toEqual(['msg.post:conf:2']);
    db.exec('DELETE FROM achievement_outbox');
    expect(reportMessage(alice, { body: lines(3), isPrivate: true, toUserIsSysop: true }, 1)).toBe(3);
    expect(kinds()).toEqual(['msg.comment', 'msg.post:conf:1', 'msg.private']);
  });

  it("a reply writes msg.reply, fast when under a minute, and msg.thread for the parent's author on the first reply only", () => {
    const parent = message('bob', Math.floor(NOW / 1000) - 30);
    message('alice', Math.floor(NOW / 1000), parent);
    expect(reportMessage(alice, { body: lines(1), parentId: parent }, 1)).toBe(3);
    expect(kinds()).toEqual(['msg.post:conf:1', 'msg.reply:fast', 'msg.thread']);
    const thread = events().find((e) => e.type === 'msg.thread') as EventIn;
    expect(thread.email).toBe('bob@example.com');
    expect(thread.ref).toBe(`uprough:msg.thread:${parent}`);

    // The second reply: not fast (the parent is old now), no thread event.
    db.exec('DELETE FROM achievement_outbox');
    NOW += 120000;
    message('alice', Math.floor(NOW / 1000), parent);
    expect(reportMessage(alice, { body: lines(1), parentId: parent }, 1)).toBe(2);
    expect(kinds()).toEqual(['msg.post:conf:1', 'msg.reply']);

    // Replying to yourself starts no thread for anyone.
    db.exec('DELETE FROM achievement_outbox');
    const own = message('alice', Math.floor(NOW / 1000) - 10);
    message('alice', Math.floor(NOW / 1000), own);
    reportMessage(alice, { body: lines(1), parentId: own }, 1);
    expect(kinds()).toEqual(['msg.post:conf:1', 'msg.reply:fast']);
  });

  it('a hundred-and-one-line message writes the lines:100+ key; a hundred does not', () => {
    reportMessage(alice, { body: lines(101) }, 1);
    expect(kinds()).toContain('msg.post:lines:100+');
    db.exec('DELETE FROM achievement_outbox');
    reportMessage(alice, { body: lines(100) }, 1);
    expect(kinds()).toEqual(['msg.post:conf:1']);
  });

  it('a message at 00:03 writes midnight; one at 00:06 does not', () => {
    NOW = new Date(2026, 8, 8, 0, 3).getTime();
    reportMessage(alice, { body: lines(1) }, 1);
    expect(kinds()).toContain('msg.post:midnight');
    db.exec('DELETE FROM achievement_outbox');
    NOW = new Date(2026, 8, 8, 0, 6).getTime();
    reportMessage(alice, { body: lines(1) }, 1);
    expect(kinds()).toEqual(['msg.post:conf:1']);
  });
});

describe('files', () => {
  beforeEach(() => {
    db.prepare(`UPDATE users SET uploads = 0, downloads = 0 WHERE id = 'u-alice'`).run();
  });

  it('an upload writes file.upload with its byte size, and file.desc only for a caller-written description', () => {
    expect(reportUpload(alice, 12345.9, 'A real description of the file', false)).toBe(2);
    expect(events().find((e) => e.type === 'file.upload')?.value).toBe(12345);
    expect(kinds()).toEqual(['file.desc', 'file.upload']);
    db.exec('DELETE FROM achievement_outbox');
    reportUpload(alice, 1, 'A real description of the file', true);   // lifted from FILE_ID.DIZ
    reportUpload(alice, 1, 'short', false);                            // too short to be a description
    expect(kinds()).toEqual(['file.upload', 'file.upload']);
  });

  it('a download writes file.download; a file uploaded twenty-six years ago carries age:25y+', () => {
    expect(reportDownload(alice, { size: 2048, uploadDate: new Date(NOW - 26 * 365.25 * 24 * 3600 * 1000) })).toBe(1);
    expect(kinds()).toEqual(['file.download:age:25y+']);
    db.exec('DELETE FROM achievement_outbox');
    reportDownload(alice, { size: 2048, uploadDate: new Date(NOW - 24 * 365.25 * 24 * 3600 * 1000) });
    reportDownload(alice, { size: 10 });
    expect(kinds()).toEqual(['file.download', 'file.download']);
  });

  it('crossing the silver ratio writes file.ratio silver once, gold at two to one, and never under ten uploads', () => {
    db.prepare(`UPDATE users SET uploads = 9, downloads = 4 WHERE id = 'u-alice'`).run();
    reportUpload(alice, 1, '', true);
    expect(kinds()).toEqual(['file.upload']);

    db.exec('DELETE FROM achievement_outbox');
    db.prepare(`UPDATE users SET uploads = ?, downloads = 9 WHERE id = 'u-alice'`).run(RATIO_MIN_UPLOADS);
    expect(db.prepare(`SELECT uploads, downloads FROM users WHERE id = 'u-alice'`).get()).toEqual({ uploads: 10, downloads: 9 });
    reportUpload(alice, 1, '', true);
    expect(kinds()).toEqual(['file.ratio:silver', 'file.upload']);
    const silver = events().find((e) => e.type === 'file.ratio') as EventIn;
    expect(silver.ref).toBe('uprough:alice@example.com:ratio:silver');

    // Another upload at the same ratio: the same ref, one row still.
    reportUpload(alice, 1, '', true);
    expect(kinds().filter((k) => k === 'file.ratio:silver')).toHaveLength(1);

    db.prepare(`UPDATE users SET uploads = 20, downloads = 9 WHERE id = 'u-alice'`).run();
    reportUpload(alice, 1, '', true);
    expect(kinds()).toContain('file.ratio:gold');
  });
});
