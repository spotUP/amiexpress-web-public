/**
 * A BOARD KEY ENCRYPTED UNDER THE WRONG SECRET ANSWERS 401, AND NEVER SAYS WHY.
 *
 * `achievements_board_key` is stored encrypted
 * (database/config-repository.ts:177) and read back through `decryptSecret`
 * (:1071). MEASURED, because the guess was wrong: a plaintext key written
 * straight into the column with sqlite3 WORKS - `decryptSecret` returns any
 * value without the encrypted prefix unchanged, deliberately, for boards
 * configured before the column was encrypted. That pass-through is pinned
 * below so nobody "tidies" it away and breaks those boards.
 *
 * The real trap is the other one: writing the key from a shell that does
 * not carry the board's own SECRETS_KEY / JWT_SECRET encrypts it under a
 * different key than the server decrypts with, and the result is
 * indistinguishable from a bad key at the door - the server refuses the
 * board and the caller is told to ask the sysop to check it. That bit on
 * 2026-09-07 while configuring a dev board, and it is why
 * dev-scripts/set-achievements-config.ts loads dotenv the way database.ts
 * does and reads the value back before reporting success.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const KEY = 'uproughdev.HzxLiPYc1F41oh-R7JE-IVng6wMeDFYs';
const URL = 'https://doors.example.invalid';

let dir: string;
let db: Database.Database;

/** The one table these columns live in, as much of it as this touches. */
function makeBoardDb(): Database.Database {
  const handle = new Database(path.join(dir, 'amiexpress.db'));
  handle.exec(`
    CREATE TABLE system_config (
      id INTEGER PRIMARY KEY,
      achievements_server_url TEXT DEFAULT '',
      achievements_board_key TEXT DEFAULT '',
      achievements_disabled INTEGER DEFAULT 0
    );
    INSERT INTO system_config (id) VALUES (1);
  `);
  return handle;
}

beforeEach(() => {
  process.env.SECRETS_KEY = 'a-board-secret-that-is-long-enough';
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'achkey-'));
  db = makeBoardDb();
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.SECRETS_KEY;
});

/** Loaded per test, because the module reads the environment as it loads. */
function scriptUnderTest() {
  jest.resetModules();
  return require('../../dev-scripts/set-achievements-config');
}

describe('the board key the achievements server will accept', () => {
  it('reads back as the key that was written', () => {
    const { writeAchievementsConfig, readAchievementsKey } = scriptUnderTest();

    writeAchievementsConfig(db, URL, KEY);

    expect(readAchievementsKey(db)).toBe(KEY);
    const stored = db.prepare('SELECT achievements_board_key AS key FROM system_config').get() as { key: string };
    // Encrypted at rest: the column is NOT the key.
    expect(stored.key).not.toBe(KEY);
    expect(stored.key.length).toBeGreaterThan(KEY.length);
  });

  it('still honours a plaintext column, for boards configured before this was encrypted', () => {
    const { readAchievementsKey } = scriptUnderTest();
    // Exactly what `sqlite3 ... "UPDATE system_config SET achievements_board_key='...'"` leaves.
    db.prepare('UPDATE system_config SET achievements_board_key = ?').run(KEY);

    // decryptSecret returns anything without the encrypted prefix as-is, on
    // purpose. Deleting that branch would silently break every board whose
    // key predates the encryption.
    expect(readAchievementsKey(db)).toBe(KEY);
  });

  it('does not survive being written under a different secret', () => {
    const { writeAchievementsConfig } = scriptUnderTest();
    writeAchievementsConfig(db, URL, KEY);

    // The server boots with its own secret; a script run without it wrote
    // under another one.
    process.env.SECRETS_KEY = 'the-secret-the-server-actually-runs-with';
    const { readAchievementsKey } = scriptUnderTest();

    expect(readAchievementsKey(db)).not.toBe(KEY);
  });

  it('switches the board off without losing the key', () => {
    const { writeAchievementsConfig, readAchievementsKey } = scriptUnderTest();
    writeAchievementsConfig(db, URL, KEY);

    db.prepare('UPDATE system_config SET achievements_disabled = 1').run();

    const row = db.prepare('SELECT achievements_server_url AS url, achievements_disabled AS off FROM system_config').get() as { url: string; off: number };
    expect(row.off).toBe(1);
    expect(row.url).toBe(URL);
    expect(readAchievementsKey(db)).toBe(KEY);
  });
});
