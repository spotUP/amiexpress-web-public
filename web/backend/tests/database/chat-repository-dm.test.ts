// @ts-nocheck
jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() }
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  }
}));

import { ChatRepository } from '../../src/database/chat-repository';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('ChatRepository DMs', () => {
  let repo: ChatRepository;
  let rawDb: any;
  const uA = `dm-a-${Date.now()}`;
  const uB = `dm-b-${Date.now()}`;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new ChatRepository(rawDb);
    for (const [uid, uname] of [[uA, `dmuser_a_${Date.now()}`], [uB, `dmuser_b_${Date.now()}`]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (
          id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud
        ) VALUES (?, ?, 'DM User', 'hash', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
  }, 30000);

  it('getOrCreateDmThread returns stable thread id for same pair regardless of order', async () => {
    const t1 = await repo.getOrCreateDmThread([uA, uB]);
    const t2 = await repo.getOrCreateDmThread([uB, uA]);
    expect(t1).toBe(t2);
  });

  it('getOrCreateDmThread throws when fewer than 2 participants', async () => {
    await expect(repo.getOrCreateDmThread([uA])).rejects.toThrow(/>=2/);
  });

  it('getOrCreateDmThread flags is_group=1 for >2 participants, 0 for exactly 2', async () => {
    const uC = `dm-c-${Date.now()}`;
    rawDb.prepare(`
      INSERT OR IGNORE INTO users (
        id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud
      ) VALUES (?, ?, 'DM User', 'hash', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run(uC, `dmuser_c_${Date.now()}`);

    const t2 = await repo.getOrCreateDmThread([uA, uB]);
    const t3 = await repo.getOrCreateDmThread([uA, uB, uC]);
    const row2 = rawDb.prepare('SELECT is_group FROM chat_dm_threads WHERE thread_id = ?').get(t2) as any;
    const row3 = rawDb.prepare('SELECT is_group FROM chat_dm_threads WHERE thread_id = ?').get(t3) as any;
    expect(row2.is_group).toBe(0);
    expect(row3.is_group).toBe(1);
  });

  it('getOrCreateDmThread rolls back when a user id does not exist', async () => {
    const before = rawDb.prepare('SELECT COUNT(*) as c FROM chat_dm_threads').get() as any;
    await expect(repo.getOrCreateDmThread([uA, 'does-not-exist'])).rejects.toThrow(/User not found/);
    const after = rawDb.prepare('SELECT COUNT(*) as c FROM chat_dm_threads').get() as any;
    expect(after.c).toBe(before.c);
  });
});
