/**
 * Reactions are stored with the message (decision D2): a react persists and is
 * broadcast with the message's counts, a repeat is ignored, an unreact removes
 * it, and a late joiner's room:joined history carries the counts.
 * Real SQLite (in memory) behind the real repository and handlers; the door
 * sends message ids as strings, the handlers Number() them.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/database', () => {
  const Sqlite = require('better-sqlite3');
  const { ReactionRepository } = require('../../src/database/reaction-repository');
  const sqlite = new Sqlite(':memory:');
  sqlite.exec(`
    CREATE TABLE chat_room_messages (id INTEGER PRIMARY KEY, room_id TEXT, message TEXT);
    CREATE TABLE chat_message_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES chat_room_messages(id) ON DELETE CASCADE,
      username TEXT NOT NULL, emoji TEXT NOT NULL,
      UNIQUE(message_id, username, emoji)
    );
    INSERT INTO chat_room_messages (id, room_id, message) VALUES (42, 'r7', 'hello');
  `);
  return {
    db: {
      getMessageById: async (id: number) => sqlite.prepare('SELECT * FROM chat_room_messages WHERE id = ?').get(id),
      getReactionCountsFor: (ids: number[]) => new ReactionRepository(sqlite).getCountsFor(ids),
      addReaction: (m: number, u: string, e: string) => new ReactionRepository(sqlite).addReaction(m, u, e),
      removeReaction: (m: number, u: string, e: string) => new ReactionRepository(sqlite).removeReaction(m, u, e),
      getReactionCounts: (m: number) => new ReactionRepository(sqlite).getCounts(m),
    },
    __sqlite: sqlite,
  };
});

import { handleReact, handleUnreact } from '../../src/server/reaction-socket-handlers';
import { setGroupChatDependencies, handleRoomJoin } from '../../src/handlers/chat/group-chat.handler';
import { db } from '../../src/database';
import { roomMember, clearRoomMembers } from '../helpers/room-members';

const ROOM = { room_id: 'r7', room_name: 'general', topic: 'hi', is_public: 1, is_invite_only: 0, password: null, max_users: 100 };
const roomDb: any = {
  getChatRoom: async () => ROOM, getChatRoomByName: async () => ROOM, getRoomMembers: async () => [],
  getRoomMemberCount: async () => 1, isUserInRoom: async () => false, hasInvite: async () => false,
  joinChatRoom: async () => undefined, revokeInvite: async () => undefined, leaveChatRoom: async () => undefined,
  getChatRoomHistory: async () => [{ id: 42, sender_id: 1, sender_username: 'bob', message: 'hello', created_at: 1 }],
  getReactionCountsFor: (ids: number[]) => (db as any).getReactionCountsFor(ids),
};

afterEach(() => clearRoomMembers());

describe('message reactions', () => {
  it('persists, broadcasts counts, ignores a duplicate, removes on unreact, and replays in history', async () => {
    setGroupChatDependencies({ db: roomDb, sessions: new Map(), io: {} } as never);
    const watcher = roomMember(1, { user: { id: 1, username: 'bob' }, currentRoomId: 'r7' });
    const alice = roomMember(2, { user: { id: 2, username: 'alice' }, currentRoomId: 'r7' });
    const socket: any = { id: 'member-2', emit: () => true };

    await handleReact(socket, alice.session, { messageId: '42', emoji: 'heart' });
    await handleReact(socket, alice.session, { messageId: '42', emoji: 'heart' }); // duplicate
    const live = watcher.of('chat:reaction') as any[];
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ messageId: '42', username: 'alice', emoji: 'heart', counts: { heart: 1 } });

    // A late joiner sees the stored count in the history replay.
    const joiner = roomMember(3, { user: { id: 3, username: 'carol' } });
    const joined: any[] = [];
    await handleRoomJoin({ id: 'member-3', emit: (e: string, p: unknown) => joined.push([e, p]) } as never, joiner.session, { roomId: 'r7' });
    const replay = joined.find(([e]) => e === 'room:joined')![1];
    expect(replay.history[0].reactions).toEqual({ heart: 1 });

    await handleUnreact(socket, alice.session, { messageId: '42', emoji: 'heart' });
    const after = watcher.of('chat:reaction') as any[];
    expect(after).toHaveLength(2);
    expect(after[1]).toMatchObject({ action: 'remove', counts: {} });
    expect(await (db as any).getReactionCountsFor([42])).toEqual({});
  });
});
