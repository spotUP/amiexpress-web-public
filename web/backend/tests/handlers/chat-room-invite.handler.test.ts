// @ts-nocheck
jest.mock('../../src/services/UserFileManager', () => ({ userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() } }));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0), userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}), userToMisc: jest.fn().mockReturnValue({}), appendUser: jest.fn(),
  }
}));

import { handleRoomInvite } from '../../src/handlers/chat/room-invite.handler';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) { await new Promise(r => setTimeout(r, 500)); attempts++; }
  return (global as any).testDb;
}

describe('handleRoomInvite', () => {
  let rawDb: any;
  const owner = `inv-h-o-${Date.now()}`;
  const invitee = `inv-h-i-${Date.now()}`;
  const outsider = `inv-h-x-${Date.now()}`;
  const ownerName = `inv_h_o_${Date.now()}`;
  const inviteeName = `inv_h_i_${Date.now()}`;
  const outsiderName = `inv_h_x_${Date.now()}`;
  const roomId = `inv-h-room-${Date.now()}`;

  beforeAll(async () => {
    rawDb = (await waitForTestDb() as any).db;
    for (const [uid, uname] of [[owner, ownerName], [invitee, inviteeName], [outsider, outsiderName]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES (?, ?, 'X', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
    rawDb.prepare(`
      INSERT INTO chat_rooms (room_id, room_name, created_by, created_by_username, is_public, is_invite_only, max_users)
      VALUES (?, ?, ?, ?, 0, 1, 50)
    `).run(roomId, `IhRoom_${Date.now()}`, owner, ownerName);
    rawDb.prepare(`INSERT INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator) VALUES (?, ?, ?, 'sock', 1)`).run(roomId, owner, ownerName);
  }, 30000);

  afterEach(() => {
    rawDb.prepare('DELETE FROM chat_room_invites WHERE room_id = ?').run(roomId);
  });

  afterAll(() => {
    try {
      rawDb.prepare('DELETE FROM chat_room_invites WHERE room_id = ?').run(roomId);
      rawDb.prepare('DELETE FROM chat_room_members WHERE room_id = ?').run(roomId);
      rawDb.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(roomId);
    } catch (_) {}
  });

  it('moderator can invite an existing user (creates a chat_room_invites row)', async () => {
    const emits: any[] = [];
    const socket: any = { id: 'sock-mod', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: owner, username: ownerName } };

    await handleRoomInvite({ io, socket, session, data: { roomId, targetUsername: inviteeName } });

    expect(emits.some(e => e.ev === 'room:invited' && e.d.username === inviteeName)).toBe(true);
    const row = rawDb.prepare('SELECT 1 FROM chat_room_invites WHERE room_id = ? AND user_id = ?').get(roomId, invitee);
    expect(row).toBeTruthy();
  });

  it('non-moderator gets room:error', async () => {
    const emits: any[] = [];
    const socket: any = { id: 'sock-out', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: outsider, username: outsiderName } };

    await handleRoomInvite({ io, socket, session, data: { roomId, targetUsername: inviteeName } });

    expect(emits.some(e => e.ev === 'room:error')).toBe(true);
  });

  it('unknown target user gets room:error', async () => {
    const emits: any[] = [];
    const socket: any = { id: 'sock-mod', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: owner, username: ownerName } };

    await handleRoomInvite({ io, socket, session, data: { roomId, targetUsername: 'no-such-user' } });

    expect(emits.some(e => e.ev === 'room:error')).toBe(true);
  });

  it('revoke removes the invite and emits room:invite-revoked', async () => {
    rawDb.prepare(`INSERT INTO chat_room_invites (room_id, user_id, invited_by) VALUES (?, ?, ?)`).run(roomId, invitee, owner);
    const emits: any[] = [];
    const socket: any = { id: 'sock-mod', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: owner, username: ownerName } };

    await handleRoomInvite({ io, socket, session, data: { roomId, targetUsername: inviteeName }, revoke: true });

    expect(emits.some(e => e.ev === 'room:invite-revoked')).toBe(true);
    const row = rawDb.prepare('SELECT 1 FROM chat_room_invites WHERE room_id = ? AND user_id = ?').get(roomId, invitee);
    expect(row).toBeFalsy();
  });
});
