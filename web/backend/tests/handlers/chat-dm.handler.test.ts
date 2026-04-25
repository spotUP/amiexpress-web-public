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

import { handleChatDm, handleChatGroupDm } from '../../src/handlers/chat/dm.handler';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) { await new Promise(r => setTimeout(r, 500)); attempts++; }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('handleChatDm', () => {
  let rawDb: any;
  const uA = `dmh-a-${Date.now()}`;
  const uB = `dmh-b-${Date.now()}`;
  const unameA = `dmhuser_a_${Date.now()}`;
  const unameB = `dmhuser_b_${Date.now()}`;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    for (const [uid, uname] of [[uA, unameA], [uB, unameB]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES (?, ?, 'DM H', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
  }, 30000);

  it('delivers message to target user by username', async () => {
    const targetEmits: any[] = [];
    const senderEmits: any[] = [];

    const targetSocket: any = { id: 'sock-b', emit: (ev: string, d: any) => targetEmits.push({ ev, d }) };
    const senderSocket: any = { id: 'sock-a', emit: (ev: string, d: any) => senderEmits.push({ ev, d }) };
    // Multi-tab fanout: handler now uses io.to('user:'+userId) instead of io.to(socketId).
    const io: any = {
      sockets: { sockets: new Map([['sock-a', senderSocket], ['sock-b', targetSocket]]) },
      to: (room: string) => ({ emit: (ev: string, d: any) => { if (room === 'user:' + uB) targetSocket.emit(ev, d); } })
    };
    const session: any = { user: { id: uA, username: unameA } };

    const lookup = (username: string) => username === unameB ? { userId: uB, socketId: 'sock-b' } : null;

    await handleChatDm({ io, socket: senderSocket, session, data: { to: unameB, message: 'hi' }, resolveRecipient: lookup });

    expect(targetEmits.some(e => e.ev === 'chat:dm')).toBe(true);
    const dm = targetEmits.find(e => e.ev === 'chat:dm')!.d;
    expect(dm.from).toBe(unameA);
    expect(dm.message).toBe('hi');
  });

  it('emits error when recipient not found', async () => {
    const senderEmits: any[] = [];
    const senderSocket: any = { id: 'sock-a', emit: (ev: string, d: any) => senderEmits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: uA, username: unameA } };
    const lookup = () => null;

    await handleChatDm({ io, socket: senderSocket, session, data: { to: 'nobody', message: 'hi' }, resolveRecipient: lookup });

    expect(senderEmits.some(e => e.ev === 'chat:dm-error')).toBe(true);
  });

  it('emits chat:dm-error when message is empty', async () => {
    const senderEmits: any[] = [];
    const senderSocket: any = { id: 'sock-a', emit: (ev: string, d: any) => senderEmits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: uA, username: unameA } };
    const lookup = () => ({ userId: uB, socketId: 'sock-b' });

    await handleChatDm({ io, socket: senderSocket, session, data: { to: unameB, message: '   ' }, resolveRecipient: lookup });

    expect(senderEmits.some(e => e.ev === 'chat:dm-error')).toBe(true);
  });

  it('emits chat:dm-error when session has no user', async () => {
    const senderEmits: any[] = [];
    const senderSocket: any = { id: 'sock-a', emit: (ev: string, d: any) => senderEmits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: undefined };
    const lookup = () => null;

    await handleChatDm({ io, socket: senderSocket, session, data: { to: unameB, message: 'hi' }, resolveRecipient: lookup });

    expect(senderEmits.some(e => e.ev === 'chat:dm-error')).toBe(true);
  });

  it('persists to chat_dm_messages even when recipient is offline (no socketId)', async () => {
    const senderEmits: any[] = [];
    const toEmits: Record<string, any[]> = {};
    const senderSocket: any = { id: 'sock-a', emit: (ev: string, d: any) => senderEmits.push({ ev, d }) };
    const io: any = {
      sockets: { sockets: new Map() },
      to: (id: string) => ({ emit: (ev: string, d: any) => { (toEmits[id] = toEmits[id] || []).push({ ev, d }); } })
    };
    const session: any = { user: { id: uA, username: unameA } };
    const lookup = () => ({ userId: uB, socketId: null });  // recipient offline

    const before = rawDb.prepare('SELECT COUNT(*) as c FROM chat_dm_messages').get() as any;
    await handleChatDm({ io, socket: senderSocket, session, data: { to: unameB, message: 'offline-test' }, resolveRecipient: lookup });
    const after = rawDb.prepare('SELECT COUNT(*) as c FROM chat_dm_messages').get() as any;

    expect(after.c).toBe(before.c + 1);
    // Sender still sees the sent message
    expect(senderEmits.some(e => e.ev === 'chat:dm' && e.d.direction === 'sent')).toBe(true);
    // Multi-tab fanout: handler always emits to user:<id> regardless of socketId.
    // In production, an empty user room is a silent no-op in socket.io;
    // our mock captures the to() call but the recipient still sees nothing because
    // the room is empty. The delivered=false flag still reflects the offline state.
    const offlineSent = senderEmits.find(e => e.ev === 'chat:dm' && e.d.direction === 'sent');
    expect(offlineSent?.d.delivered).toBe(false);
  });

  it('handleChatGroupDm rejects when fewer than 3 unique participants', async () => {
    const senderEmits: any[] = [];
    const senderSocket: any = { id: 'sock-a', emit: (ev: string, d: any) => senderEmits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: uA, username: unameA } };
    // Only one recipient (the sender) -> unique size 2, not 3.
    const lookup = (u: string) => u === unameB ? { userId: uB, socketId: null } : null;

    await handleChatGroupDm({ io, socket: senderSocket, session, data: { participants: [unameB], message: 'hi' }, resolveRecipient: lookup });

    expect(senderEmits.some(e => e.ev === 'chat:dm-error')).toBe(true);
  });

  it('handleChatDm payload includes delivered=true when recipient has socket, false when offline', async () => {
    const senderEmits: any[] = [];
    const senderSocket: any = { id: 'sock-a', emit: (ev: string, d: any) => senderEmits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: uA, username: unameA } };

    // Online recipient
    await handleChatDm({ io, socket: senderSocket, session, data: { to: unameB, message: 'a' }, resolveRecipient: () => ({ userId: uB, socketId: 'sock-b' }) });
    const online = senderEmits.find(e => e.ev === 'chat:dm' && e.d.direction === 'sent');
    expect(online?.d.delivered).toBe(true);

    senderEmits.length = 0;
    // Offline recipient
    await handleChatDm({ io, socket: senderSocket, session, data: { to: unameB, message: 'b' }, resolveRecipient: () => ({ userId: uB, socketId: null }) });
    const offline = senderEmits.find(e => e.ev === 'chat:dm' && e.d.direction === 'sent');
    expect(offline?.d.delivered).toBe(false);
  });
});

