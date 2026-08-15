#!/usr/bin/env node
/**
 * migrate-catalog-relative-paths.ts
 *
 * One-off migration: rewrite door_catalog.archive_path from a machine-specific
 * absolute path (e.g. "~/Code/amiexpress_doors/Archives/FAME/foo.lha"
 * or "/app/data/bbs/Archives/AmiExpress/foo.lha") to a root-relative path
 * (e.g. "FAME/foo.lha"). This is what makes the catalog portable between the
 * local dev checkout and the live server — see door-catalog.service.ts's
 * resolveArchivePath(), the single reader of this column going forward.
 *
 * Idempotent: rows that are already relative (no "/Archives/" segment) are
 * left untouched, so it's safe to re-run.
 *
 * Usage:
 *   npx tsx dev/scripts/door-corpus/migrate-catalog-relative-paths.ts [--db <path>] [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const args = process.argv.slice(2);
function parseArgValue(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}
const DB_PATH = parseArgValue('--db') ?? path.join(REPO_ROOT, 'database.sqlite');
const DRY_RUN = args.includes('--dry-run');

function toRelative(archivePath: string): string {
  if (!path.isAbsolute(archivePath)) return archivePath;
  const marker = `${path.sep}Archives${path.sep}`;
  const idx = archivePath.lastIndexOf(marker);
  if (idx === -1) return archivePath;
  return archivePath.slice(idx + marker.length);
}

function main(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: database not found: ${DB_PATH}`);
    process.exit(1);
  }

  console.log(`=== Migrate door_catalog.archive_path -> relative form ===`);
  console.log(`Database: ${DB_PATH}${DRY_RUN ? ' (dry run)' : ''}`);

  const db = new Database(DB_PATH);
  const rows = db.prepare('SELECT id, archive_path FROM door_catalog').all() as
    Array<{ id: string; archive_path: string }>;

  let changed = 0;
  let unchanged = 0;
  let unresolvable = 0;

  const update = db.prepare('UPDATE door_catalog SET archive_path = ? WHERE id = ?');
  const updateAll = db.transaction((changes: Array<{ id: string; rel: string }>) => {
    for (const c of changes) update.run(c.rel, c.id);
  });

  const pending: Array<{ id: string; rel: string }> = [];

  for (const row of rows) {
    const rel = toRelative(row.archive_path);
    if (rel === row.archive_path) {
      if (path.isAbsolute(row.archive_path)) {
        unresolvable++;
        console.warn(`  WARN: no /Archives/ segment found, left as-is: ${row.archive_path}`);
      } else {
        unchanged++;
      }
      continue;
    }
    changed++;
    pending.push({ id: row.id, rel });
  }

  if (!DRY_RUN && pending.length > 0) updateAll(pending);

  console.log(`Rows scanned:      ${rows.length}`);
  console.log(`Rewritten:         ${changed}`);
  console.log(`Already relative:  ${unchanged}`);
  console.log(`Unresolvable:      ${unresolvable}`);
  if (DRY_RUN) console.log('(dry run — no changes written)');

  db.close();
}

main();
