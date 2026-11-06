/**
 * /ignore is enforced SERVER-SIDE (LiveChat decision D8): a room message from
 * an ignored user is not delivered to the ignorer - on the structured
 * chat:message event and the raw ansi-output a terminal member gets - while a
 * non-ignored sender's message IS (the sentinel). A 1:1 DM is dropped the same
 * way. Real SQLite behind the real repository, the real room-message handler
 * and the real DM handler.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/database', () => {
  const Sqlite = require('better-sqlite3');
  const { ChatIgnoreRepository } = require('../../src/database/chat-ignore-repository');
  const sqlite = new Sqlite(':memory:');
  sqlite.exec(`
    CREATE TABLE chat_ignores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, ignored_username TEXT NOT NULL,
      created_at INTEGER DEFAULT 0, UNIQUE(owner_id, ignored_username)
    );
  `);
  const repo = new ChatIgnoreRepository(sqlite);
  return {
    db: {
      chatIgnores: () => repo,
      isUserMuted: async () => false,
      getChatRoom: async () => ({ room_id: 'r7', is_moderated: 0 }),
      saveChatRoomMessage: async () => 99,
      getOrCreateDmThread: async () => 'thread-1',
      saveDmMessage: async () => 5,
    },
  };
});

import { handleChatIgnore } from '../../src/handlers/chat/ignore.handler';
import { setGroupChatDependencies, handleRoomMessage } from '../../src/handlers/chat/group-chat.handler';
import { handleChatDm } from '../../src/handlers/chat/dm.handler';
import { db } from '../../src/database';
import { roomMember, clearRoomMembers } from '../helpers/room-members';

afterEach(() => clearRoomMembers());

const speak = (who: { session: any }, text: string) =>
  handleRoomMessage({ id: `sender-${who.session.nodeId}`, emit: () => true } as never, who.session, { message: text });

describe('server-side /ignore', () => {
  it('drops an ignored user\'s room message and DM before delivery, keeps everyone else', async () => {
    setGroupChatDependencies({ db: db as never, sessions: new Map(), io: {} } as never);
    const bob = roomMember(1, { user: { id: 1, username: 'bob' }, currentRoomId: 'r7' });
    const alice = roomMember(2, { user: { id: 2, username: 'alice' }, currentRoomId: 'r7' });
    const carol = roomMember(3, { user: { id: 3, username: 'carol' }, currentRoomId: 'r7' });
    const dave = roomMember(4, { user: { id: 4, username: 'dave' }, currentRoomId: 'r7' });

    // bob ignores alice through the socket-event handler; the reply carries the list.
    const reply: Array<[string, unknown]> = [];
    handleChatIgnore({ emit: (e, p) => { reply.push([e, p]); } }, bob.session, 'ignore', { user: 'Alice' });
    expect(reply).toEqual([['chat:ignore-list', { users: ['alice'] }]]);

    await speak(alice, 'from the ignored one');
    await speak(dave, 'from a stranger');

    const bobSaw = bob.of('chat:message').map((m: any) => m.content);
    const carolSaw = carol.of('chat:message').map((m: any) => m.content);
    expect(carolSaw).toEqual(['from the ignored one', 'from a stranger']); // sentinel: delivery works
    expect(bobSaw).toEqual(['from a stranger']);
    // The raw terminal copy is dropped too.
    const bobAnsi = bob.of('ansi-output').join('');
    expect(bobAnsi).not.toContain('from the ignored one');
    expect(carol.of('ansi-output').join('')).toContain('from the ignored one');

    // DMs: alice -> bob is dropped, dave -> bob is delivered.
    const delivered: Array<[string, string]> = [];
    const io: any = { to: (room: string) => ({ emit: (e: string) => delivered.push([room, e]) }) };
    const dm = (from: { session: any }, name: string) => handleChatDm({
      io, socket: { id: 'x', emit: () => true } as never, session: from.session,
      data: { to: 'bob', message: `dm from ${name}` }, resolveRecipient: async () => ({ userId: '1', socketId: null }),
    });
    await dm(alice, 'alice');
    expect(delivered).toEqual([]);
    await dm(dave, 'dave');
    expect(delivered).toContainEqual(['user:1', 'chat:dm']);

    // /unignore brings alice back.
    handleChatIgnore({ emit: () => undefined }, bob.session, 'unignore', { user: 'alice' });
    await speak(alice, 'back again');
    expect(bob.of('chat:message').map((m: any) => m.content)).toContain('back again');
  });
});
