// @ts-nocheck
/**
 * Regression test for the chat:dm-history request/response shape contract.
 *
 * Door (Doors/livechat/server.ts) emits:
 *   socket.emit('chat:dm-history', { threadId, limit })
 * Backend handler (web/backend/src/handlers/chat/dm.handler.ts:handleChatDmHistory)
 * expects `data.threadId` + optional `data.limit` and emits back:
 *   socket.emit('chat:dm-history', { threadId, messages: [...] })
 * If a non-participant requests history, the handler must reject with
 * `chat:dm-error` instead of leaking history.
 */
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

import { handleChatDmHistory } from '../../src/handlers/chat/dm.handler';
import { db } from '../../src/database';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) { await new Promise(r => setTimeout(r, 500)); attempts++; }
  const t = (global as any).testDb;
  if (!t) throw new Error('Test database not initialized');
  return t;
}

describe('handleChatDmHistory request/response shape', () => {
  let rawDb: any;
  // Unique IDs/usernames per run so repeated test invocations don't collide.
  const uA = `dmhist-a-${Date.now()}`;
  const uB = `dmhist-b-${Date.now()}`;
  const uC = `dmhist-c-${Date.now()}`; // non-participant
  const unameA = `dmhistuser_a_${Date.now()}`;
  const unameB = `dmhistuser_b_${Date.now()}`;
  const unameC = `dmhistuser_c_${Date.now()}`;

  let threadId: string;

  beforeAll(async () => {
    const t = await waitForTestDb();
    rawDb = (t as any).db;
    for (const [uid, uname] of [[uA, unameA], [uB, unameB], [uC, unameC]]) {
      // FK-safe: fully-populated user row (matches surrounding test pattern).
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES (?, ?, 'DMHIST', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }

    // Seed a 1:1 thread between A and B with two messages so history is non-empty.
    threadId = await db.getOrCreateDmThread([uA, uB]);
    await db.saveDmMessage(threadId, uA, unameA, 'first');
    await db.saveDmMessage(threadId, uB, unameB, 'second');
  }, 30000);

  it('emits chat:dm-history with { threadId, messages } when caller is a participant', async () => {
    const emits: Array<{ ev: string; d: any }> = [];
    const socket: any = { id: 'sock-a', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const session: any = { user: { id: uA, username: unameA } };

    await handleChatDmHistory(socket, session, { threadId, limit: 5 });

    const reply = emits.find(e => e.ev === 'chat:dm-history');
    expect(reply).toBeTruthy();
    expect(reply!.d.threadId).toBe(threadId);
    expect(Array.isArray(reply!.d.messages)).toBe(true);
    expect(reply!.d.messages.length).toBeGreaterThanOrEqual(2);
    // No error path triggered for participants.
    expect(emits.some(e => e.ev === 'chat:dm-error')).toBe(false);
  });

  it('emits chat:dm-error when caller is not a participant of the thread', async () => {
    const emits: Array<{ ev: string; d: any }> = [];
    const socket: any = { id: 'sock-c', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const session: any = { user: { id: uC, username: unameC } };

    await handleChatDmHistory(socket, session, { threadId, limit: 5 });

    expect(emits.some(e => e.ev === 'chat:dm-history')).toBe(false);
    const err = emits.find(e => e.ev === 'chat:dm-error');
    expect(err).toBeTruthy();
    expect(typeof err!.d.error).toBe('string');
  });

  it('uses default limit when limit is omitted (smoke test for { threadId } only)', async () => {
    const emits: Array<{ ev: string; d: any }> = [];
    const socket: any = { id: 'sock-a', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const session: any = { user: { id: uA, username: unameA } };

    // Door currently always sends limit:50 but the handler must tolerate omission
    // (its signature is `data: { threadId: string; limit?: number }`).
    await handleChatDmHistory(socket, session, { threadId } as any);

    const reply = emits.find(e => e.ev === 'chat:dm-history');
    expect(reply).toBeTruthy();
    expect(reply!.d.threadId).toBe(threadId);
    expect(Array.isArray(reply!.d.messages)).toBe(true);
  });
});
