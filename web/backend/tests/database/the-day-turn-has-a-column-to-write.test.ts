/**
 * THE DAY TURN HAS A COLUMN TO WRITE INTO.
 *
 * "why has my sysop login stopped working on localhost all of a sudden?"
 * (sysop, 2026-09-16). Nothing to do with the password:
 *
 *     [LOGIN] Error during login: no such column: dailybytesdld
 *
 * express.e:535 zeroes the download allowance when the day turns, and
 * `login-post.service` learned to do the same (02828601d):
 * `updateUser({ ..., dailyBytesDld: 0 })`. `fieldToColumn` falls through to
 * `field.toLowerCase()`, so that asks for a column `dailybytesdld` - and
 * nothing ever added one. The FIRST login of any new day threw, and the
 * caller could not get on at all.
 *
 * It hid for as long as it did because nothing writes that field until a day
 * boundary is crossed: the one branch no test and no session covers unless it
 * happens to be running at midnight. The live board's users table was one
 * day-turn from locking out every caller the same way.
 *
 * So this asserts the two halves that have to agree - the column the writer
 * asks for by name, and the name the schema actually has - rather than
 * trusting either on its own.
 */

import { fieldToColumnForTest } from '../../src/database/user-repository';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('the day-turn reset', () => {
  let rawDb: any;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
  }, 30000);

  const columns = (): string[] =>
    (rawDb.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name);

  it('has a column for the daily download allowance', () => {
    expect(columns()).toContain('dailybytesdld');
  });

  it('writes to the column the schema actually has', () => {
    // The two halves that have to agree. A rename on either side breaks
    // login on the next day boundary and nowhere else.
    expect(columns()).toContain(fieldToColumnForTest('dailyBytesDld'));
  });

  it('accepts the update the day turn makes', () => {
    // Driven as SQL rather than through the login flow: what threw was the
    // statement, and this is the statement.
    const row = rawDb.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
    if (!row) return;                       // an empty board proves nothing
    expect(() => {
      rawDb.prepare('UPDATE users SET dailybytesdld = ? WHERE id = ?').run(0, row.id);
    }).not.toThrow();
  });

  it('reads the allowance back, so the reset is not write-only', () => {
    const row = rawDb.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
    if (!row) return;
    rawDb.prepare('UPDATE users SET dailybytesdld = ? WHERE id = ?').run(4096, row.id);
    const read = rawDb.prepare('SELECT dailybytesdld FROM users WHERE id = ?').get(row.id) as
      { dailybytesdld: number };
    expect(read.dailybytesdld).toBe(4096);
    rawDb.prepare('UPDATE users SET dailybytesdld = ? WHERE id = ?').run(0, row.id);
  });
});
