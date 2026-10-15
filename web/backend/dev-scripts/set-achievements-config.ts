/**
 * Point a board at an achievements server, from the shell.
 *
 * The admin page writes these three columns; a dev board has no admin
 * session handy, and "none are configured" is what the ACHIEVE door
 * correctly says until they are set. This is the same write, repeatable,
 * beside the other dev-scripts.
 *
 * THE TRAP, which answers 401 from the server rather than saying anything
 * about a key: the encryption key is derived from SECRETS_KEY, else
 * JWT_SECRET, else a machine-derived dev fallback
 * (utils/secrets-encryption.util.ts). Run this WITHOUT the board's own
 * environment and the board key is encrypted under a different key than the
 * server decrypts with, which looks exactly like a wrong key at the door.
 * `dotenv` is loaded here the way `database.ts` loads it, so the script and
 * the server agree by construction, and the value is read back and compared
 * before this prints [OK] - a mismatch is caught here, not at the door.
 *
 * (A key written straight into the column as PLAINTEXT does work:
 * `decryptSecret` returns anything without the encrypted prefix unchanged,
 * for boards configured before the column was encrypted. This writes it
 * encrypted, as the admin page does.)
 *
 * Usage, from web/backend:
 *   npx tsx dev-scripts/set-achievements-config.ts <server-url> <board-key>
 *   npx tsx dev-scripts/set-achievements-config.ts --show
 *   npx tsx dev-scripts/set-achievements-config.ts --off
 *
 * Mint the key on the server itself; a board key is issued once and only
 * its hash is kept:
 *   node dist/scripts/achievements-board.js create <id> "<name>" <contact>
 */
require('dotenv').config({ override: true, quiet: true });

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { decryptSecret, encryptSecret } from '../src/utils/secrets-encryption.util';

/** The board's database, resolved the way the server resolves it. */
export function databasePath(): string {
  const url = process.env.DATABASE_URL ?? 'sqlite:./data/amiexpress.db';
  return path.resolve(process.cwd(), url.replace(/^sqlite:/, ''));
}

interface Row {
  url: string | null;
  key: string | null;
  off: number | null;
}

const SELECT =
  `SELECT achievements_server_url AS url,
          achievements_board_key AS key,
          achievements_disabled AS off
     FROM system_config`;

/**
 * Write the three columns, encrypted the way the admin page writes them.
 *
 * Exported so a test can drive the real write and read it back with the
 * same `decryptSecret` the config repository reads with
 * (database/config-repository.ts:1071).
 */
export function writeAchievementsConfig(db: Database.Database, url: string, key: string): void {
  db.prepare(
    `UPDATE system_config
        SET achievements_server_url = ?,
            achievements_board_key = ?,
            achievements_disabled = 0`
  ).run(url, encryptSecret(key));
}

/** What the board will actually use: the stored key, decrypted. */
export function readAchievementsKey(db: Database.Database): string {
  const row = db.prepare(SELECT).get() as Row | undefined;
  return row?.key ? decryptSecret(row.key) : '';
}

function show(db: Database.Database): void {
  const row = db.prepare(SELECT).get() as Row | undefined;
  if (!row) {
    console.log('[INFO] this board has no system_config row yet');
    return;
  }
  const key = row.key ? decryptSecret(row.key) : '';
  console.log(`     url      ${row.url || '(none)'}`);
  console.log(`     key      ${key ? `${key.split('.')[0]}.<secret>` : '(none)'}`);
  console.log(`     disabled ${row.off ?? 0}`);
}

function main(): void {
  const args = process.argv.slice(2);
  const dbPath = databasePath();
  if (!fs.existsSync(dbPath)) {
    console.error(`[ERROR] no database at ${dbPath} - run this from web/backend`);
    process.exit(1);
  }
  const db = new Database(dbPath);
  try {
    console.log(`[OK] ${dbPath}`);

    if (args[0] === '--show') {
      show(db);
      return;
    }

    if (args[0] === '--off') {
      // The negative is what is stored, so a board that has never heard of
      // achievements reads as enabled-but-unconfigured rather than disabled.
      db.prepare('UPDATE system_config SET achievements_disabled = 1').run();
      console.log('[OK] achievements switched off for this board');
      show(db);
      return;
    }

    const [url, key] = args;
    if (!url || !key) {
      console.error('[ERROR] usage: set-achievements-config.ts <server-url> <board-key> | --show | --off');
      process.exit(1);
    }

    writeAchievementsConfig(db, url, key);

    if (readAchievementsKey(db) !== key) {
      console.error('[ERROR] the key does not read back - SECRETS_KEY/JWT_SECRET differ from the server\'s');
      process.exit(1);
    }
    show(db);
  } finally {
    db.close();
  }
}

if (require.main === module) main();
