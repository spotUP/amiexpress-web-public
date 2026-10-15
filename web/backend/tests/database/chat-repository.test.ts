// @ts-nocheck
/**
 * Chat Repository Tests
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

describe('ChatRepository', () => {
  let repo: ChatRepository;
  let rawDb: any;
  const initiatorId = `chat-init-${Date.now()}`;
  const recipientId = `chat-recip-${Date.now()}`;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new ChatRepository(rawDb);

    // Insert users required for FK constraints in chat_sessions
    for (const [uid, uname] of [[initiatorId, `chatuser_a_${Date.now()}`], [recipientId, `chatuser_b_${Date.now()}`]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (
          id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud
        ) VALUES (?, ?, 'Chat User', 'hash', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
  }, 30000);

  describe('chat sessions', () => {
    let sessionId: string;

    beforeEach(async () => {
      sessionId = await repo.createChatSession(
        initiatorId, 'InitUser', 'socket-init',
        recipientId, 'RecipUser', 'socket-recip'
      );
    });

    afterEach(async () => {
      try { rawDb.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId); } catch (_) {}
      try { rawDb.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId); } catch (_) {}
    });

    it('createChatSession returns a session id string', () => {
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('getChatSession retrieves the session', async () => {
      const session = await repo.getChatSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.id || session!.session_id).toBeTruthy();
    });

    it('getChatSession returns null for unknown id', async () => {
      const session = await repo.getChatSession('nonexistent-session');
      expect(session).toBeNull();
    });

    it('getChatSessionBySocketId finds session', async () => {
      // getChatSessionBySocketId only returns active sessions
      await repo.updateChatSessionStatus(sessionId, 'active');
      const session = await repo.getChatSessionBySocketId('socket-init');
      expect(session).not.toBeNull();
    });

    it('updateChatSessionStatus changes status', async () => {
      await repo.updateChatSessionStatus(sessionId, 'active');
      const session = await repo.getChatSession(sessionId);
      expect(session!.status).toBe('active');
    });

    it('saveChatMessage and getChatHistory round-trip', async () => {
      await repo.updateChatSessionStatus(sessionId, 'active');
      await repo.saveChatMessage(sessionId, initiatorId, 'InitUser', 'Hello there!');
      await repo.saveChatMessage(sessionId, recipientId, 'RecipUser', 'Hi back!');

      const history = await repo.getChatHistory(sessionId);
      expect(history.length).toBe(2);
      expect(history.some((m: any) => m.content === 'Hello there!')).toBe(true);
    });

    it('getChatHistory respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.saveChatMessage(sessionId, initiatorId, 'InitUser', `Msg ${i}`);
      }
      const history = await repo.getChatHistory(sessionId, 2);
      expect(history.length).toBeLessThanOrEqual(2);
    });

    it('getChatMessageCount returns correct count', async () => {
      await repo.saveChatMessage(sessionId, initiatorId, 'InitUser', 'One');
      await repo.saveChatMessage(sessionId, initiatorId, 'InitUser', 'Two');
      const count = await repo.getChatMessageCount(sessionId);
      expect(count).toBeGreaterThanOrEqual(2);
    });

    it('endChatSession updates status to ended', async () => {
      await repo.endChatSession(sessionId);
      const session = await repo.getChatSession(sessionId);
      expect(session!.status).toBe('ended');
    });
  });

  describe('chat rooms', () => {
    const roomId = `room-${Date.now()}`;

    afterEach(async () => {
      try {
        rawDb.prepare('DELETE FROM chat_room_members WHERE room_id = ?').run(roomId);
        rawDb.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(roomId);
      } catch (_) {}
    });

    it('createChatRoom and getChatRoom round-trip', async () => {
      await repo.createChatRoom({
        roomId,
        roomName: `TestRoom_${Date.now()}`,
        createdBy: initiatorId,
        createdByUsername: 'InitUser',
        isPublic: true,
      });

      const room = await repo.getChatRoom(roomId);
      expect(room).not.toBeNull();
      expect(room!.room_id).toBe(roomId);
    });

    it('listChatRooms includes created room', async () => {
      await repo.createChatRoom({
        roomId,
        roomName: `ListRoom_${Date.now()}`,
        createdBy: initiatorId,
        createdByUsername: 'InitUser',
        isPublic: true,
      });

      const rooms = await repo.listChatRooms(true);
      expect(rooms.some((r: any) => r.room_id === roomId)).toBe(true);
    });

    it('deleteChatRoom removes the room', async () => {
      await repo.createChatRoom({
        roomId,
        roomName: `DelRoom_${Date.now()}`,
        createdBy: initiatorId,
        createdByUsername: 'InitUser',
        isPublic: true,
      });

      await repo.deleteChatRoom(roomId);
      const room = await repo.getChatRoom(roomId);
      expect(room).toBeFalsy(); // getChatRoom returns undefined (not null) when not found
    });
  });

  describe('getAvailableUsersForChat', () => {
    it('returns an array', async () => {
      const users = await repo.getAvailableUsersForChat();
      expect(Array.isArray(users)).toBe(true);
    });
  });
});
