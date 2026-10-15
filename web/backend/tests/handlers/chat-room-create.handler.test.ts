// @ts-nocheck
jest.mock('../../src/services/UserFileManager', () => ({ userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() } }));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0), userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}), userToMisc: jest.fn().mockReturnValue({}), appendUser: jest.fn(),
  }
}));

import { handleRoomCreate, setGroupChatDependencies } from '../../src/handlers/chat/group-chat.handler';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) { await new Promise(r => setTimeout(r, 500)); attempts++; }
  return (global as any).testDb;
}

describe('handleRoomCreate flags', () => {
  let rawDb: any;
  const owner = `crf-o-${Date.now()}`;
  const ownerName = `crf_o_${Date.now()}`;
  const createdRooms: string[] = [];

  beforeAll(async () => {
    rawDb = (await waitForTestDb() as any).db;
    rawDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud)
      VALUES (?, ?, 'X', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run(owner, ownerName);

    const { db } = require('../../src/database');
    setGroupChatDependencies({ db, sessions: new Map(), io: { to: () => ({ emit: () => {}, except: () => ({ emit: () => {} }) }), sockets: { sockets: new Map() } } as any });
  }, 30000);

  afterAll(() => {
    for (const rid of createdRooms) {
      try {
        rawDb.prepare('DELETE FROM chat_room_members WHERE room_id = ?').run(rid);
        rawDb.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(rid);
      } catch (_) {}
    }
  });

  function makeSocket() {
    const emits: any[] = [];
    return {
      socket: { id: 'sock-' + Math.random().toString(36).slice(2), emit: (ev: string, d: any) => emits.push({ ev, d }), join: () => {} },
      emits,
    };
  }

  it('public room creation persists is_invite_only=0, is_moderated=0', async () => {
    const { socket, emits } = makeSocket();
    const session: any = { user: { id: owner, username: ownerName } };
    const roomName = `pub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await handleRoomCreate(socket, session, { roomName });
    const created = emits.find(e => e.ev === 'room:created');
    expect(created).toBeTruthy();
    const row = rawDb.prepare('SELECT is_invite_only, is_moderated, motd FROM chat_rooms WHERE room_id = ?').get(created.d.roomId) as any;
    expect(Boolean(row.is_invite_only)).toBe(false);
    expect(Boolean(row.is_moderated)).toBe(false);
    expect(row.motd).toBeFalsy();
    createdRooms.push(created.d.roomId);
  });

  it('private/invite-only room creation persists flags + auto-promotes creator to moderator', async () => {
    const { socket, emits } = makeSocket();
    const session: any = { user: { id: owner, username: ownerName } };
    const roomName = `priv_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await handleRoomCreate(socket, session, { roomName, isPublic: false, isInviteOnly: true, motd: 'private hi' });
    const created = emits.find(e => e.ev === 'room:created');
    expect(created).toBeTruthy();
    const row = rawDb.prepare('SELECT is_public, is_invite_only, motd FROM chat_rooms WHERE room_id = ?').get(created.d.roomId) as any;
    expect(Boolean(row.is_public)).toBe(false);
    expect(Boolean(row.is_invite_only)).toBe(true);
    expect(row.motd).toBe('private hi');

    const member = rawDb.prepare('SELECT is_moderator FROM chat_room_members WHERE room_id = ? AND user_id = ?').get(created.d.roomId, owner) as any;
    expect(member).toBeTruthy();
    expect(Boolean(member.is_moderator)).toBe(true);
    createdRooms.push(created.d.roomId);
  });

  it('public room creation does NOT auto-add creator to chat_room_members', async () => {
    const { socket, emits } = makeSocket();
    const session: any = { user: { id: owner, username: ownerName } };
    const roomName = `pub2_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await handleRoomCreate(socket, session, { roomName });
    const created = emits.find(e => e.ev === 'room:created');
    expect(created).toBeTruthy();
    const member = rawDb.prepare('SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?').get(created.d.roomId, owner);
    expect(member).toBeFalsy();
    createdRooms.push(created.d.roomId);
  });

  it('motd is persisted independently of invite-only', async () => {
    const { socket, emits } = makeSocket();
    const session: any = { user: { id: owner, username: ownerName } };
    const roomName = `motd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await handleRoomCreate(socket, session, { roomName, motd: 'motd-only-room' });
    const created = emits.find(e => e.ev === 'room:created');
    expect(created).toBeTruthy();
    const row = rawDb.prepare('SELECT motd FROM chat_rooms WHERE room_id = ?').get(created.d.roomId) as any;
    expect(row.motd).toBe('motd-only-room');
    createdRooms.push(created.d.roomId);
  });

  it('isModerated flag persists is_moderated=1', async () => {
    const { socket, emits } = makeSocket();
    const session: any = { user: { id: owner, username: ownerName } };
    const roomName = `mod_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await handleRoomCreate(socket, session, { roomName, isModerated: true });
    const created = emits.find(e => e.ev === 'room:created');
    expect(created).toBeTruthy();
    const row = rawDb.prepare('SELECT is_moderated FROM chat_rooms WHERE room_id = ?').get(created.d.roomId) as any;
    expect(Boolean(row.is_moderated)).toBe(true);
    createdRooms.push(created.d.roomId);
  });

  it('createCmd: --motd followed by --private keeps both flags intact', () => {
    // Door-side parsing test - pulls createCmd from chan-admin.ts to validate token splitting.
    const { createCmd } = require('../../../../Doors/livechat/commands/chan-admin');
    const ctx: any = { currentChannel: '' };
    const result = createCmd.handler(ctx, ['#room', 'topic', '--motd', '"hi"', '--private']);
    expect(result.data.motd).toBe('hi');
    expect(result.data.isPrivate).toBe(true);
  });

  it('createCmd: --motd captures multi-token text, strips surrounding quotes', () => {
    const { createCmd } = require('../../../../Doors/livechat/commands/chan-admin');
    const ctx: any = { currentChannel: '' };
    const result = createCmd.handler(ctx, ['#room', '--motd', '"hello', 'world"']);
    expect(result.data.motd).toBe('hello world');
  });
});
