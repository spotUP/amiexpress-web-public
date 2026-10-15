#!/usr/bin/env node
/**
 * retype-door-catalog.ts
 *
 * door_catalog.door_type was populated (via build-door-catalog.ts) BEFORE
 * DD (DreamDoor) and SIM detection existed in detectDoorType
 * (web/backend/src/doors/door-installer.ts) — commit 1ad1af4bc added the
 * dreamdoor.library/DD_DoorPort branch. Every row indexed before that
 * commit is stuck with whatever the OLD detectDoorType returned, which for
 * a DreamDoor-built binary is 'XIM' (the function's own default). This is a
 * one-time re-typing sweep: re-extract each catalog row's already-recorded
 * binary_name from its archive and re-run the CURRENT detectDoorType
 * (imported read-only, never modified) on the actual bytes.
 *
 * Deliberately narrow, reusing dev/scripts/door-corpus/match-installed-doors.ts's
 * plumbing rather than reinventing it:
 *  - resolveArchivePath (door-catalog.service.ts) for archive-root resolution
 *  - getExtractorForFile (archive-extractor.ts) for portable extraction
 *  - entryBasename / matchEntriesByBasename for archive-entry basename
 *    matching (backslash-separator safe, multi-door-bundle safe)
 *
 * Known limitation carried over from match-installed-doors.ts: the pure-JS
 * LZH parser throws on some headers (e.g. 187-KB1.LZH). Those rows are
 * caught per-row, counted, and reported as skipped — NEVER falls back to
 * native lha, and the row's door_type is left untouched.
 *
 * Usage:
 *   npx tsx dev/scripts/door-corpus/retype-door-catalog.ts             # dry run, prints table
 *   npx tsx dev/scripts/door-corpus/retype-door-catalog.ts --apply     # writes door_type changes
 *   npx tsx dev/scripts/door-corpus/retype-door-catalog.ts --verbose   # also list every skipped row
 */

import * as path from 'path';
import Database from 'better-sqlite3';
import { getExtractorForFile } from '../../../web/backend/src/utils/archive-extractor';
import { resolveArchivePath } from '../../../web/backend/src/doors/door-catalog.service';
import { detectDoorType } from '../../../web/backend/src/doors/door-installer';
import { entryBasename, matchEntriesByBasename } from './match-installed-doors';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DB_PATH = path.join(REPO_ROOT, 'database.sqlite');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');

function log(msg: string) { console.log(msg); }
function verbose(msg: string) { if (VERBOSE) console.log('  ' + msg); }

// ─── Pure decision logic (exported for tests) ──────────────────────────────

export interface RetypeRowInput {
  door_type: string;
}

export type RetypeOutcome =
  | { kind: 'excluded-rexx' }
  | { kind: 'skip'; reason: string }
  | { kind: 'unchanged'; type: string }
  | { kind: 'changed'; from: string; to: string };

/**
 * The classification decision this script exists to make, isolated from all
 * I/O: given a catalog row's currently-stored door_type and either a freshly
 * detected type (from re-running detectDoorType on the row's actual binary
 * bytes) or a skip reason (extraction/lookup failed), decide what to do.
 *
 * REXX rows are TYPE=-declared, not binary-detected (detectDoorType only
 * ever sniffs 68K HUNK bytes), so they are excluded from the sweep
 * unconditionally and never reach the detected/skip branches at all —
 * mirrors the constraint that REXX rows must be left untouched.
 */
export function classifyRetype(row: RetypeRowInput, detected: string | null, skipReason?: string): RetypeOutcome {
  if (row.door_type === 'REXX') return { kind: 'excluded-rexx' };
  if (detected === null) return { kind: 'skip', reason: skipReason ?? 'unknown' };
  if (detected === row.door_type) return { kind: 'unchanged', type: detected };
  return { kind: 'changed', from: row.door_type, to: detected };
}

// ─── DB row type ────────────────────────────────────────────────────────────

interface DoorCatalogRow {
  id: string;
  archive_name: string;
  archive_path: string;
  binary_name: string | null;
  door_type: string;
}

// ─── Report rows ────────────────────────────────────────────────────────────

interface ReportEntry {
  id: string;
  archiveName: string;
  outcome: RetypeOutcome;
}

