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
  while (!(global as any).testDb && attempts < 30) { await new Promise(r => setTimeout(r, 500)); attempts++; }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('ChatRepository MOTD', () => {
  let repo: ChatRepository;
  let rawDb: any;
  const owner = `motd-o-${Date.now()}`;
  const roomId = `motd-room-${Date.now()}`;

  beforeAll(async () => {
    rawDb = (await waitForTestDb() as any).db;
    repo = new ChatRepository(rawDb);
    rawDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud)
      VALUES (?, ?, 'O', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run(owner, `motduser_${Date.now()}`);
  }, 30000);

  afterAll(() => {
    try { rawDb.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(roomId); } catch (_) {}
  });

  it('createChatRoom with motd stores it', async () => {
    await repo.createChatRoom({
      roomId,
      roomName: `MotdRoom_${Date.now()}`,
      createdBy: owner,
      createdByUsername: 'O',
      isPublic: true,
      motd: 'Welcome to the room',
    });
    const room = await repo.getChatRoom(roomId);
    expect(room.motd).toBe('Welcome to the room');
  });

  it('setMotd updates existing room', async () => {
    await repo.setMotd(roomId, 'New message');
    const room = await repo.getChatRoom(roomId);
    expect(room.motd).toBe('New message');
  });

  it('setMotd(null) clears the MOTD', async () => {
    await repo.setMotd(roomId, null);
    const room = await repo.getChatRoom(roomId);
    expect(room.motd).toBeFalsy();
  });

  it('setMotd preserves empty string verbatim (not coerced to null)', async () => {
    await repo.setMotd(roomId, '');
    const room = await repo.getChatRoom(roomId);
    expect(room.motd).toBe('');
  });

  it('updateChatRoom motd preserves empty string verbatim', async () => {
    await repo.updateChatRoom(roomId, { motd: '' });
    const room = await repo.getChatRoom(roomId);
    expect(room.motd).toBe('');
  });
});
