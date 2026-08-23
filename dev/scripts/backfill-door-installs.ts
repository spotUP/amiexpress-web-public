/**
 * Seeds door_installs from the catalog rows this node had marked installed.
 *
 * Runs ONCE per node, before door_catalog's installed columns go away. A row
 * with no installed_as has no command name and cannot become an install
 * record, so it is skipped and counted rather than guessed at.
 *
 * door_installs.command is UNIQUE (one archive occupies a given command slot
 * per node), but door_catalog can hold more than one row with installed = 1
 * for the same installed_as - e.g. the live database has 14 such commands,
 * 28 rows total, as of 2026-08-23. When that happens, only the row with the
 * highest rowid (the most recently indexed catalog entry, taken as the
 * current install) is written; every other row for that command is counted
 * as skipped rather than silently dropped from the count.
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
  skipped: number;
}

interface CatalogRow {
  id: string; archive_name: string; door_type: string | null; name: string | null;
  md5: string | null; description: string | null; category: string | null;
  version: string | null; release_group: string | null;
  installed_as: string | null; install_dir: string | null;
}

export function backfillDoorInstalls(dbFile: string): BackfillCounts {
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

    const insert = db.prepare(
      `INSERT INTO door_installs
         (id, catalog_id, archive_name, command, install_dir, door_type, name, md5,
          description, category, version, release_group,
          installed_at, source_url, source_revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
       ON CONFLICT(command) DO NOTHING`
    );

    let migrated = 0;
    let skipped = 0;
    const now = Math.floor(Date.now() / 1000);
    for (const row of rows) {
      const command = (row.installed_as ?? '').trim();
      if (!command) {
        skipped++;
        continue;
      }
      const result = insert.run(
        `local-${row.id}`, row.id, row.archive_name, command,
        row.install_dir ?? `Doors/${command}`, row.door_type, row.name, row.md5,
        row.description, row.category, row.version, row.release_group, now
      );
      // ON CONFLICT(command) DO NOTHING silently no-ops for a command already
      // claimed - by an earlier run, or by another door_catalog row for the
      // same command processed earlier in this loop. Count only real writes
      // as migrated so the printed totals never overstate what landed.
      if (result.changes > 0) {
        migrated++;
      } else {
        skipped++;
      }
    }
    return { migrated, skipped };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('[ERROR] usage: backfill-door-installs.ts <database.sqlite>');
    process.exit(1);
  }
  const counts = backfillDoorInstalls(target);
  console.log(`[OK] backfilled ${counts.migrated} installs, skipped ${counts.skipped}`);
}
