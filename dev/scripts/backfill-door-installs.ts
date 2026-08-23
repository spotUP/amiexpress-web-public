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
 * rows) as of 2026-08-23, and they are not near-duplicates, they are
 * different VERSIONS (e.g. ED: 5D-ED110.LHA vs 5D-ED121.LHA). Picking the
 * wrong one means BBSApi's doors-list overlay shows the wrong version.
 *
 * The authority for "what's actually installed" is the on-disk command
 * config: Commands/BBSCmd/<CMD>.info carries a LOCATION=Doors:<dir>/... line
 * naming the real install directory. When a commands directory is given,
 * a contested command is resolved by preferring the catalog row whose
 * install_dir ends with that directory segment (case-insensitive -
 * AmigaDOS paths are). No .info, no LOCATION line, or no row whose
 * install_dir matches: fall back to the most recently indexed row
 * (highest rowid) for that command.
 */
import * as fs from 'fs';
import * as path from 'path';

// better-sqlite3 lives only in web/backend/node_modules - dev/scripts has no
// node_modules of its own, so plain `require('better-sqlite3')` does not
// resolve here. Require it by explicit path instead, matching the existing
// pattern in dev/scripts/verify-config-tables.ts.
const Database = require(
  path.join(__dirname, '..', '..', 'web', 'backend', 'node_modules', 'better-sqlite3')
);

export interface BackfillCounts {
  migrated: number;
  /** Row had no installed_as - cannot become an install record. */
  skippedNoCommand: number;
  /** Row lost a contest for its command name (to another catalog row in
   *  this run, or to a row already recorded by a previous run). */
  skippedDuplicate: number;
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
 */
function pickWinner(group: CatalogRow[], command: string, commandsDir: string | undefined): CatalogRow {
  if (group.length === 1) return group[0];
  if (commandsDir) {
    const segment = readInstalledDirSegment(commandsDir, command);
    if (segment) {
      const matches = group.filter(
        (row) => (row.install_dir ?? '').toLowerCase().endsWith(segment.toLowerCase())
      );
      if (matches.length > 0) {
        // If more than one row shares the winning directory (the live
        // database's contested commands all do - every version installs
        // to the same directory name), matches[0] keeps group order,
        // i.e. the most recently indexed row among the matches.
        return matches[0];
      }
    }
  }
  return group[0]; // fall back: most recently indexed row for this command
}

export function backfillDoorInstalls(dbFile: string, opts?: BackfillOptions): BackfillCounts {
  const db = new Database(dbFile);
  try {
    db.exec(fs.readFileSync(
      path.join(__dirname, '..', '..', 'web', 'backend', 'src', 'doors', 'door-installs.schema.sql'),
      'utf-8'));

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
    const now = Math.floor(Date.now() / 1000);
    for (const [command, group] of groups) {
      const winner = pickWinner(group, command, opts?.commandsDir);
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
    return { migrated, skippedNoCommand, skippedDuplicate };
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
    `[OK] backfilled ${counts.migrated} installs, ` +
    `skipped ${counts.skippedNoCommand} (no command name), ` +
    `skipped ${counts.skippedDuplicate} (lost duplicate contest)`
  );
}
