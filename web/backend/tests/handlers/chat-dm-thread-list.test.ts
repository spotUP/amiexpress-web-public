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

import { getDmThreadList, broadcastDmThreadsToParticipants } from '../../src/handlers/chat/dm-thread-list.handler';
import { db } from '../../src/database';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) { await new Promise(r => setTimeout(r, 500)); attempts++; }
  const t = (global as any).testDb;
  if (!t) throw new Error('Test database not initialized');
  return t;
}

describe('getDmThreadList', () => {
  let rawDb: any;
  const uA = `tlist-a-${Date.now()}`;
  const uB = `tlist-b-${Date.now()}`;
  const uC = `tlist-c-${Date.now()}`;
  const uD = `tlist-d-${Date.now()}`; // user with no DMs
  const unameA = `tlistuser_a_${Date.now()}`;
  const unameB = `tlistuser_b_${Date.now()}`;
  const unameC = `tlistuser_c_${Date.now()}`;
  const unameD = `tlistuser_d_${Date.now()}`;

  beforeAll(async () => {
    const t = await waitForTestDb();
    rawDb = (t as any).db;
    for (const [uid, uname] of [[uA, unameA], [uB, unameB], [uC, unameC], [uD, unameD]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES (?, ?, 'TLIST', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
  }, 30000);

  it('returns empty array for user with no DMs', async () => {
    const result = await getDmThreadList(uD);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it('1:1 thread shows other user as displayName and includes self-excluded participants', async () => {
    // A and B
    const threadId = await db.getOrCreateDmThread([uA, uB]);
    await db.saveDmMessage(threadId, uA, unameA, 'hello B');
    const list = await getDmThreadList(uA);
    expect(list.length).toBeGreaterThanOrEqual(1);
    const t = list.find(x => x.threadId === threadId)!;
    expect(t).toBeTruthy();
    expect(t.isGroup).toBe(false);
    expect(t.displayName).toBe(unameB);
    expect(t.participants).toEqual([unameB]);
    expect(typeof t.lastActivityAt).toBe('number');
    expect(t.lastMessage).toBe('hello B');
  });

  it('group DM shows participants minus self', async () => {
    const threadId = await db.getOrCreateDmThread([uA, uB, uC]);
    await db.saveDmMessage(threadId, uA, unameA, 'hi team');
    const list = await getDmThreadList(uA);
    const t = list.find(x => x.threadId === threadId)!;
    expect(t).toBeTruthy();
    expect(t.isGroup).toBe(true);
    expect(t.participants.sort()).toEqual([unameB, unameC].sort());
    expect(t.displayName).toContain(unameB);
    expect(t.displayName).toContain(unameC);
    expect(t.lastMessage).toBe('hi team');
  });

  it('threads sorted by lastActivityAt DESC', async () => {
    // Make sure A's threads have a couple items: 1:1 with B (older) and group (newer)
    const t11 = await db.getOrCreateDmThread([uA, uB]);
    await db.saveDmMessage(t11, uA, unameA, 'older message');
    await new Promise(r => setTimeout(r, 1100)); // ensure newer last_activity_at
    const tgrp = await db.getOrCreateDmThread([uA, uB, uC]);
    await db.saveDmMessage(tgrp, uA, unameA, 'newer group message');

    const list = await getDmThreadList(uA);
    const idx11 = list.findIndex(x => x.threadId === t11);
    const idxgrp = list.findIndex(x => x.threadId === tgrp);
    expect(idxgrp).toBeGreaterThanOrEqual(0);
    expect(idx11).toBeGreaterThanOrEqual(0);
    expect(idxgrp).toBeLessThan(idx11);
  });

  it('lastMessage preview is the most recent message', async () => {
    const threadId = await db.getOrCreateDmThread([uA, uB]);
    await db.saveDmMessage(threadId, uA, unameA, 'first');
    await db.saveDmMessage(threadId, uB, unameB, 'second');
    await db.saveDmMessage(threadId, uA, unameA, 'third');
    const list = await getDmThreadList(uA);
    const t = list.find(x => x.threadId === threadId)!;
    expect(t.lastMessage).toBe('third');
  });
});

describe('broadcastDmThreadsToParticipants', () => {
  let rawDb: any;
  const uA = `bcast-a-${Date.now()}`;
  const uB = `bcast-b-${Date.now()}`;
  const unameA = `bcastuser_a_${Date.now()}`;
  const unameB = `bcastuser_b_${Date.now()}`;

  beforeAll(async () => {
    const t = await waitForTestDb();
    rawDb = (t as any).db;
    for (const [uid, uname] of [[uA, unameA], [uB, unameB]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES (?, ?, 'BCAST', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
  }, 30000);

  it('emits chat:dm-threads to user:<id> rooms for each participant', async () => {
    const calls: Array<{ room: string; ev: string; d: any }> = [];
    const io: any = {
      to: (room: string) => ({ emit: (ev: string, d: any) => calls.push({ room, ev, d }) })
    };
    const threadId = await db.getOrCreateDmThread([uA, uB]);
    await db.saveDmMessage(threadId, uA, unameA, 'broadcast probe');

    await broadcastDmThreadsToParticipants(io, [uA, uB]);

    const aPing = calls.find(c => c.room === `user:${uA}` && c.ev === 'chat:dm-threads');
    const bPing = calls.find(c => c.room === `user:${uB}` && c.ev === 'chat:dm-threads');
    expect(aPing).toBeTruthy();
    expect(bPing).toBeTruthy();
    expect(Array.isArray(aPing.d.threads)).toBe(true);
    expect(Array.isArray(bPing.d.threads)).toBe(true);
    expect(aPing.d.threads.some((t: any) => t.threadId === threadId)).toBe(true);
    expect(bPing.d.threads.some((t: any) => t.threadId === threadId)).toBe(true);
  });
});
