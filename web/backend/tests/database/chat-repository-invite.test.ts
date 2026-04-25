// @ts-nocheck
jest.mock('../../src/services/UserFileManager', () => ({ userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() } }));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0), userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}), userToMisc: jest.fn().mockReturnValue({}), appendUser: jest.fn(),
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

describe('ChatRepository invites', () => {
  let repo: ChatRepository;
  let rawDb: any;
  const owner = `inv-o-${Date.now()}`;
  const invitee = `inv-i-${Date.now()}`;
  const roomId = `inv-room-${Date.now()}`;

  beforeAll(async () => {
    rawDb = (await waitForTestDb() as any).db;
    repo = new ChatRepository(rawDb);
    for (const [uid, uname] of [[owner, `inv_o_${Date.now()}`], [invitee, `inv_i_${Date.now()}`]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES (?, ?, 'X', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
    await repo.createChatRoom({
      roomId, roomName: `InvRoom_${Date.now()}`,
      createdBy: owner, createdByUsername: 'O', isPublic: false, isInviteOnly: true,
    });
  }, 30000);

  afterAll(() => {
    try {
      rawDb.prepare('DELETE FROM chat_room_invites WHERE room_id = ?').run(roomId);
      rawDb.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(roomId);
    } catch (_) {}
  });

  it('createChatRoom stores is_invite_only flag', async () => {
    const room = await repo.getChatRoom(roomId);
    expect(Boolean(room.is_invite_only)).toBe(true);
  });

  it('inviteUser + hasInvite', async () => {
    await repo.inviteUser(roomId, invitee, owner);
    expect(await repo.hasInvite(roomId, invitee)).toBe(true);
  });

  it('revokeInvite removes pending invite', async () => {
    await repo.inviteUser(roomId, invitee, owner);
    await repo.revokeInvite(roomId, invitee);
    expect(await repo.hasInvite(roomId, invitee)).toBe(false);
  });

  it('setInviteOnly toggles the flag', async () => {
    await repo.setInviteOnly(roomId, false);
    let room = await repo.getChatRoom(roomId);
    expect(Boolean(room.is_invite_only)).toBe(false);
    await repo.setInviteOnly(roomId, true);
    room = await repo.getChatRoom(roomId);
    expect(Boolean(room.is_invite_only)).toBe(true);
  });

  it('setModerated toggles the flag', async () => {
    await repo.setModerated(roomId, true);
    const room = await repo.getChatRoom(roomId);
    expect(Boolean(room.is_moderated)).toBe(true);
  });

  it('setVoiced + isUserVoiced round-trip', async () => {
    // Need the user to be a member
    await rawDb.prepare(`INSERT OR REPLACE INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator) VALUES (?, ?, 'I', 'sock', 0)`).run(roomId, invitee);
    expect(await repo.isUserVoiced(roomId, invitee)).toBe(false);
    await repo.setVoiced(roomId, invitee, true);
    expect(await repo.isUserVoiced(roomId, invitee)).toBe(true);
    await repo.setVoiced(roomId, invitee, false);
    expect(await repo.isUserVoiced(roomId, invitee)).toBe(false);
  });
});
