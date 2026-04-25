// @ts-nocheck
jest.mock('../../src/services/UserFileManager', () => ({ userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() } }));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0), userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}), userToMisc: jest.fn().mockReturnValue({}), appendUser: jest.fn(),
  }
}));
import { parseModeString, handleRoomMode } from '../../src/handlers/chat/mode.handler';
import { handleRoomMessage, setGroupChatDependencies } from '../../src/handlers/chat/group-chat.handler';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) { await new Promise(r => setTimeout(r, 500)); attempts++; }
  return (global as any).testDb;
}

describe('parseModeString', () => {
  it('parses +i as a single token', () => {
    expect(parseModeString('+i', [])).toEqual([{ sign: '+', flag: 'i', param: undefined }]);
  });
  it('parses combined +mi as two tokens', () => {
    expect(parseModeString('+mi', [])).toEqual([
      { sign: '+', flag: 'm', param: undefined },
      { sign: '+', flag: 'i', param: undefined },
    ]);
  });
  it('parses -o with a username param', () => {
    expect(parseModeString('-o', ['alice'])).toEqual([{ sign: '-', flag: 'o', param: 'alice' }]);
  });
  it('handles alternating signs +m-i', () => {
    expect(parseModeString('+m-i', [])).toEqual([
      { sign: '+', flag: 'm', param: undefined },
      { sign: '-', flag: 'i', param: undefined },
    ]);
  });
  it('consumes one param per parametric flag in order', () => {
    expect(parseModeString('+ov', ['alice', 'bob'])).toEqual([
      { sign: '+', flag: 'o', param: 'alice' },
      { sign: '+', flag: 'v', param: 'bob' },
    ]);
  });
});

describe('handleRoomMode', () => {
  let rawDb: any;
  const owner = `mode-o-${Date.now()}`;
  const other = `mode-u-${Date.now()}`;
  const ownerName = `mode_o_${Date.now()}`;
  const otherName = `mode_u_${Date.now()}`;
  const roomId = `mode-room-${Date.now()}`;

  beforeAll(async () => {
    rawDb = (await waitForTestDb() as any).db;
    for (const [uid, uname] of [[owner, ownerName], [other, otherName]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES (?, ?, 'X', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
    rawDb.prepare(`INSERT INTO chat_rooms (room_id, room_name, created_by, created_by_username, is_public) VALUES (?, ?, ?, ?, 1)`).run(roomId, `ModeRoom_${Date.now()}`, owner, ownerName);
    rawDb.prepare(`INSERT INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator) VALUES (?, ?, ?, 'sock', 1)`).run(roomId, owner, ownerName);
    rawDb.prepare(`INSERT INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator) VALUES (?, ?, ?, 'sock2', 0)`).run(roomId, other, otherName);
  }, 30000);

  afterAll(() => {
    try {
      rawDb.prepare('DELETE FROM chat_room_members WHERE room_id = ?').run(roomId);
      rawDb.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(roomId);
    } catch (_) {}
  });

  it('+i by moderator sets is_invite_only', async () => {
    const emits: any[] = [];
    const socket: any = { id: 'sock', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { to: () => ({ emit: (ev: string, d: any) => emits.push({ ev, d }) }) };
    const session: any = { user: { id: owner, username: ownerName }, currentRoomId: roomId };
    await handleRoomMode({ io, socket, session, data: { modeString: '+i', params: [] } });
    const { db } = require('../../src/database');
    const room = await db.getChatRoom(roomId);
    expect(Boolean(room.is_invite_only)).toBe(true);
  });

  it('+o grants moderator to the named user', async () => {
    const socket: any = { id: 'sock', emit: () => {} };
    const io: any = { to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: owner, username: ownerName }, currentRoomId: roomId };
    await handleRoomMode({ io, socket, session, data: { modeString: '+o', params: [otherName] } });
    const { db } = require('../../src/database');
    expect(await db.isUserModerator(roomId, other)).toBe(true);
    // Reset for downstream tests
    await db.updateRoomMember(roomId, other, { isModerator: false });
  });

  it('+v voices the named user; -v removes it', async () => {
    const socket: any = { id: 'sock', emit: () => {} };
    const io: any = { to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: owner, username: ownerName }, currentRoomId: roomId };
    await handleRoomMode({ io, socket, session, data: { modeString: '+v', params: [otherName] } });
    const { db } = require('../../src/database');
    expect(await db.isUserVoiced(roomId, other)).toBe(true);
    await handleRoomMode({ io, socket, session, data: { modeString: '-v', params: [otherName] } });
    expect(await db.isUserVoiced(roomId, other)).toBe(false);
  });

  it('+m by moderator sets is_moderated', async () => {
    const socket: any = { id: 'sock', emit: () => {} };
    const io: any = { to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: owner, username: ownerName }, currentRoomId: roomId };
    await handleRoomMode({ io, socket, session, data: { modeString: '+m', params: [] } });
    const { db } = require('../../src/database');
    const room = await db.getChatRoom(roomId);
    expect(Boolean(room.is_moderated)).toBe(true);
    // Reset
    await db.setModerated(roomId, false);
  });

  it('rejects non-moderator', async () => {
    const emits: any[] = [];
    const socket: any = { id: 'sock2', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: other, username: otherName }, currentRoomId: roomId };
    await handleRoomMode({ io, socket, session, data: { modeString: '+i', params: [] } });
    expect(emits.some(e => e.ev === 'room:error')).toBe(true);
  });

  it('owner can change mode even without moderator row', async () => {
    // Remove owner's moderator flag temporarily; owner exemption must still apply
    const { db } = require('../../src/database');
    await db.updateRoomMember(roomId, owner, { isModerator: false });
    try {
      const socket: any = { id: 'sock', emit: () => {} };
      const io: any = { to: () => ({ emit: () => {} }) };
      const session: any = { user: { id: owner, username: ownerName }, currentRoomId: roomId };
      await handleRoomMode({ io, socket, session, data: { modeString: '-i', params: [] } });
      const room = await db.getChatRoom(roomId);
      expect(Boolean(room.is_invite_only)).toBe(false);
    } finally {
      await db.updateRoomMember(roomId, owner, { isModerator: true });
    }
  });
});

