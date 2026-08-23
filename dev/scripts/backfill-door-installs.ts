/**
 * Seeds door_installs from the catalog rows this node had marked installed.
 *
 * Runs ONCE per node, before door_catalog's installed columns go away. A row
 * with no installed_as has no command name and cannot become an install
 * record, so it is skipped and counted rather than guessed at.
 *
 * door_installs.command is UNIQUE (one archive occupies a given command slot
 * per node), but door_catalog can hold more than one row with installed = 1
 * for the same installed_as - the live database has 14 such commands (28
 * rows) as of 2026-08-23. The cause: this BBS never cleared installed back
 * to 0 when a command name was re-used for a new install, so every archive
 * ever installed under that command stayed flagged. Some are different
 * versions of one door (ED: 5D-ED110.LHA vs 5D-ED121.LHA); some are
 * unrelated doors that happen to share a command name (Z is claimed by nine
 * archives, including both DCSXC100.LHA and 5D-ZS001.LZH). Nothing in the
 * data records which one is actually installed right now - install_dir is
 * identical across every contested command's candidates (it is the command's
 * fixed target directory, not a per-archive fact), so there is no fact here
 * to recover, only a guess to make and disclose.
 *
 * The guess: prefer the on-disk command config as the nearest thing to
 * ground truth. Commands/BBSCmd/<CMD>.info carries a
 * LOCATION=Doors:<dir>/... tooltype; when a commands directory is given and
 * exactly one candidate's install_dir ends with that directory (case
 * insensitive - AmigaDOS paths are), that row wins and is marked resolvedBy
 * 'info'. Every other case - no commandsDir, no .info, no LOCATION line, no
 * match, or an AMBIGUOUS match (more than one candidate shares the named
 * directory, which is every real contested command today) - falls back to
 * the most recently indexed row (highest rowid), marked resolvedBy
 * 'fallback'. Both the winner and the discarded rows are returned in
 * `contested` so nothing is picked silently.
 */
import * as fs from 'fs';
import * as path from 'path';

// better-sqlite3 lives only in web/backend/node_modules - dev/scripts has no
// node_modules of its own, so plain `require('better-sqlite3')` does not
// resolve here. Require it by explicit path instead, matching the existing
// pattern in dev/scripts/verify-config-tables.ts.
const betterSqlitePath = path.join(
  __dirname, '..', '..', 'web', 'backend', 'node_modules', 'better-sqlite3'
);
const Database = require(betterSqlitePath) as typeof import('better-sqlite3');

// ensureSchema is the same function door-installs.repository.ts (Task 1)
// exports and every other repository function uses - reused here rather
// than re-reading the DDL file a second time. It lives in web/backend/src
// so better-sqlite3 resolves from there the normal way when it runs; it is
// required by explicit path for the same reason Database is above. Its
// sibling functions (recordInstall, removeInstall, etc.) are NOT reused:
// they resolve their own database path from DATABASE_DIR/DATABASE_FILE,
// while this script is parameterised by an explicit dbFile argument - a
// call to recordInstall here would silently write to whatever the
// environment happens to point at instead of the file the operator named
// on the command line. That mismatch is exactly the kind of foot-gun a
// migration script must not have, so this file keeps its own INSERT
// (below) rather than calling recordInstall.
const doorInstallsRepoPath = path.join(
  __dirname, '..', '..', 'web', 'backend', 'src', 'doors', 'door-installs.repository'
);
const { ensureSchema } = require(doorInstallsRepoPath) as
  typeof import('../../web/backend/src/doors/door-installs.repository');

export interface ContestedCommand {
  command: string;
  /** archive_name of the catalog row written to door_installs. */
  winner: string;
  /** archive_name of every catalog row that lost the contest. */
  losers: string[];
  /** 'info' when the on-disk .info uniquely named the winning row's
   *  directory; 'fallback' when it came down to rowid DESC. */
  resolvedBy: 'info' | 'fallback';
}

export interface BackfillCounts {
  migrated: number;
  /** Row had no installed_as - cannot become an install record. */
  skippedNoCommand: number;
  /** Row lost a contest for its command name (to another catalog row in
   *  this run, or to a row already recorded by a previous run). */
  skippedDuplicate: number;
  /** Commands claimed by more than one installed catalog row, with the
   *  archive that won and the ones that lost. The BBS never cleared the
   *  installed flag when a command name was re-used, so these rows
   *  accumulated; which one is actually on disk is not recorded anywhere.
   *  Re-installing the door through DOORREPO writes an authoritative row. */
  contested: ContestedCommand[];
}

export interface BackfillOptions {
  /** Directory holding <COMMAND>.info files, e.g. Commands/BBSCmd. When
   *  given, disambiguates a command with more than one installed = 1
   *  catalog row by reading its .info LOCATION= line. */
  commandsDir?: string;
}

interface CatalogRow {
  id: string; archive_name: string; door_type: string | null; name: string | null;
  md5: string | null; description: string | null; category: string | null;
  version: string | null; release_group: string | null;
  installed_as: string | null; install_dir: string | null;
}

/**
 * Reads <commandsDir>/<command>.info (an AmigaDOS icon file - binary, with
 * NUL-separated ASCII tooltype strings embedded) and returns the directory
 * segment named by its LOCATION= tooltype, e.g. "Doors:5D-Edit/5D-Edit"
 * yields "5D-Edit". Returns null if the file is missing, unreadable, or has
 * no parseable LOCATION=Doors:... line.
 */
