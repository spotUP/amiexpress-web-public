/**
 * Edit and delete are stored and broadcast (decisions D5, D6): an author edits
 * or deletes their own message; an operator (the room's creator or a
 * chat_room_ops row) or the sysop deletes anyone's; a stranger can do neither.
 * History carries the edited flag and omits deleted rows.
 * Real SQLite (in memory) behind the real repositories and handlers.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/database', () => {
  const Sqlite = require('better-sqlite3');
  const { RoomOperatorRepository } = require('../../src/database/room-operator-repository');
  const { MessageEditRepository } = require('../../src/database/message-edit-repository');
  const sqlite = new Sqlite(':memory:');
  sqlite.exec(`
    CREATE TABLE chat_rooms (room_id TEXT UNIQUE, created_by TEXT);
    CREATE TABLE chat_room_ops (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, UNIQUE(room_id, user_id));
    CREATE TABLE chat_room_messages (
      id INTEGER PRIMARY KEY, room_id TEXT, sender_id TEXT, sender_username TEXT, message TEXT,
      created_at INTEGER DEFAULT 1, edited INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0
    );
    INSERT INTO chat_rooms VALUES ('r7', '9');
    INSERT INTO chat_room_messages (id, room_id, sender_id, sender_username, message) VALUES
      (1, 'r7', '2', 'alice', 'one'), (2, 'r7', '2', 'alice', 'two'), (3, 'r7', '2', 'alice', 'three'), (4, 'r7', '2', 'alice', 'four');
  `);
  const ops = () => new RoomOperatorRepository(sqlite);
  const edits = () => new MessageEditRepository(sqlite);
  return {
    db: {
      getMessageById: async (id: number) => sqlite.prepare('SELECT * FROM chat_room_messages WHERE id = ?').get(id),
      isRoomOperator: (r: string, u: string) => ops().isRoomOperator(r, u),
      editRoomMessage: (id: number, c: string) => edits().editMessage(id, c),
      deleteRoomMessage: (id: number) => edits().deleteMessage(id),
    },
    __sqlite: sqlite,
    __ops: ops,
  };
});

import { handleEdit, handleDelete } from '../../src/server/message-edit-socket-handlers';
import { setGroupChatDependencies, handleRoomJoin } from '../../src/handlers/chat/group-chat.handler';
import { RoomOperatorRepository } from '../../src/database/room-operator-repository';
import * as dbModule from '../../src/database';
import { roomMember, clearRoomMembers } from '../helpers/room-members';

const sqlite = (dbModule as any).__sqlite;
const ROOM = { room_id: 'r7', room_name: 'general', topic: 'hi', is_public: 1, is_invite_only: 0, password: null, max_users: 100 };
const roomDb: any = {
  getChatRoom: async () => ROOM, getChatRoomByName: async () => ROOM, getRoomMembers: async () => [],
  getRoomMemberCount: async () => 1, isUserInRoom: async () => false, hasInvite: async () => false,
  joinChatRoom: async () => undefined, revokeInvite: async () => undefined, leaveChatRoom: async () => undefined,
  getChatRoomHistory: async () =>
    sqlite.prepare('SELECT * FROM chat_room_messages WHERE COALESCE(deleted, 0) = 0 ORDER BY id').all(),
  getReactionCountsFor: async () => ({}),
};

function caller(nodeId: number, user: Record<string, unknown>) {
  const errors: string[] = [];
  const socket: any = { id: `member-${nodeId}`, emit: (e: string, p: any) => { if (e === 'chat:error') errors.push(p.error); return true; } };
  const m = roomMember(nodeId, { user, currentRoomId: 'r7' });
  return { socket, session: m.session, member: m, errors };
}

afterEach(() => clearRoomMembers());

describe('message edit and delete', () => {
  it('lets the author edit and delete, refuses a stranger, and lets an op or the sysop delete', async () => {
    const alice = caller(2, { id: 2, username: 'alice', secLevel: 10 });
    const eve = caller(3, { id: 3, username: 'eve', secLevel: 10 });
    const boss = caller(9, { id: 9, username: 'boss', secLevel: 10 }); // creator of r7
    const helper = caller(4, { id: 4, username: 'helper', secLevel: 10 });
    const sysop = caller(5, { id: 5, username: 'spot', secLevel: 255 });
    setGroupChatDependencies({ db: roomDb, sessions: new Map(), io: {} } as never);

    // Author edit: stored, flagged, broadcast to every room member.
    await handleEdit(alice.socket, alice.session, { messageId: '1', content: 'one, fixed' });
    expect(sqlite.prepare('SELECT message, edited FROM chat_room_messages WHERE id = 1').get()).toEqual({ message: 'one, fixed', edited: 1 });
    const edited = eve.member.of('chat:edited') as any[];
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({ messageId: '1', username: 'alice', content: 'one, fixed', edited: true });

    // A stranger can neither edit nor delete someone else's line.
    await handleEdit(eve.socket, eve.session, { messageId: '1', content: 'hacked' });
    await handleDelete(eve.socket, eve.session, { messageId: '2' });
    expect(eve.errors).toHaveLength(2);
    expect(sqlite.prepare('SELECT message, deleted FROM chat_room_messages WHERE id = 2').get()).toEqual({ message: 'two', deleted: 0 });
    expect(alice.member.of('chat:deleted')).toHaveLength(0);

    // Not even an op or the sysop edits another's text.
    await handleEdit(boss.socket, boss.session, { messageId: '1', content: 'hacked' });
    expect(boss.errors).toHaveLength(1);

    // Author delete, then the creator (auto op), a granted op and the sysop.
    await handleDelete(alice.socket, alice.session, { messageId: '2' });
    await handleDelete(boss.socket, boss.session, { messageId: '3' });
    await handleDelete(helper.socket, helper.session, { messageId: '4' }); // not an op yet
    expect(helper.errors).toHaveLength(1);
    await new RoomOperatorRepository(sqlite).addOperator('r7', '4');
    await handleDelete(helper.socket, helper.session, { messageId: '4' });
    sqlite.exec("INSERT INTO chat_room_messages (id, room_id, sender_id, sender_username, message) VALUES (5, 'r7', '2', 'alice', 'five')");
    await handleDelete(sysop.socket, sysop.session, { messageId: '5' });
    expect((eve.member.of('chat:deleted') as any[]).map((d) => d.messageId)).toEqual(['2', '3', '4', '5']);

    // History carries the edited flag and omits the deleted rows.
    const joiner = roomMember(6, { user: { id: 6, username: 'carol' } });
    const joined: any[] = [];
    await handleRoomJoin({ id: 'member-6', emit: (e: string, p: unknown) => joined.push([e, p]) } as never, joiner.session, { roomId: 'r7' });
    const history = joined.find(([e]) => e === 'room:joined')![1].history;
    expect(history.map((h: any) => h.content)).toEqual(['one, fixed']);
    expect(history[0].edited).toBe(true);
  });
});
