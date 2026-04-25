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

  it('saveDmMessage and getDmHistory round-trip', async () => {
    const tid = await repo.getOrCreateDmThread([uA, uB]);
    await repo.saveDmMessage(tid, uA, 'InitUser', 'Hello');
    await repo.saveDmMessage(tid, uB, 'RecipUser', 'Hi back');
    const history = await repo.getDmHistory(tid, 50);
    expect(history.length).toBe(2);
    expect(history[0].message).toBe('Hello');
    expect(history[1].message).toBe('Hi back');
  });

  it('listUserDmThreads returns threads user participates in', async () => {
    const tid = await repo.getOrCreateDmThread([uA, uB]);
    const list = await repo.listUserDmThreads(uA);
    expect(list.some((t: any) => t.thread_id === tid)).toBe(true);
  });

  it('saveDmMessage bumps last_activity_at above created_at', async () => {
    const tid = await repo.getOrCreateDmThread([uA, uB]);
    // force created_at to be in the past so the comparison is meaningful
    rawDb.prepare(`UPDATE chat_dm_threads SET created_at = strftime('%s','now') - 5, last_activity_at = strftime('%s','now') - 5 WHERE thread_id = ?`).run(tid);
    await repo.saveDmMessage(tid, uA, 'InitUser', 'bump');
    const row = rawDb.prepare('SELECT created_at, last_activity_at FROM chat_dm_threads WHERE thread_id = ?').get(tid) as any;
    expect(Number(row.last_activity_at)).toBeGreaterThan(Number(row.created_at));
  });

  it('getDmHistory returns empty array for a thread with no messages', async () => {
    const tid = await repo.getOrCreateDmThread([uA, uB]);
    // clear any messages from prior tests in this thread
    rawDb.prepare('DELETE FROM chat_dm_messages WHERE thread_id = ?').run(tid);
    const history = await repo.getDmHistory(tid, 50);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(0);
  });

  it('getDmHistory honours the limit parameter', async () => {
    const tid = await repo.getOrCreateDmThread([uA, uB]);
    rawDb.prepare('DELETE FROM chat_dm_messages WHERE thread_id = ?').run(tid);
    await repo.saveDmMessage(tid, uA, 'InitUser', 'one');
    await repo.saveDmMessage(tid, uA, 'InitUser', 'two');
    await repo.saveDmMessage(tid, uA, 'InitUser', 'three');
    const limited = await repo.getDmHistory(tid, 2);
    expect(limited.length).toBe(2);
  });

  it('getDmParticipants returns both users with their usernames', async () => {
    const tid = await repo.getOrCreateDmThread([uA, uB]);
    const participants = await repo.getDmParticipants(tid);
    const ids = participants.map((p: any) => p.user_id).sort();
    expect(ids).toEqual([uA, uB].sort());
    for (const p of participants) expect(typeof p.username).toBe('string');
  });

  it('listUserDmThreads orders threads by last_activity_at DESC', async () => {
    const tidOld = await repo.getOrCreateDmThread([uA, uB]);
    // Create a second thread and make sure it's more recently active
    const uC = `dm-order-c-${Date.now()}`;
    rawDb.prepare(`
      INSERT OR IGNORE INTO users (
        id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud
      ) VALUES (?, ?, 'DM User', 'hash', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run(uC, `dmuser_order_c_${Date.now()}`);
    const tidNew = await repo.getOrCreateDmThread([uA, uC]);
    // artificially age the first thread
    rawDb.prepare(`UPDATE chat_dm_threads SET last_activity_at = strftime('%s','now') - 60 WHERE thread_id = ?`).run(tidOld);
    rawDb.prepare(`UPDATE chat_dm_threads SET last_activity_at = strftime('%s','now') WHERE thread_id = ?`).run(tidNew);
    const list = await repo.listUserDmThreads(uA);
    const idxNew = list.findIndex((t: any) => t.thread_id === tidNew);
    const idxOld = list.findIndex((t: any) => t.thread_id === tidOld);
    expect(idxNew).toBeGreaterThanOrEqual(0);
    expect(idxOld).toBeGreaterThanOrEqual(0);
    expect(idxNew).toBeLessThan(idxOld);
  });
});
