/**
 * BOT_recentCallers took no actor at all: it selected the whole
 * caller_activity table, so any caller could ask the co-sysop "who has been
 * on?" and read back what the sysop had been doing, together with the handles
 * of accounts that had been erased. Every sibling read in bot-data/ takes an
 * actor and hides accounts above the caller's level - see the header of
 * users.ts, where the existence of the account is itself the leak.
 *
 * The gate lives in the row set, so a fake `query` cannot prove it: a fake
 * returns whatever rows it likes whatever the SQL asked for. This suite runs
 * the real statement against a real sqlite.
 */
import BetterSqlite3 from 'better-sqlite3';

import { BOT_recentCallers } from '../../../src/services/bot-data/activity';
import type { BOTDb } from '../../../src/services/bot-data/types';

function boardWithCallers(): BOTDb {
  const sql = new BetterSqlite3(':memory:');
  sql.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT,
      seclevel INTEGER DEFAULT 10,
      deleted_at TEXT,
      erased_at TEXT
    );
    CREATE TABLE caller_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      username TEXT,
      action TEXT,
      timestamp INTEGER
    );
  `);
  sql.exec(`
    INSERT INTO users (id, username, seclevel, deleted_at, erased_at) VALUES
      ('u-spot',  'spot',  255, NULL, NULL),
      ('u-ann',   'ann',    10, NULL, NULL),
      ('u-ghost', 'ghost',  10, NULL, '2026-01-01');
    INSERT INTO caller_activity (user_id, username, action, timestamp) VALUES
      ('u-spot',  'spot',   'edited the config', 400),
      ('u-ann',   'ann',    'login',             300),
      ('u-ghost', 'ghost',  'login',             200),
      (NULL,      'nobody', 'failed login',      100);
  `);
  return {
    getUserByUsername: async () => null,
    getUsers: async () => [],
    getConferences: async () => [],
    getMessageBases: async () => [],
    getMessages: async () => [],
    getFileAreas: async () => [],
    getFileEntries: async () => [],
    getFileStatisticsByConference: async () => null,
    getActiveSessions: async () => [],
    query: async (text: string, params: any[] = []) => ({ rows: sql.prepare(text).all(...params) as any[] }),
  };
}

describe('recent callers', () => {
  it('does not tell an ordinary caller what the sysop did', async () => {
    const { text } = await BOT_recentCallers(boardWithCallers(), { secLevel: 10 });
    expect(text).not.toContain('spot');
    expect(text).not.toContain('edited the config');
    expect(text).toContain('ann: login');
  });

  it('does tell a caller at the sysop level', async () => {
    const { text } = await BOT_recentCallers(boardWithCallers(), { secLevel: 255 });
    expect(text).toContain('spot: edited the config');
  });

  it('never names an erased account, at any level', async () => {
    for (const secLevel of [10, 255]) {
      const { text } = await BOT_recentCallers(boardWithCallers(), { secLevel });
      expect(text).not.toContain('ghost');
    }
  });

  it('keeps a row that belongs to no account - there is no account to protect', async () => {
    const { text } = await BOT_recentCallers(boardWithCallers(), { secLevel: 10 });
    expect(text).toContain('nobody: failed login');
  });

  it('fills the limit with visible rows rather than filtering after it', async () => {
    // Two rows are visible to a level-10 caller (ann, nobody), and the hidden
    // sysop row is the newest. A gate applied after LIMIT 1 returns nothing.
    const { text } = await BOT_recentCallers(boardWithCallers(), { secLevel: 10 }, 1);
    expect(text).toBe('ann: login');
  });
});