function readInstalledDirSegment(commandsDir: string, command: string): string | null {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(path.join(commandsDir, `${command}.info`));
  } catch {
    return null;
  }
  // latin1 maps each byte to the same code point 1:1, so this is a lossless
  // view of the binary file for the purpose of matching an ASCII substring.
  const text = raw.toString('latin1');
  const locationMatch = text.match(/LOCATION=([^\x00]+)/i);
  if (!locationMatch) return null;
  const location = locationMatch[1].split(/[\r\n]/)[0].trim();
  const dirMatch = location.match(/^Doors:([^/]+)/i);
  return dirMatch ? dirMatch[1] : null;
}

/**
 * Picks which of a command's contested catalog rows becomes the
 * door_installs record. `group` is in rowid-DESC order (newest first).
 * Only reports resolvedBy 'info' when the .info narrows the field to
 * exactly one candidate - an ambiguous match (more than one candidate
 * shares the named directory) is not a resolution, so it is honestly
 * reported as 'fallback' even though a commandsDir was supplied.
 */
function pickWinner(
  group: CatalogRow[],
  command: string,
  commandsDir: string | undefined
): { row: CatalogRow; resolvedBy: 'info' | 'fallback' } {
  if (commandsDir) {
    const segment = readInstalledDirSegment(commandsDir, command);
    if (segment) {
      const matches = group.filter(
        (row) => (row.install_dir ?? '').toLowerCase().endsWith(segment.toLowerCase())
      );
      if (matches.length === 1) {
        return { row: matches[0], resolvedBy: 'info' };
      }
    }
  }
  return { row: group[0], resolvedBy: 'fallback' }; // most recently indexed row
}

export function backfillDoorInstalls(dbFile: string, opts?: BackfillOptions): BackfillCounts {
  const db = new Database(dbFile);
  try {
    ensureSchema(db);

    const rows = db.prepare(
      `SELECT id, archive_name, door_type, name, md5, description, category, version,
              release_group, installed_as, install_dir
         FROM door_catalog WHERE installed = 1
         ORDER BY rowid DESC`
    ).all() as CatalogRow[];

    let skippedNoCommand = 0;
    const groups = new Map<string, CatalogRow[]>();
    for (const row of rows) {
      const command = (row.installed_as ?? '').trim();
      if (!command) {
        skippedNoCommand++;
        continue;
      }
      const existing = groups.get(command);
      if (existing) {
        existing.push(row);
      } else {
        groups.set(command, [row]);
      }
    }

    // This INSERT duplicates recordInstall's column list rather than calling
    // it (see the comment above on why recordInstall can't be reused here),
    // but it is NOT the same statement with a different name: recordInstall
    // uses ON CONFLICT DO UPDATE (a real install overwrites whatever was
    // there), while this backfill uses ON CONFLICT DO NOTHING (a one-time
    // backfill must never clobber a row a real install already wrote,
    // including one written by DOORREPO after this script ran). Two
    // deliberately different conflict rules, not one behaviour written
    // twice - if door_installs gains a column, both this list and
    // recordInstall's in door-installs.repository.ts need it.
    const insert = db.prepare(
      `INSERT INTO door_installs
         (id, catalog_id, archive_name, command, install_dir, door_type, name, md5,
          description, category, version, release_group,
          installed_at, source_url, source_revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
       ON CONFLICT(command) DO NOTHING`
    );

    let migrated = 0;
    let skippedDuplicate = 0;
    const contested: ContestedCommand[] = [];
    const now = Math.floor(Date.now() / 1000);
    for (const [command, group] of groups) {
      const { row: winner, resolvedBy } = pickWinner(group, command, opts?.commandsDir);
      if (group.length > 1) {
        contested.push({
          command,
          winner: winner.archive_name,
          losers: group.filter((row) => row !== winner).map((row) => row.archive_name),
          resolvedBy,
        });
      }
      for (const row of group) {
        if (row !== winner) {
          // Lost the contest for this command's name to the winning row -
          // never attempted, so it can't falsely inflate migrated.
          skippedDuplicate++;
          continue;
        }
        const result = insert.run(
          `local-${row.id}`, row.id, row.archive_name, command,
          row.install_dir ?? `Doors/${command}`, row.door_type, row.name, row.md5,
          row.description, row.category, row.version, row.release_group, now
        );
        // ON CONFLICT(command) DO NOTHING silently no-ops when a previous
        // run already claimed this command - count only real writes as
        // migrated so the printed totals never overstate what landed.
        if (result.changes > 0) {
          migrated++;
        } else {
          skippedDuplicate++;
        }
      }
    }
    return { migrated, skippedNoCommand, skippedDuplicate, contested };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const target = process.argv[2];
  const commandsDir = process.argv[3];
  if (!target) {
    console.error('[ERROR] usage: backfill-door-installs.ts <database.sqlite> [commands-dir]');
    process.exit(1);
  }
  const counts = backfillDoorInstalls(target, commandsDir ? { commandsDir } : undefined);
  console.log(
    `[OK] backfilled ${counts.migrated} installs ` +
    `(${counts.skippedNoCommand + counts.skippedDuplicate} skipped: ` +
    `${counts.skippedNoCommand} without a command, ${counts.skippedDuplicate} lost a contest)`
  );
  if (counts.contested.length > 0) {
    console.log(
      `[WARN] ${counts.contested.length} commands were claimed by more than one installed archive; the flag was`
    );
    console.log(
      `[WARN] never cleared when a command was re-used, so the winner is a best guess:`
    );
    for (const c of counts.contested) {
      const hidden = c.losers.length - 4;
      const shown = c.losers.slice(0, 4).join(', ') + (hidden > 0 ? `, ... (+${hidden} more)` : '');
      console.log(`[WARN]   ${c.command.padEnd(8)} -> ${c.winner} (${c.resolvedBy})  losing: ${shown}`);
    }
    console.log('[WARN] Re-install any of these through DOORREPO to record the real one.');
  }
}