describe('handleRoomMessage moderated mode (+m)', () => {
  let rawDb: any;
  const ownerM = `mm-o-${Date.now()}`;
  const otherM = `mm-u-${Date.now()}`;
  const ownerNameM = `mm_o_${Date.now()}`;
  const otherNameM = `mm_u_${Date.now()}`;
  const roomIdM = `mm-room-${Date.now()}`;

  beforeAll(async () => {
    const testDb = await waitForTestDb();
    rawDb = (testDb as any).db;
    for (const [uid, uname] of [[ownerM, ownerNameM], [otherM, otherNameM]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES (?, ?, 'X', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
    rawDb.prepare(`INSERT INTO chat_rooms (room_id, room_name, created_by, created_by_username, is_public, is_moderated) VALUES (?, ?, ?, ?, 1, 1)`).run(roomIdM, `ModRoom_${Date.now()}`, ownerM, ownerNameM);
    rawDb.prepare(`INSERT INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator) VALUES (?, ?, ?, 'sock', 1)`).run(roomIdM, ownerM, ownerNameM);
    rawDb.prepare(`INSERT INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator) VALUES (?, ?, ?, 'sock2', 0)`).run(roomIdM, otherM, otherNameM);

    const ioStub: any = {
      to: () => ({ emit: () => {}, except: () => ({ emit: () => {} }) }),
      sockets: { sockets: new Map() },
    };
    setGroupChatDependencies({ db: testDb, sessions: new Map(), io: ioStub });
  }, 30000);

  afterAll(() => {
    try {
      rawDb.prepare('DELETE FROM chat_room_members WHERE room_id = ?').run(roomIdM);
      rawDb.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(roomIdM);
    } catch (_) {}
  });

  it('non-mod, non-voiced user is rejected in moderated room', async () => {
    const emits: any[] = [];
    const socket: any = { id: 'sock2', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const session: any = { user: { id: otherM, username: otherNameM }, currentRoomId: roomIdM };
    await handleRoomMessage(socket, session, { message: 'hi' });
    expect(emits.some(e => e.ev === 'room:error' && /moderated/i.test(JSON.stringify(e.d)))).toBe(true);
  });

  it('voiced user can send in moderated room', async () => {
    const { db } = require('../../src/database');
    await db.setVoiced(roomIdM, otherM, true);
    const emits: any[] = [];
    const socket: any = { id: 'sock2', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const session: any = { user: { id: otherM, username: otherNameM }, currentRoomId: roomIdM };
    await handleRoomMessage(socket, session, { message: 'hi voiced' });
    // Did NOT emit room:error with 'moderated'
    const blocked = emits.some(e => e.ev === 'room:error' && /moderated/i.test(JSON.stringify(e.d)));
    expect(blocked).toBe(false);
    await db.setVoiced(roomIdM, otherM, false);
  });

  it('moderator can send in moderated room', async () => {
    const emits: any[] = [];
    const socket: any = { id: 'sock', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const session: any = { user: { id: ownerM, username: ownerNameM }, currentRoomId: roomIdM };
    await handleRoomMessage(socket, session, { message: 'mod speaks' });
    const blocked = emits.some(e => e.ev === 'room:error' && /moderated/i.test(JSON.stringify(e.d)));
    expect(blocked).toBe(false);
  });
});
