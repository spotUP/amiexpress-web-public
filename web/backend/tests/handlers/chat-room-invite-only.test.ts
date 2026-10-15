// @ts-nocheck
jest.mock('../../src/services/UserFileManager', () => ({ userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() } }));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0), userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}), userToMisc: jest.fn().mockReturnValue({}), appendUser: jest.fn(),
  }
}));

import { handleRoomJoin, setGroupChatDependencies } from '../../src/handlers/chat/group-chat.handler';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) { await new Promise(r => setTimeout(r, 500)); attempts++; }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('handleRoomJoin invite enforcement', () => {
  let testDb: any;
  let rawDb: any;
  const owner = `ij-o-${Date.now()}`;
  const invited = `ij-in-${Date.now()}`;
  const outsider = `ij-ot-${Date.now()}`;
  const ownerName = `ij_o_${Date.now()}`;
  const invitedName = `ij_in_${Date.now()}`;
  const outsiderName = `ij_ot_${Date.now()}`;
  const roomId = `ij-room-${Date.now()}`;

  beforeAll(async () => {
    testDb = await waitForTestDb();
    rawDb = (testDb as any).db;
    for (const [uid, uname] of [[owner, ownerName], [invited, invitedName], [outsider, outsiderName]]) {
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
    `).run(roomId, `IjRoom_${Date.now()}`, owner, ownerName);
    rawDb.prepare(`INSERT INTO chat_room_invites (room_id, user_id, invited_by) VALUES (?, ?, ?)`).run(roomId, invited, owner);

    const io: any = {
      to: () => ({ emit: () => {}, except: () => ({ emit: () => {} }) }),
      sockets: { sockets: new Map() },
    };
    setGroupChatDependencies({ db: testDb, sessions: new Map(), io });
  }, 30000);

  afterEach(() => {
    try {
      rawDb.prepare('DELETE FROM chat_room_members WHERE room_id = ?').run(roomId);
    } catch (_) {}
  });

  afterAll(() => {
    try {
      rawDb.prepare('DELETE FROM chat_room_invites WHERE room_id = ?').run(roomId);
      rawDb.prepare('DELETE FROM chat_room_members WHERE room_id = ?').run(roomId);
      rawDb.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(roomId);
    } catch (_) {}
  });

  it('allows invited user to join', async () => {
    const emits: any[] = [];
    const socket: any = {
      id: 'sock-in', emit: (ev: string, d: any) => emits.push({ ev, d }),
      join: () => {}, leave: () => {}, to: () => ({ emit: () => {} })
    };
    const session: any = { user: { id: invited, username: invitedName } };
    await handleRoomJoin(socket, session, { roomId });
    expect(emits.some(e => e.ev === 'room:joined')).toBe(true);
    // Invite should be consumed after a successful join
    const invs = rawDb.prepare('SELECT 1 FROM chat_room_invites WHERE room_id = ? AND user_id = ?').get(roomId, invited);
    expect(invs).toBeFalsy();
  });

  it('rejects outsider with an invite-related error', async () => {
    const emits: any[] = [];
    const socket: any = {
      id: 'sock-out', emit: (ev: string, d: any) => emits.push({ ev, d }),
      join: () => {}, leave: () => {}, to: () => ({ emit: () => {} })
    };
    const session: any = { user: { id: outsider, username: outsiderName } };
    await handleRoomJoin(socket, session, { roomId });
    const errored = emits.some(e => {
      if (e.ev !== 'room:error' && e.ev !== 'ansi-output') return false;
      return JSON.stringify(e.d).toLowerCase().includes('invite');
    });
    expect(errored).toBe(true);
  });

  it('allows owner to join their own invite-only room', async () => {
    const emits: any[] = [];
    const socket: any = {
      id: 'sock-owner', emit: (ev: string, d: any) => emits.push({ ev, d }),
      join: () => {}, leave: () => {}, to: () => ({ emit: () => {} })
    };
    const session: any = { user: { id: owner, username: ownerName } };
    await handleRoomJoin(socket, session, { roomId });
    expect(emits.some(e => e.ev === 'room:joined')).toBe(true);
  });
});