describe('handleChatGroupDm', () => {
  let rawDb: any;
  const uA = `gdm-a-${Date.now()}`;
  const uB = `gdm-b-${Date.now()}`;
  const uC = `gdm-c-${Date.now()}`;
  const unameA = `gdmuser_a_${Date.now()}`;
  const unameB = `gdmuser_b_${Date.now()}`;
  const unameC = `gdmuser_c_${Date.now()}`;

  beforeAll(async () => {
    rawDb = ((global as any).testDb).db;
    for (const [uid, uname] of [[uA, unameA], [uB, unameB], [uC, unameC]]) {
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES (?, ?, 'GDM', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run(uid, uname);
    }
  }, 30000);

  it('delivers message to all participants and persists to chat_dm_messages', async () => {
    const senderEmits: any[] = [];
    const ioToCalls: Array<{ room: string; ev: string; d: any }> = [];
    const senderSocket: any = { id: 'gdm-sock-a', emit: (ev: string, d: any) => senderEmits.push({ ev, d }) };
    const io: any = {
      sockets: { sockets: new Map() },
      to: (room: string) => ({ emit: (ev: string, d: any) => ioToCalls.push({ room, ev, d }) }),
    };
    const session: any = { user: { id: uA, username: unameA } };
    const lookup = (u: string) => {
      if (u === unameB) return { userId: uB, socketId: 'gdm-sock-b' };
      if (u === unameC) return { userId: uC, socketId: 'gdm-sock-c' };
      return null;
    };

    const before = rawDb.prepare('SELECT COUNT(*) as c FROM chat_dm_messages').get() as any;
    await handleChatGroupDm({ io, socket: senderSocket, session, data: { participants: [unameB, unameC], message: 'hi team' }, resolveRecipient: lookup });
    const after = rawDb.prepare('SELECT COUNT(*) as c FROM chat_dm_messages').get() as any;

    expect(after.c).toBe(before.c + 1);

    // Sender sees direction='sent' with isGroup
    const sent = senderEmits.find(e => e.ev === 'chat:dm' && e.d.direction === 'sent');
    expect(sent).toBeTruthy();
    expect(sent.d.isGroup).toBe(true);

    // Both recipients pinged via user:<id> rooms (post Task 3.3 fix)
    const fanouts = ioToCalls.filter(c => c.ev === 'chat:dm' && c.d.direction === 'received');
    expect(fanouts.length).toBe(2);
    const rooms = fanouts.map(f => f.room).sort();
    expect(rooms).toEqual([`user:${uB}`, `user:${uC}`].sort());
  });

  it('rejects when fewer than 3 unique participants (sender + 1 recipient is 1:1, not group)', async () => {
    const emits: any[] = [];
    const senderSocket: any = { id: 's', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: uA, username: unameA } };
    const lookup = (u: string) => u === unameB ? { userId: uB, socketId: null } : null;

    await handleChatGroupDm({ io, socket: senderSocket, session, data: { participants: [unameB], message: 'hi' }, resolveRecipient: lookup });

    expect(emits.some(e => e.ev === 'chat:dm-error')).toBe(true);
  });

  it('rejects when any participant cannot be resolved', async () => {
    const emits: any[] = [];
    const senderSocket: any = { id: 's', emit: (ev: string, d: any) => emits.push({ ev, d }) };
    const io: any = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };
    const session: any = { user: { id: uA, username: unameA } };
    const lookup = (u: string) => {
      if (u === unameB) return { userId: uB, socketId: null };
      return null;
    };

    await handleChatGroupDm({ io, socket: senderSocket, session, data: { participants: [unameB, 'no-such-user'], message: 'hi' }, resolveRecipient: lookup });

    expect(emits.some(e => e.ev === 'chat:dm-error')).toBe(true);
  });
});
