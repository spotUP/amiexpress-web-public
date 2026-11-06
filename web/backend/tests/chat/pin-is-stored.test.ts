/**
 * Pinning a message stores it. Live, every pin failed with
 * "this.db.prepare is not a function": the handlers built PinRepository on
 * the Database wrapper instead of its SQLite handle. The wrapper here has no
 * prepare, only the pins() accessor, so building the repository any other way
 * fails this test. Real SQLite (in memory) behind the real repository.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/database', () => {
  const Sqlite = require('better-sqlite3');
  const { PinRepository } = require('../../src/database/pin-repository');
  const sqlite = new Sqlite(':memory:');
  sqlite.exec(`
    CREATE TABLE chat_room_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, sender_username TEXT, message TEXT, created_at INTEGER);
    INSERT INTO chat_room_messages (room_id, sender_username, message, created_at) VALUES ('r1', 'bob', 'hello', 1);
    CREATE TABLE pinned_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, message_id INTEGER NOT NULL,
      pinned_by TEXT NOT NULL, pinned_at INTEGER DEFAULT (strftime('%s', 'now')), UNIQUE(room_id, message_id));
  `);
  return { db: { pins: () => new PinRepository(sqlite) } };
});

import { handlePinAdd, handlePinList } from '../../src/server/pin-socket-handlers';

describe('LiveChat pins are stored', () => {
  it('a pin from the door reaches the table and lists back', async () => {
    const emitted: Array<[string, any]> = [];
    const socket: any = { emit: (e: string, p: any) => { emitted.push([e, p]); return true; } };
    const session: any = { user: { id: 1, username: 'spot' } };

    await handlePinAdd(socket, session, { roomId: 'r1', messageId: '1' });
    expect(emitted.find(([e]) => e === 'chat:error')).toBeUndefined();

    await handlePinList(socket, session, { roomId: 'r1' });
    const list = emitted.find(([e]) => e === 'chat:pin:list')?.[1];
    expect(list?.pinnedMessages).toHaveLength(1);
  });
});
