/**
 * Custom emoji (L8, D7): the sysop adds a board-wide emoji, it persists and the
 * new list is broadcast to every door-driven session. A non-sysop add is
 * refused and stores nothing. Remove deletes; list answers the asker only.
 * Real SQLite (in memory) behind the real repository and handlers.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/database', () => {
  const Sqlite = require('better-sqlite3');
  const { CustomEmojiRepository } = require('../../src/database/custom-emoji-repository');
  const sqlite = new Sqlite(':memory:');
  sqlite.exec(`
    CREATE TABLE chat_custom_emojis (
      name TEXT PRIMARY KEY, display TEXT NOT NULL, ascii TEXT NOT NULL,
      created_by TEXT, created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
  const repo = () => new CustomEmojiRepository(sqlite);
  return {
    db: {
      listCustomEmojis: async () => repo().list(),
      upsertCustomEmoji: async (n: string, d: string, a: string, by: string) => repo().upsert(n, d, a, by),
      removeCustomEmoji: async (n: string) => repo().remove(n),
    },
  };
});

import { handleEmojiAdd, handleEmojiRemove, handleEmojiList } from '../../src/server/custom-emoji-socket-handlers';
import { setGroupChatDependencies } from '../../src/handlers/chat/group-chat.handler';
import { db } from '../../src/database';
import { roomMember, clearRoomMembers } from '../helpers/room-members';

afterEach(() => clearRoomMembers());

function setup() {
  setGroupChatDependencies({ db: {}, sessions: new Map(), io: {} } as never);
  const watcher = roomMember(1, { user: { id: 1, username: 'bob', secLevel: 10 }, clientDoorActive: true });
  const sysop = roomMember(2, { user: { id: 2, username: 'spot', secLevel: 255 }, clientDoorActive: true });
  const sent: Array<[string, unknown]> = [];
  const socket: any = { id: 'sock', emit: (e: string, p: unknown) => { sent.push([e, p]); return true; } };
  return { watcher, sysop, sent, socket };
}

describe('custom emoji', () => {
  it('sysop add persists and broadcasts; non-sysop add is refused; remove and list work', async () => {
    const { watcher, sysop, sent, socket } = setup();

    await handleEmojiAdd(socket, watcher.session, { name: 'sneaky', display: 'S', ascii: 'S' });
    expect(sent).toEqual([['chat:error', { error: 'Only the sysop can add custom emoji' }]]);
    expect(await db.listCustomEmojis()).toEqual([]);
    expect(watcher.of('chat:emoji-list')).toHaveLength(0);

    sent.length = 0;
    await handleEmojiAdd(socket, sysop.session, { name: ':Party:', display: '\u{1F389}', ascii: '(P)' });
    expect(sent).toEqual([]);
    const stored = await db.listCustomEmojis();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'party', display: '\u{1F389}', ascii: '(P)' });
    const live = watcher.of('chat:emoji-list') as Array<{ emojis: unknown[] }>;
    expect(live).toHaveLength(1);
    expect(live[0].emojis).toEqual(stored);

    await handleEmojiAdd(socket, sysop.session, { name: 'bad name', display: 'x', ascii: 'x' });
    expect(sent[0]).toEqual(['chat:error', { error: 'Invalid custom emoji' }]);

    sent.length = 0;
    await handleEmojiList(socket);
    expect(sent).toEqual([['chat:emoji-list', { emojis: stored }]]);
    expect(watcher.of('chat:emoji-list')).toHaveLength(1);

    await handleEmojiRemove(socket, watcher.session, { name: 'party' });
    expect(await db.listCustomEmojis()).toHaveLength(1);
    await handleEmojiRemove(socket, sysop.session, { name: 'party' });
    expect(await db.listCustomEmojis()).toEqual([]);
    const after = watcher.of('chat:emoji-list') as Array<{ emojis: unknown[] }>;
    expect(after).toHaveLength(2);
    expect(after[1].emojis).toEqual([]);
  });
});
