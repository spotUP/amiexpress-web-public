/**
 * Access and sysop level come from the DISK record, not the SQL mirror.
 *
 * Symptom: a follower whose access was taken away in the user editor (user.data
 * updated, the SQL row still saying XXX) kept getting file notices; a caller
 * whose SQL seclevel read 255 could be sent sysop pages. SQL here says the
 * opposite of the disk on purpose; the default seams must follow the disk.
 */
const disk = new Map<number, any>();
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: { readUserFromDisk: (slot: number) => disk.get(slot) ?? null, getUserCount: () => disk.size },
}));

import { diskHasConfAccess, diskIsSysop } from '../../src/notify/account';
import { notifyFileFiled, notifySysopPage } from '../../src/notify/sites';
import type { SiteDeps } from '../../src/notify/sites';
import { setFollows, setPrefs } from '../../src/notify/repository';

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
const record = (name: string, secStatus: number, access: string): any => ({
  user: { secStatus, conferenceAccess: Buffer.from(access + '\0', 'latin1') },
  keys: { userName: name },
  misc: {},
});
const addUser = (id: string, username: string, slot: number, seclevel: number, confaccess: string): void => {
  db.prepare(`INSERT INTO users (id, username, passwordhash, realname, email, seclevel, confaccess, slotnumber) VALUES (?, ?, 'x', 'r', ?, ?, ?, ?)`)
    .run(id, username, `${id}@example.com`, seclevel, confaccess, slot);
};
const deps = (): SiteDeps => {
  const { defaultSiteDeps } = require('../../src/notify/sites');
  return { ...defaultSiteDeps, rawDb: () => db, now: () => 1_800_000_000_000 };
};
const users = (): string[] => (db.prepare('SELECT user_id FROM notify_outbox').all() as any[]).map((r) => r.user_id).sort();

beforeAll(async () => { db = (await waitForTestDb()).db; }, 30000);
beforeEach(() => {
  disk.clear();
  for (const t of ['notify_prefs', 'notify_outbox', 'notify_follow']) db.exec(`DELETE FROM ${t}`);
  db.exec(`DELETE FROM users WHERE id LIKE 'nd-%'`);
});

describe('conference access is read from the disk record', () => {
  it('a follower the disk record denies is not told, though SQL still says XXX', () => {
    addUser('nd-in', 'nd_in', 9001, 10, 'XXX');
    addUser('nd-out', 'nd_out', 9002, 10, 'XXX');
    disk.set(9001, record('nd_in', 10, 'XXX'));
    disk.set(9002, record('nd_out', 10, 'X__')); // conference 2 revoked on disk
    for (const u of ['nd-in', 'nd-out']) { setPrefs(db, u, { 'file.new': { email: 'instant' } }); setFollows(db, u, [2]); }
    notifyFileFiled({ filename: 'a.lha', description: 'd', conferenceId: 2, uploader: 'someone' }, deps());
    expect(users()).toEqual(['nd-in']);
  });

  it('a user with no disk record, or a stale slot, has no access (fail closed)', () => {
    addUser('nd-none', 'nd_none', 9003, 10, 'XXX');
    expect(diskHasConfAccess(db, 'nd-none', 1)).toBe(false);
    disk.set(9003, record('somebody_else', 10, 'XXX'));
    expect(diskHasConfAccess(db, 'nd-none', 1)).toBe(false);
  });
});

describe('the sysop level is read from the disk record', () => {
  it('SQL seclevel 255 with a disk level of 10 is not a sysop; the reverse is', () => {
    addUser('nd-fake', 'nd_fake', 9004, 255, 'XXX');
    addUser('nd-real', 'nd_real', 9005, 10, 'XXX');
    disk.set(9004, record('nd_fake', 10, 'XXX'));
    disk.set(9005, record('nd_real', 255, 'XXX'));
    expect(diskIsSysop(db, 'nd-fake')).toBe(false);
    expect(diskIsSysop(db, 'nd-real')).toBe(true);
    for (const u of ['nd-fake', 'nd-real']) setPrefs(db, u, { 'page.sysop': { email: 'instant' } });
    notifySysopPage({ id: 'p1', userHandle: 'bob', nodeId: 1, conferenceName: 'General' }, deps());
    expect(users()).toEqual(['nd-real']);
  });
});
