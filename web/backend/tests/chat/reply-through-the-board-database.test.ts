/**
 * A reply goes through the board's own Database, not a hand-made mock.
 *
 * Local, 2026-11-06, the sysop's reply in LiveChat failed with "Failed to send
 * message": handleRoomMessage called db.updateThreadReplyCount, which
 * ChatRepository has but the Database facade did not forward, so the call
 * threw "db.updateThreadReplyCount is not a function". The handler's db was
 * typed any, and the mocked db in reply-is-a-room-message.test.ts had the
 * method, so neither tsc nor jest saw it. CHAT TOGGLE had the same hole: it
 * called db.query, a Postgres-era method the facade never had.
 */

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() },
}));

import { setGroupChatDependencies, handleRoomMessage } from '../../src/handlers/chat/group-chat.handler';
import { setChatCommandsDependencies, handleLiveChatCommand } from '../../src/handlers/chat/chat-commands.handler';

async function boardDb(): Promise<any> {
  for (let i = 0; i < 30 && !(global as any).testDb; i++) await new Promise(r => setTimeout(r, 500));
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('reply through the board database', () => {
  const stamp = Date.now();
  const userId = `reply-user-${stamp}`;
  const roomId = `reply-room-${stamp}`;
  let db: any;
  let raw: any;

  beforeAll(async () => {
    db = await boardDb();
    raw = db.db;
    raw.prepare(`
      INSERT OR IGNORE INTO users (
        id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud
      ) VALUES (?, ?, 'Reply User', 'hash', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run(userId, `replyuser_${stamp}`);
    raw.prepare('INSERT INTO chat_rooms (room_id, room_name, created_by, created_by_username) VALUES (?, ?, ?, ?)')
      .run(roomId, `replyroom${stamp}`, userId, `replyuser_${stamp}`);
  }, 30000);

  afterAll(() => {
    raw.prepare('DELETE FROM chat_room_messages WHERE room_id = ?').run(roomId);
    raw.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(roomId);
  });

  it('stores the reply and counts it on the parent', async () => {
    const parentId = Number(raw.prepare(
      'INSERT INTO chat_room_messages (room_id, sender_id, sender_username, message) VALUES (?, ?, ?, ?)',
    ).run(roomId, userId, `replyuser_${stamp}`, 'the question').lastInsertRowid);

    setGroupChatDependencies({ db, sessions: new Map(), io: {} } as never);
    const emits: Array<{ event: string; payload: any }> = [];
    const socket = { id: 'sender', emit: (event: string, payload: unknown) => emits.push({ event, payload }) } as never;
    const sender = { user: { id: userId, username: `replyuser_${stamp}` }, currentRoomId: roomId, currentRoomName: 'r', state: 'LOGGED_ON', subState: 'MENU' };

    await handleRoomMessage(socket, sender as never, { message: 'the answer', replyTo: String(parentId), clientId: 'c-1' });

    expect(emits.filter(e => e.event === 'room:error')).toEqual([]);
    const reply = raw.prepare('SELECT thread_id FROM chat_room_messages WHERE room_id = ? AND message = ?').get(roomId, 'the answer');
    expect(reply.thread_id).toBe(parentId);
    expect(raw.prepare('SELECT reply_count FROM chat_room_messages WHERE id = ?').get(parentId).reply_count).toBe(1);
  });

  it('CHAT TOGGLE flips the caller\'s availability without an error', async () => {
    setChatCommandsDependencies({ db, sessions: new Map(), io: {}, handleChatRequest: null, handleChatAccept: null, handleChatDecline: null } as never);
    const out: string[] = [];
    const socket = { id: 's', emit: (event: string, text: string) => { if (event === 'ansi-output') out.push(text); } } as never;
    const session = { user: { id: userId, username: `replyuser_${stamp}`, availableForChat: false } } as any;

    await handleLiveChatCommand(socket, session, 'TOGGLE');

    expect(out.join('')).not.toContain('Error toggling');
    expect(out.join('')).toContain('AVAILABLE');
    expect(session.user.availableForChat).toBe(true);
  });
});
