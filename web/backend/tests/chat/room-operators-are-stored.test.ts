/**
 * Room topic and operators are stored and enforced (decision D6): the room's
 * creator or an op (chat_room_ops row) or the sysop sets the topic; a
 * stranger is refused; only the SYSOP grants /op; the new op can then set the
 * topic and delete another's message. A refusal stores and broadcasts nothing.
 * Real SQLite (in memory) behind the real repositories and handlers.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/database', () => {
  const Sqlite = require('better-sqlite3');
  const { RoomOperatorRepository } = require('../../src/database/room-operator-repository');
  const { MessageEditRepository } = require('../../src/database/message-edit-repository');
  const sqlite = new Sqlite(':memory:');
  sqlite.exec(`
    CREATE TABLE chat_rooms (room_id TEXT UNIQUE, room_name TEXT, topic TEXT, created_by TEXT);
    CREATE TABLE chat_room_ops (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, UNIQUE(room_id, user_id));
    CREATE TABLE users (id TEXT, username TEXT);
    CREATE TABLE chat_room_messages (
      id INTEGER PRIMARY KEY, room_id TEXT, sender_id TEXT, sender_username TEXT, message TEXT,
      created_at INTEGER DEFAULT 1, edited INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0
    );
    INSERT INTO chat_rooms VALUES ('r7', 'general', 'old topic', '9');
    INSERT INTO users VALUES ('4', 'helper'), ('3', 'eve');
    INSERT INTO chat_room_messages (id, room_id, sender_id, sender_username, message) VALUES (1, 'r7', '3', 'eve', 'one');
  `);
  const ops = () => new RoomOperatorRepository(sqlite);
  const edits = () => new MessageEditRepository(sqlite);
  return {
    db: {
      getMessageById: async (id: number) => sqlite.prepare('SELECT * FROM chat_room_messages WHERE id = ?').get(id),
      isRoomOperator: (r: string, u: string) => ops().isRoomOperator(r, u),
      addRoomOperator: (r: string, u: string) => ops().addOperator(r, u),
      removeRoomOperator: (r: string, u: string) => ops().removeOperator(r, u),
      updateChatRoom: async (r: string, u: { topic: string }) => { sqlite.prepare('UPDATE chat_rooms SET topic = ? WHERE room_id = ?').run(u.topic, r); },
      getUserByUsername: async (n: string) => sqlite.prepare('SELECT * FROM users WHERE username = ?').get(n),
      getChatRoomByName: async (n: string) => sqlite.prepare('SELECT * FROM chat_rooms WHERE room_name = ?').get(n),
      deleteChatRoom: async (r: string) => { sqlite.prepare('DELETE FROM chat_rooms WHERE room_id = ?').run(r); },
      deleteRoomMessage: (id: number) => edits().deleteMessage(id),
    },
    __sqlite: sqlite,
  };
});

import { handleSetTopic, handleOp, handleDeleteChannel } from '../../src/server/room-operator-socket-handlers';
import { handleDelete } from '../../src/server/message-edit-socket-handlers';
import { setGroupChatDependencies } from '../../src/handlers/chat/group-chat.handler';
import * as dbModule from '../../src/database';
import { roomMember, clearRoomMembers } from '../helpers/room-members';

const sqlite = (dbModule as any).__sqlite;
const topicOf = () => sqlite.prepare("SELECT topic FROM chat_rooms WHERE room_id = 'r7'").get()?.topic;

function caller(nodeId: number, user: Record<string, unknown>) {
  const errors: string[] = [];
  const socket: any = { id: `member-${nodeId}`, emit: (e: string, p: any) => { if (e === 'chat:error') errors.push(p.error); return true; } };
  const m = roomMember(nodeId, { user, currentRoomId: 'r7' });
  return { socket, session: m.session, member: m, errors };
}

afterEach(() => clearRoomMembers());

describe('room topic and operators', () => {
  it('lets an op set the topic, refuses others, and only the sysop grants op', async () => {
    const boss = caller(9, { id: 9, username: 'boss', secLevel: 10 }); // creator of r7: automatically an op
    const eve = caller(3, { id: 3, username: 'eve', secLevel: 10 });
    const helper = caller(4, { id: 4, username: 'helper', secLevel: 10 });
    const sysop = caller(5, { id: 5, username: 'spot', secLevel: 255 });
    setGroupChatDependencies({ db: {}, sessions: new Map(), io: {} } as never);

    // The creator is an op without any row: topic stored, broadcast to the room.
    await handleSetTopic(boss.socket, boss.session, { topic: 'demo night' });
    expect(topicOf()).toBe('demo night');
    expect(eve.member.of('room:topic')).toHaveLength(1);

    // A stranger is refused: nothing stored, nothing broadcast.
    await handleSetTopic(eve.socket, eve.session, { topic: 'hacked' });
    expect(eve.errors).toHaveLength(1);
    expect(topicOf()).toBe('demo night');
    expect(eve.member.of('room:topic')).toHaveLength(1);

    // Not even the creator may hand out op; only the sysop.
    await handleOp(boss.socket, boss.session, { username: 'helper', op: true });
    expect(boss.errors).toHaveLength(1);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM chat_room_ops').get().n).toBe(0);
    expect(eve.member.of('room:op-changed')).toHaveLength(0);

    // The sysop grants op; the new op sets the topic and deletes another's message.
    await handleOp(sysop.socket, sysop.session, { username: 'helper', op: true });
    expect(sqlite.prepare("SELECT user_id FROM chat_room_ops WHERE room_id = 'r7'").all()).toEqual([{ user_id: '4' }]);
    expect(eve.member.of('room:op-changed')).toHaveLength(1);
    await handleSetTopic(helper.socket, helper.session, { topic: 'helper topic' });
    expect(topicOf()).toBe('helper topic');
    await handleDelete(helper.socket, helper.session, { messageId: '1' });
    expect(sqlite.prepare('SELECT deleted FROM chat_room_messages WHERE id = 1').get()).toEqual({ deleted: 1 });

    // Revoked, the helper is a stranger again; a stranger cannot delete the channel.
    await handleOp(sysop.socket, sysop.session, { username: 'helper', op: false });
    await handleSetTopic(helper.socket, helper.session, { topic: 'again' });
    expect(helper.errors).toHaveLength(1);
    await handleDeleteChannel(eve.socket, eve.session, { channel: '#general' });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM chat_rooms').get().n).toBe(1);
    await handleDeleteChannel(sysop.socket, sysop.session, { channel: '#general' });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM chat_rooms').get().n).toBe(0);
  });
});
