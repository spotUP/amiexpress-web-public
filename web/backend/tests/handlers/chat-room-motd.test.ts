// @ts-nocheck
jest.mock('../../src/services/UserFileManager', () => ({ userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() } }));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0), userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}), userToMisc: jest.fn().mockReturnValue({}), appendUser: jest.fn(),
  }
}));

import { handleSetRoomMotd } from '../../src/handlers/chat/room-motd.handler';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) { await new Promise(r => setTimeout(r, 500)); attempts++; }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('room:motd handler', () => {
  let rawDb: any;
  const owner = `motd-h-${Date.now()}`;
  const roomId = `motd-h-room-${Date.now()}`;

  beforeAll(async () => {
    rawDb = (await waitForTestDb() as any).db;
    rawDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud)
      VALUES (?, ?, 'O', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run(owner, `motduser_h_${Date.now()}`);

    rawDb.prepare(`INSERT INTO chat_rooms (room_id, room_name, created_by, created_by_username, is_public) VALUES (?, ?, ?, 'O', 1)`).run(roomId, `Room_${Date.now()}`, owner);
    rawDb.prepare(`INSERT INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator) VALUES (?, ?, 'O', 'sock', 1)`).run(roomId, owner);
  }, 30000);

  afterAll(() => {
    try {
      rawDb.prepare('DELETE FROM chat_room_members WHERE room_id = ?').run(roomId);
      rawDb.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(roomId);
    } catch (_) {}
  });

  it('sets MOTD when caller is moderator', async () => {
    const emits: any[] = [];
    const ioEmits: any[] = [];
    const socket: any = { id: 'sock', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { to: () => ({ emit: (ev: string, d: any) => ioEmits.push({ ev, d }) }) };
    const session: any = { user: { id: owner, username: 'O' }, currentRoomId: roomId };
    await handleSetRoomMotd({ io, socket, session, data: { motd: 'Hello' } });
    expect(ioEmits.some(e => e.ev === 'room:motd' && e.d.motd === 'Hello')).toBe(true);
  });

  it('rejects when caller is not moderator', async () => {
    const emits: any[] = [];
    const socket: any = { id: 'sock', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: 'not-mod', username: 'X' }, currentRoomId: roomId };
    await handleSetRoomMotd({ io, socket, session, data: { motd: 'Bad' } });
    expect(emits.some(e => e.ev === 'room:error')).toBe(true);
  });

  it('rejects when not in a room', async () => {
    const emits: any[] = [];
    const socket: any = { id: 'sock', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: owner, username: 'O' }, currentRoomId: null };
    await handleSetRoomMotd({ io, socket, session, data: { motd: 'X' } });
    expect(emits.some(e => e.ev === 'room:error')).toBe(true);
  });

  it('truncates MOTD to 500 chars', async () => {
    const ioEmits: any[] = [];
    const socket: any = { id: 'sock', emit: () => {} };
    const io: any = { to: () => ({ emit: (ev: string, d: any) => ioEmits.push({ ev, d }) }) };
    const session: any = { user: { id: owner, username: 'O' }, currentRoomId: roomId };
    const longMotd = 'a'.repeat(600);
    await handleSetRoomMotd({ io, socket, session, data: { motd: longMotd } });
    const broadcast = ioEmits.find(e => e.ev === 'room:motd');
    expect(broadcast?.d.motd?.length).toBe(500);
    // Persisted row also reflects truncation
    const row = rawDb.prepare('SELECT motd FROM chat_rooms WHERE room_id = ?').get(roomId) as any;
    expect(row.motd.length).toBe(500);
  });

  it('null motd clears the row and broadcasts null', async () => {
    // First set a known value
    rawDb.prepare(`UPDATE chat_rooms SET motd = 'temp' WHERE room_id = ?`).run(roomId);
    const ioEmits: any[] = [];
    const socket: any = { id: 'sock', emit: () => {} };
    const io: any = { to: () => ({ emit: (ev: string, d: any) => ioEmits.push({ ev, d }) }) };
    const session: any = { user: { id: owner, username: 'O' }, currentRoomId: roomId };
    await handleSetRoomMotd({ io, socket, session, data: { motd: null } });
    const broadcast = ioEmits.find(e => e.ev === 'room:motd');
    expect(broadcast?.d.motd).toBeNull();
    const row = rawDb.prepare('SELECT motd FROM chat_rooms WHERE room_id = ?').get(roomId) as any;
    expect(row.motd).toBeNull();
  });

  it('happy path also persists to chat_rooms.motd', async () => {
    rawDb.prepare(`UPDATE chat_rooms SET motd = NULL WHERE room_id = ?`).run(roomId);
    const socket: any = { id: 'sock', emit: () => {} };
    const io: any = { to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: owner, username: 'O' }, currentRoomId: roomId };
    await handleSetRoomMotd({ io, socket, session, data: { motd: 'persist-test' } });
    const row = rawDb.prepare('SELECT motd FROM chat_rooms WHERE room_id = ?').get(roomId) as any;
    expect(row.motd).toBe('persist-test');
  });
});
