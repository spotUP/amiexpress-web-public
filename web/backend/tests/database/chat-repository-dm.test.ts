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
});
