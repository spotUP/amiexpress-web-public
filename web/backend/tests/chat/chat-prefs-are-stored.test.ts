/**
 * LiveChat prefs are stored per user: chat:prefs-set then chat:prefs
 * round-trips for one user, does not leak to another, refuses junk and
 * oversize payloads, and does nothing without a user id. Real SQLite (in
 * memory) behind the real repository, driven through handleChatPrefs, the
 * handler both the browser socket and the door wrapper call.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/database', () => {
  const Sqlite = require('better-sqlite3');
  const { ChatPrefsRepository } = require('../../src/database/chat-prefs-repository');
  const sqlite = new Sqlite(':memory:');
  sqlite.exec(`CREATE TABLE chat_prefs (owner_id TEXT PRIMARY KEY, prefs_json TEXT NOT NULL, updated_at INTEGER)`);
  return { db: { chatPrefs: () => new ChatPrefsRepository(sqlite) } };
});

import { handleChatPrefs } from '../../src/handlers/chat/prefs.handler';

function client(id: number | undefined) {
  const replies: any[] = [];
  const socket = { emit: (e: string, p: any) => { if (e === 'chat:prefs') replies.push(p); return true; } };
  const session: any = { user: id === undefined ? undefined : { id, username: `u${id}` } };
  return {
    replies,
    set: (prefs: unknown) => handleChatPrefs(socket, session, 'set', { prefs }),
    get: () => handleChatPrefs(socket, session, 'get'),
  };
}

describe('LiveChat prefs are stored', () => {
  it('round-trips per user, never leaks, refuses junk', () => {
    const a = client(1);
    const b = client(2);
    a.set({ pinnedChannels: ['help'], compactMode: true });
    expect(a.replies.pop()).toEqual({ prefs: { pinnedChannels: ['help'], compactMode: true } });

    a.get();
    expect(a.replies.pop().prefs.pinnedChannels).toEqual(['help']);
    b.get();
    expect(b.replies.pop()).toEqual({ prefs: {} });

    a.set(['not', 'an', 'object']);
    a.set({ blob: 'x'.repeat(9000) });
    expect(a.replies).toHaveLength(0);
    a.get();
    expect(a.replies.pop().prefs.compactMode).toBe(true);

    const anon = client(undefined);
    anon.set({ compactMode: false });
    anon.get();
    expect(anon.replies).toHaveLength(0);
  });
});