async function detectRowType(row: DoorCatalogRow): Promise<{ detected: string | null; skipReason?: string }> {
  if (!row.binary_name) {
    return { detected: null, skipReason: 'no binary_name recorded on row' };
  }

  const archivePath = resolveArchivePath(row.archive_path);
  const extractor = await getExtractorForFile(archivePath).catch((err: Error) => {
    verbose(`  getExtractorForFile threw for ${row.archive_name}: ${err.message}`);
    return null;
  });
  if (!extractor) {
    return { detected: null, skipReason: `unsupported/unreadable archive: ${row.archive_path}` };
  }

  let entries;
  try {
    entries = await extractor.getEntries(archivePath);
  } catch (err) {
    return { detected: null, skipReason: `getEntries failed: ${(err as Error).message}` };
  }

  const matches = matchEntriesByBasename(entries, row.binary_name);
  if (matches.length === 0) {
    return { detected: null, skipReason: `binary_name '${row.binary_name}' not found among ${entries.length} archive entries` };
  }

  for (const m of matches) {
    try {
      const buf = await extractor.extractFile(archivePath, m.name);
      if (buf) {
        return { detected: detectDoorType(buf) };
      }
    } catch (err) {
      verbose(`  extractFile failed for ${row.archive_name}:${m.name}: ${(err as Error).message}`);
    }
  }

  return { detected: null, skipReason: `extractFile returned no data for any of ${matches.length} matching entr${matches.length === 1 ? 'y' : 'ies'} (${matches.map(m => entryBasename(m.name)).join(', ')})` };
}

async function main() {
  log('=== retype-door-catalog ===');
  log(`Database: ${DB_PATH}`);
  log(`Mode: ${APPLY ? 'APPLY (writes door_type)' : 'DRY RUN'}`);

  const db = new Database(DB_PATH, APPLY ? {} : { readonly: true });
  db.pragma('journal_mode = WAL');

  const allRows = db
    .prepare('SELECT id, archive_name, archive_path, binary_name, door_type FROM door_catalog')
    .all() as DoorCatalogRow[];
  log(`Loaded ${allRows.length} door_catalog rows.`);

  const rexxRows = allRows.filter(r => r.door_type === 'REXX');
  const sweepRows = allRows.filter(r => r.door_type !== 'REXX');
  log(`Excluded from sweep (REXX, TYPE=-based not binary-detected): ${rexxRows.length}`);
  log(`In sweep: ${sweepRows.length}`);

  const entries: ReportEntry[] = [];

  for (const row of sweepRows) {
    const { detected, skipReason } = await detectRowType(row);
    const outcome = classifyRetype(row, detected, skipReason);
    entries.push({ id: row.id, archiveName: row.archive_name, outcome });
    if (outcome.kind === 'skip') {
      verbose(`SKIP ${row.archive_name} (${row.id}): ${outcome.reason}`);
    }
  }

  const changed = entries.filter((e): e is ReportEntry & { outcome: Extract<RetypeOutcome, { kind: 'changed' }> } => e.outcome.kind === 'changed');
  const unchanged = entries.filter(e => e.outcome.kind === 'unchanged');
  const skipped = entries.filter((e): e is ReportEntry & { outcome: Extract<RetypeOutcome, { kind: 'skip' }> } => e.outcome.kind === 'skip');

  // ─── Would-change table ───────────────────────────────────────────────────
  log('\n=== Would-change rows ===');
  log('ID                              ARCHIVE_NAME                   OLD  -> NEW');
  log('-'.repeat(90));
  for (const e of changed) {
    log(`${e.id.slice(0, 30).padEnd(32)} ${e.archiveName.slice(0, 30).padEnd(31)} ${e.outcome.from.padEnd(4)} -> ${e.outcome.to}`);
  }

  // ─── Transition summary ────────────────────────────────────────────────────
  const transitionCounts = new Map<string, number>();
  for (const e of changed) {
    const key = `${e.outcome.from}->${e.outcome.to}`;
    transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);
  }

  log('\n=== Summary ===');
  log(`Sweep rows:        ${sweepRows.length}`);
  log(`Would change:      ${changed.length}`);
  for (const [key, count] of [...transitionCounts.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${key}: ${count}`);
  }
  log(`Unchanged:          ${unchanged.length}`);
  log(`Skipped (unreadable/no-binary): ${skipped.length}`);
  log(`Excluded (REXX):    ${rexxRows.length}`);

  if (!VERBOSE && skipped.length > 0) {
    log(`(pass --verbose to list all ${skipped.length} skipped rows with reasons)`);
  } else if (VERBOSE) {
    const reasonCounts = new Map<string, number>();
    for (const e of skipped) {
      if (e.outcome.kind !== 'skip') continue;
      // Bucket by reason prefix (up to the first colon) so the summary is
      // readable even with per-file detail baked into each reason string.
      const bucket = e.outcome.reason.split(':')[0];
      reasonCounts.set(bucket, (reasonCounts.get(bucket) ?? 0) + 1);
    }
    log('\nSkip reason buckets:');
    for (const [bucket, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
      log(`  ${bucket}: ${count}`);
    }
  }

  // ─── Apply ──────────────────────────────────────────────────────────────
  if (APPLY) {
    log(`\nApplying ${changed.length} update(s)...`);
    const update = db.prepare('UPDATE door_catalog SET door_type = ? WHERE id = ?');
    const applyAll = db.transaction((rows: typeof changed) => {
      for (const e of rows) {
        update.run(e.outcome.to, e.id);
      }
    });
    applyAll(changed);
    log('Applied.');
  } else {
    log('\nDry run — no changes written. Re-run with --apply to write door_type changes.');
  }

  db.close();
}

if (require.main === module) {
  main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
