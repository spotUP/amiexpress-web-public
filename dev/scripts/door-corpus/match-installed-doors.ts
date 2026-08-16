#!/usr/bin/env node
/**
 * match-installed-doors.ts
 *
 * Task #14: link pre-catalog installed doors to their door_catalog row so
 * DOORMAN's InstalledView can surface FILE_ID.DIZ for them (it already looks
 * up entries via getCatalogEntryByCmd(command) — it just needs installed=1 /
 * installed_as / install_dir populated on the right row).
 *
 * build-door-catalog.ts already links doors at *index* time using a coarse
 * dir-name heuristic (installed dir === archive id/binary_name/corpus_id),
 * and its ON CONFLICT clause deliberately never touches installed/
 * installed_as/install_dir on re-index — so any door installed before the
 * catalog existed, or whose install dir doesn't literally match its archive
 * id, is permanently stuck at installed=0. This script is a one-time
 * backfill: it re-derives "what's installed" from Commands/BBSCmd/*.info,
 * hashes the actual installed binary, and matches it against catalog rows
 * by content (MD5) first, falling back to a name-only heuristic that
 * requires an explicit flag to apply.
 *
 * Usage:
 *   npx tsx dev/scripts/door-corpus/match-installed-doors.ts               # dry run, prints table
 *   npx tsx dev/scripts/door-corpus/match-installed-doors.ts --apply       # writes MD5 matches
 *   npx tsx dev/scripts/door-corpus/match-installed-doors.ts --apply --apply-name-matches   # + name matches
 *   npx tsx dev/scripts/door-corpus/match-installed-doors.ts --verbose
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { getExtractorForFile } from '../../../web/backend/src/utils/archive-extractor';
import { resolveArchivePath } from '../../../web/backend/src/doors/door-catalog.service';
import { AMIGA_68K_BINARY_EXT_RE } from '../../../web/backend/src/doors/door-installer';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DB_PATH = path.join(REPO_ROOT, 'database.sqlite');
const DOORS_DIR = path.join(REPO_ROOT, 'Doors');
const BBSCMD_DIR = path.join(REPO_ROOT, 'Commands', 'BBSCmd');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const APPLY_NAME_MATCHES = args.includes('--apply-name-matches');
const VERBOSE = args.includes('--verbose');

function log(msg: string) { console.log(msg); }
function verbose(msg: string) { if (VERBOSE) console.log('  ' + msg); }

// ─── Pure functions (exported for tests) ──────────────────────────────────

export interface ParsedLocation {
  cmd: string;
  /** First path segment after the doors: prefix — the install directory name. */
  dir: string;
  /** Full remainder path after the doors: prefix (may include nested segments). */
  relPath: string;
  /** Last path segment — the binary filename as recorded in the .info. */
  binaryBasename: string;
}

// Matches "Doors:", "doors:", "Doors/" (this codebase also writes doors as
// plain relative paths for TS-native doors), and "BBS:doors/" / "bbs:doors:".
const LOCATION_PREFIX_RE = /^(?:bbs:)?doors[:/]/i;

/**
 * Parse the LOCATION= tooltype out of a Commands/BBSCmd/<CMD>.info file.
 * Works on both this codebase's synthetic TEXT-format icons
 * (`TYPE=FIM\nLOCATION=Doors:...`) and real binary Amiga DiskObject icons
 * (WB_DISKMAGIC 0xE3100001) — both carry LOCATION= as a plain ASCII
 * tooltype string terminated by NUL/CR/LF, so a raw byte scan (not a
 * format-specific parser) handles both uniformly. Returns null when there
 * is no LOCATION= tag, or its value isn't rooted under a Doors: volume
 * (e.g. "bbs:amixnet/doors/REALNAMES" — a different command tree, out of
 * scope for this backfill).
 */
export function parseInfoLocation(cmd: string, data: Buffer): ParsedLocation | null {
  const key = Buffer.from('LOCATION=', 'latin1');
  const idx = data.indexOf(key);
  if (idx === -1) return null;
  const start = idx + key.length;
  let end = data.length;
  for (const term of [0x00, 0x0a, 0x0d]) {
    const t = data.indexOf(term, start);
    if (t !== -1 && t < end) end = t;
  }
  const raw = data.slice(start, end).toString('latin1').trim();
  if (!raw) return null;

  const m = LOCATION_PREFIX_RE.exec(raw);
  if (!m) return null;

  const relPath = raw.slice(m[0].length).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!relPath) return null;

  const segments = relPath.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  return {
    cmd,
    dir: segments[0],
    relPath,
    binaryBasename: segments[segments.length - 1],
  };
}

export interface CatalogRowLite {
  id: string;
  file_id_diz: string | null;
  installed: number;
  installed_as: string | null;
}

/**
 * Deterministic tie-break when more than one catalog row is a candidate
 * match for the same installed binary (duplicate archives of the same
 * door, e.g. shipped as both .LHA and .LZX, or re-released by two groups).
 * Prefer the row that actually carries a FILE_ID.DIZ (the whole point of
 * this backfill is to surface DIZ text), then the lowest id for stability
 * across runs.
 */
export function chooseCatalogRow<T extends CatalogRowLite>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const aDiz = a.file_id_diz ? 0 : 1;
    const bDiz = b.file_id_diz ? 0 : 1;
    if (aDiz !== bDiz) return aDiz - bDiz;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted[0];
}

const HUNK_MAGIC = Buffer.from([0x00, 0x00, 0x03, 0xf3]);
export function isAmigaHunk(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).equals(HUNK_MAGIC);
}

// Mirrors build-door-catalog.ts's isCandidateBinaryEntry (kept as a local
// copy rather than importing: that module's export pulls in its full
// top-level require graph purely for one predicate, and the AmigaDOS
// executable-name rule it encodes is simple/stable enough to duplicate
// without drift risk — same regex, single source of truth via
// AMIGA_68K_BINARY_EXT_RE from door-installer.ts).
export function isCandidateBinaryEntry(entryName: string): boolean {
  const base = path.basename(entryName);
  return !base.includes('.') || AMIGA_68K_BINARY_EXT_RE.test(base);
}

/**
 * Resolve a Doors:-relative path (e.g. "5DPAGER/Doors/5D/5D_Page/5D_Page")
 * to an actual file under Doors/ in this repo. Tries an exact (case-
 * sensitive) join first, then falls back to a case-insensitive directory
 * walk per path segment — Amiga paths are case-insensitive but this
 * checkout's filesystem may not be.
 */
export function resolveInstalledBinaryPath(relPath: string): string | null {
  const segments = relPath.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  let current = DOORS_DIR;
  for (const seg of segments) {
    const direct = path.join(current, seg);
    if (fs.existsSync(direct)) {
      current = direct;
      continue;
    }
    let entries: string[];
    try {
      entries = fs.readdirSync(current);
    } catch {
      return null;
    }
    const match = entries.find(e => e.toLowerCase() === seg.toLowerCase());
    if (!match) return null;
    current = path.join(current, match);
  }

  try {
    const st = fs.statSync(current);
    if (!st.isFile()) return null;
  } catch {
    return null;
  }
  return current;
}

function md5OfFile(filePath: string): string | null {
  try {
    const buf = fs.readFileSync(filePath); // binary-safe: raw Buffer, no text decode
    return crypto.createHash('md5').update(buf).digest('hex');
  } catch {
    return null;
  }
}

// ─── Enumerate installed commands ──────────────────────────────────────────

interface InstalledCommand extends ParsedLocation {
  infoFile: string;
}

function enumerateInstalledCommands(): { commands: InstalledCommand[]; skipped: Array<{ file: string; reason: string }> } {
  const commands: InstalledCommand[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];

  if (!fs.existsSync(BBSCMD_DIR)) return { commands, skipped };

  for (const file of fs.readdirSync(BBSCMD_DIR).sort()) {
    if (!file.endsWith('.info')) continue;
    const cmd = file.replace(/\.info$/, '');
    const filePath = path.join(BBSCMD_DIR, file);
    const data = fs.readFileSync(filePath); // binary-safe read

    const parsed = parseInfoLocation(cmd, data);
    if (!parsed) {
      skipped.push({ file, reason: 'no Doors:-relative LOCATION=' });
      continue;
    }
    commands.push({ ...parsed, infoFile: file });
  }

  return { commands, skipped };
}

// ─── Archive binary extraction (pure JS/WASM — same factory as the builder) ─

const archiveEntriesCache = new Map<string, Array<{ name: string; size: number }> | null>();

async function getArchiveEntries(archivePath: string): Promise<Array<{ name: string; size: number }> | null> {
  if (archiveEntriesCache.has(archivePath)) return archiveEntriesCache.get(archivePath)!;
  let result: Array<{ name: string; size: number }> | null = null;
  try {
    const extractor = await getExtractorForFile(archivePath);
    if (extractor) {
      const entries = await extractor.getEntries(archivePath);
      result = entries.map(e => ({ name: e.name, size: e.size }));
    }
  } catch (err) {
    verbose(`  archive open failed: ${archivePath}: ${(err as Error).message}`);
  }
  archiveEntriesCache.set(archivePath, result);
  return result;
}

const namedMd5Cache = new Map<string, string | null>();

/**
 * MD5 of the archive entry whose *basename* exactly matches the installed
 * binary's filename (from the .info's LOCATION= tooltype).
 *
 * Earlier version of this function reused build-door-catalog.ts's
 * "primary binary" heuristic (first isCandidateBinaryEntry+isAmigaHunk
 * match, preferring door_catalog.binary_name) — that heuristic is fine
 * when you're indexing an archive blind, but wrong here: we already know
 * exactly which filename we're looking for, and multi-door archive
 * bundles (e.g. MST-CF23.LHA ships both Doors/Conftop/Conftop020.x *and*
 * an unrelated Doors/Conftop/Usereditor) mean "the first HUNK found"
 * often isn't the file this command actually installed — verified case:
 * build-door-catalog stamped MST-CF23.LHA's binary_name as "Usereditor"
 * (isCandidateBinaryEntry rejects "Conftop020.x": the ".x" extension
 * isn't in AMIGA_68K_BINARY_EXT_RE, a classic-AmigaDOS naming convention
 * that regex doesn't cover), so matching against that stored name always
 * missed. Searching the live entry list by basename sidesteps both
 * problems: it targets the right file regardless of extension, and
 * doesn't care what build-door-catalog guessed. No isAmigaHunk gate
 * either — some installed "doors" are AREXX scripts, not HUNK binaries,
 * and content equality is still the correct test either way.
 */
// Archive entry names carry whatever separator the packer originally used
// — many older LHA/LZH archives were packed on DOS/Amiga tooling and use
// "\" throughout (e.g. "BBS\DOORS\EmP_Tools\Bulls"). path.basename() only
// splits on "/" on POSIX, so it must not be relied on here — normalize
// both separators first (same normalization buildBasenameIndex uses).
function entryBasename(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/');
  return normalized.split('/').pop() ?? normalized;
}

async function md5OfNamedEntry(archivePath: string, targetBasename: string): Promise<string | null> {
  const cacheKey = `${archivePath}::${targetBasename.toLowerCase()}`;
  if (namedMd5Cache.has(cacheKey)) return namedMd5Cache.get(cacheKey)!;

  const entries = await getArchiveEntries(archivePath);
  let result: string | null = null;

  if (entries) {
    const target = targetBasename.toLowerCase();
    const matches = entries.filter(e => !e.name.endsWith('/') && !e.name.endsWith('\\') && entryBasename(e.name).toLowerCase() === target);
    if (matches.length > 0) {
      try {
        const extractor = await getExtractorForFile(archivePath);
        if (extractor) {
          for (const m of matches) {
            const buf = await extractor.extractFile(archivePath, m.name);
            if (buf) {
              result = crypto.createHash('md5').update(buf).digest('hex');
              break;
            }
          }
        }
      } catch (err) {
        verbose(`  extract failed: ${archivePath}: ${(err as Error).message}`);
      }
    }
  }

  namedMd5Cache.set(cacheKey, result);
  return result;
}

/**
 * True when the archive is known (via the door_catalog_files index built
 * by build-door-catalog.ts) or live entry scan to contain a file with
 * this exact basename — the strongest available "this is probably the
 * right archive" signal short of a content match, and the basis for the
 * name-only fallback when content verification itself is unavailable
 * (extraction failure) rather than a positive mismatch.
 */
export function buildBasenameIndex(files: Array<{ catalog_id: string; path: string }>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const f of files) {
    const base = f.path.replace(/\\/g, '/').split('/').pop();
    if (!base) continue;
    const key = base.toLowerCase();
    if (!index.has(key)) index.set(key, new Set());
    index.get(key)!.add(f.catalog_id);
  }
  return index;
}

// ─── DB row types ───────────────────────────────────────────────────────────

interface DoorCatalogRow extends CatalogRowLite {
  archive_name: string;
  archive_path: string;
  binary_name: string | null;
  corpus_id: string | null;
  install_dir: string | null;
  name: string;
}

export function normalizeDir(dir: string): string {
  return dir.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/** Alphanumeric-only lowercase token, for stem comparisons across naming
 * conventions (archive names, corpus ids, install dirs each use different
 * separators — "-", "!", "_", " ", "'"). */
export function alnumToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const MIN_STEM_TOKEN_LEN = 4;

/**
 * Pure candidate-narrowing filter over the full door_catalog row set: exact
 * binary_name / id / corpus_id equality first (cheap, precise); when those
 * miss, fall back to archive/name stem similarity (substring either way,
 * gated by a minimum token length to avoid pathological short-token
 * matches). Roughly 43% of catalog rows have no binary_name (the archive
 * scan's HUNK sniff didn't find a match in the first 30 entries), so the
 * exact-equality branches alone miss a large share of legitimate matches —
 * this is a *candidate* filter only: every candidate is still verified by
 * content MD5 (or, for the name-fallback path, an exact binary_name
 * equality) before anything is written, so a loose/wrong stem match here
 * is harmless — it just gets discarded downstream.
 */
const MAX_STEM_CANDIDATES = 25;

export function candidateRowsForCommand<T extends { id: string; binary_name: string | null; corpus_id: string | null; archive_name: string; name: string }>(
  allRows: T[],
  entry: { dir: string; binaryBasename: string }
): T[] {
  const idToken = normalizeDir(entry.dir);
  const binToken = alnumToken(entry.binaryBasename);
  const dirToken = alnumToken(entry.dir);

  // Exact hits (binary_name/id/corpus_id) are cheap and precise — keep all
  // of them. Stem hits are a loose substring match and can occasionally be
  // numerous for short/common tokens, so they're capped: every one still
  // costs an archive extraction + MD5 downstream, and precision is already
  // enforced there, not here.
  const exact: T[] = [];
  const stem: T[] = [];
  const seen = new Set<string>();

  for (const row of allRows) {
    if (seen.has(row.id)) continue;
    if (row.binary_name && alnumToken(row.binary_name) === binToken) { exact.push(row); seen.add(row.id); continue; }
    if (row.id === idToken) { exact.push(row); seen.add(row.id); continue; }
    if (row.corpus_id && row.corpus_id.toLowerCase() === entry.dir.toLowerCase()) { exact.push(row); seen.add(row.id); continue; }
    if (dirToken.length >= MIN_STEM_TOKEN_LEN && stem.length < MAX_STEM_CANDIDATES) {
      const archiveToken = alnumToken(row.archive_name.replace(/\.(lha|lzh|lzx)$/i, ''));
      const nameToken = alnumToken(row.name || '');
      if (
        (archiveToken.length >= MIN_STEM_TOKEN_LEN && (archiveToken.includes(dirToken) || dirToken.includes(archiveToken))) ||
        (nameToken.length >= MIN_STEM_TOKEN_LEN && nameToken.includes(dirToken))
      ) {
        stem.push(row);
        seen.add(row.id);
      }
    }
  }
  return [...exact, ...stem];
}

// ─── Report row ─────────────────────────────────────────────────────────────

type MatchStatus = 'already' | 'md5' | 'name' | 'conflict' | 'unmatched' | 'no-binary' | 'no-location';

interface ReportRow {
  cmd: string;
  dir: string;
  status: MatchStatus;
  catalogId: string | null;
  archiveName: string | null;
  detail: string;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log('=== match-installed-doors ===');
  log(`Commands: ${BBSCMD_DIR}`);
  log(`Database: ${DB_PATH}`);
  log(`Mode: ${APPLY ? (APPLY_NAME_MATCHES ? 'APPLY (md5 + name matches)' : 'APPLY (md5 matches only)') : 'DRY RUN'}`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const beforeInstalled = (db.prepare('SELECT COUNT(*) as n FROM door_catalog WHERE installed = 1').get() as { n: number }).n;

  const { commands, skipped } = enumerateInstalledCommands();
  log(`\nParsed ${commands.length} Doors:-relative commands (${skipped.length} skipped: no Doors:-relative LOCATION=)`);
  for (const s of skipped) verbose(`  SKIP ${s.file}: ${s.reason}`);

  const report: ReportRow[] = [];
  const updates: Array<{ id: string; cmd: string; dir: string; archiveName: string; matchedBy: 'md5' | 'name' }> = [];

  const alreadyStmt = db.prepare('SELECT id FROM door_catalog WHERE installed_as = ? COLLATE NOCASE AND installed = 1');

  const allRows = db
    .prepare(`SELECT id, archive_name, archive_path, binary_name, corpus_id, install_dir, file_id_diz, installed, installed_as, name
               FROM door_catalog`)
    .all() as DoorCatalogRow[];
  const rowsById = new Map(allRows.map(r => [r.id, r]));
  log(`Loaded ${allRows.length} door_catalog rows for candidate matching.`);

  const fileRows = db.prepare('SELECT catalog_id, path FROM door_catalog_files').all() as Array<{ catalog_id: string; path: string }>;
  const basenameIndex = buildBasenameIndex(fileRows);
  log(`Loaded ${fileRows.length} door_catalog_files rows (${basenameIndex.size} distinct basenames) for exact-name candidate matching.`);

  // Some catalog archives bundle several unrelated door binaries together
  // (a "utility pack" LHA), so two different installed commands can each
  // legitimately MD5-match a distinct file inside the *same* archive (seen
  // in practice: dc_x107i contains both Joincnf and AquaScan, matching J
  // and f/fr/cs respectively). installed_as is a single column though —
  // the row can only be claimed by one command. Track claims made so far
  // in *this run* (a DB-only "already installed" check isn't enough, since
  // neither claim exists in the DB yet) and treat a second claim on the
  // same row as a conflict, same as claiming a row the DB already marked
  // installed under a different command.
  const claimedThisRun = new Map<string, string>(); // catalog id -> cmd

  for (const entry of commands) {
    // Already linked (either by a prior run of this script, or by
    // build-door-catalog's index-time dir heuristic) — nothing to do.
    const already = alreadyStmt.get(entry.cmd) as { id: string } | undefined;
    if (already) {
      report.push({ cmd: entry.cmd, dir: entry.dir, status: 'already', catalogId: already.id, archiveName: null, detail: 'installed_as already set' });
      continue;
    }

    const binaryPath = resolveInstalledBinaryPath(entry.relPath);
    if (!binaryPath) {
      report.push({ cmd: entry.cmd, dir: entry.dir, status: 'no-binary', catalogId: null, archiveName: null, detail: `could not resolve Doors/${entry.relPath}` });
      continue;
    }

    const installedMd5 = md5OfFile(binaryPath);
    if (!installedMd5) {
      report.push({ cmd: entry.cmd, dir: entry.dir, status: 'no-binary', catalogId: null, archiveName: null, detail: `unreadable: ${binaryPath}` });
      continue;
    }

    const basenameCatalogIds = basenameIndex.get(entry.binaryBasename.toLowerCase()) ?? new Set<string>();
    const stemCandidates = candidateRowsForCommand(allRows, entry);
    const candidateMap = new Map<string, DoorCatalogRow>();
    for (const r of stemCandidates) candidateMap.set(r.id, r);
    for (const id of basenameCatalogIds) {
      const r = rowsById.get(id);
      if (r) candidateMap.set(r.id, r);
    }
    const candidates = Array.from(candidateMap.values());

    if (candidates.length === 0) {
      report.push({ cmd: entry.cmd, dir: entry.dir, status: 'unmatched', catalogId: null, archiveName: null, detail: 'no candidate catalog rows (basename/binary_name/dir/corpus_id/stem)' });
      continue;
    }

    // Deterministic evaluation order for the conflict-vs-try-next-candidate
    // logic below: DIZ-bearing rows first, then lowest id.
    const orderedCandidates = [...candidates].sort((a, b) => {
      const aDiz = a.file_id_diz ? 0 : 1;
      const bDiz = b.file_id_diz ? 0 : 1;
      if (aDiz !== bDiz) return aDiz - bDiz;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    let md5Matched: DoorCatalogRow | null = null;
    let sawConflict = false;
    const nameCandidates: DoorCatalogRow[] = [];

    for (const row of orderedCandidates) {
      const archivePath = resolveArchivePath(row.archive_path);
      const rowMd5 = fs.existsSync(archivePath) ? await md5OfNamedEntry(archivePath, entry.binaryBasename) : null;

      if (rowMd5 && rowMd5 === installedMd5) {
        if (row.installed === 1 && row.installed_as && row.installed_as.toLowerCase() !== entry.cmd.toLowerCase()) {
          sawConflict = true;
          verbose(`  CONFLICT: ${entry.cmd} md5-matches ${row.id} but it's already installed_as=${row.installed_as}`);
          continue; // try the next candidate row
        }
        const claimedBy = claimedThisRun.get(row.id);
        if (claimedBy && claimedBy.toLowerCase() !== entry.cmd.toLowerCase()) {
          sawConflict = true;
          verbose(`  CONFLICT: ${entry.cmd} md5-matches ${row.id} but ${claimedBy} already claimed it this run`);
          continue; // try the next candidate row
        }
        md5Matched = row;
        break;
      }

      // Name-only fallback candidate: the archive is known to contain a
      // file with exactly this basename (via door_catalog_files, or the
      // live entry scan md5OfNamedEntry just did), but content couldn't
      // be verified (extraction failure -> rowMd5 is null). A *content*
      // mismatch (rowMd5 computed but different from installedMd5) is
      // evidence AGAINST a match and must not fall through to this list.
      if (rowMd5 === null && basenameCatalogIds.has(row.id)) {
        nameCandidates.push(row);
      }
    }

    if (md5Matched) {
      claimedThisRun.set(md5Matched.id, entry.cmd);
      report.push({ cmd: entry.cmd, dir: entry.dir, status: 'md5', catalogId: md5Matched.id, archiveName: md5Matched.archive_name, detail: 'content MD5 match' });
      updates.push({ id: md5Matched.id, cmd: entry.cmd, dir: entry.dir, archiveName: md5Matched.archive_name, matchedBy: 'md5' });
      continue;
    }

    // Name-only fallback: archive is known to contain a file with this
    // exact basename (door_catalog_files) but content couldn't be
    // verified (extraction failure), and not already installed under a
    // different command (DB-recorded or claimed earlier this run).
    const eligibleNameCandidates = nameCandidates.filter(r => {
      if (r.installed === 1 && r.installed_as && r.installed_as.toLowerCase() !== entry.cmd.toLowerCase()) return false;
      const claimedBy = claimedThisRun.get(r.id);
      if (claimedBy && claimedBy.toLowerCase() !== entry.cmd.toLowerCase()) return false;
      return true;
    });
    if (eligibleNameCandidates.length > 0) {
      const chosen = chooseCatalogRow(eligibleNameCandidates)!;
      claimedThisRun.set(chosen.id, entry.cmd);
      report.push({
        cmd: entry.cmd,
        dir: entry.dir,
        status: 'name',
        catalogId: chosen.id,
        archiveName: chosen.archive_name,
        detail: eligibleNameCandidates.length > 1 ? `basename match (unverified), ${eligibleNameCandidates.length} candidates` : 'basename match (unverified)',
      });
      updates.push({ id: chosen.id, cmd: entry.cmd, dir: entry.dir, archiveName: chosen.archive_name, matchedBy: 'name' });
      continue;
    }

    if (sawConflict) {
      report.push({ cmd: entry.cmd, dir: entry.dir, status: 'conflict', catalogId: null, archiveName: null, detail: 'all md5-matching candidates already installed as a different command' });
      continue;
    }

    // Last-resort widening for still-unmatched commands: some old archives
    // were packed with a missing path separator between directory and
    // filename (verified case: SAD-RQ10.LHA's file_id.diz-adjacent entry
    // is literally "bbs/doors/sceptic/f!-requestRequest.rexx" — no "/"
    // before "Request.rexx"), so the exact-basename index in
    // basenameIndex never sees it as ending in the target filename. A
    // plain path-suffix scan catches these without the exact-match index's
    // false-negative; it's only run for the residual few commands nothing
    // else matched, and — like every other candidate source — still gated
    // by a real content MD5 comparison, so a coincidental suffix hit
    // (e.g. "VDRequest.Rexx" also ends in "request.rexx") is harmless.
    const targetLower = entry.binaryBasename.toLowerCase();
    const suffixIds = new Set<string>();
    if (targetLower.length >= 6) {
      for (const f of fileRows) {
        if (suffixIds.size >= 15) break;
        if (candidateMap.has(f.catalog_id)) continue; // already tried above
        const normalized = f.path.replace(/\\/g, '/').toLowerCase();
        if (normalized.endsWith(targetLower)) suffixIds.add(f.catalog_id);
      }
    }

    let suffixMatched: DoorCatalogRow | null = null;
    for (const id of suffixIds) {
      const row = rowsById.get(id);
      if (!row) continue;
      if (row.installed === 1 && row.installed_as && row.installed_as.toLowerCase() !== entry.cmd.toLowerCase()) continue;
      const claimedBy = claimedThisRun.get(row.id);
      if (claimedBy && claimedBy.toLowerCase() !== entry.cmd.toLowerCase()) continue;
      const archivePath = resolveArchivePath(row.archive_path);
      const rowMd5 = fs.existsSync(archivePath) ? await md5OfNamedEntry(archivePath, entry.binaryBasename) : null;
      if (rowMd5 && rowMd5 === installedMd5) { suffixMatched = row; break; }
    }

    if (suffixMatched) {
      claimedThisRun.set(suffixMatched.id, entry.cmd);
      report.push({ cmd: entry.cmd, dir: entry.dir, status: 'md5', catalogId: suffixMatched.id, archiveName: suffixMatched.archive_name, detail: 'content MD5 match (path-suffix candidate)' });
      updates.push({ id: suffixMatched.id, cmd: entry.cmd, dir: entry.dir, archiveName: suffixMatched.archive_name, matchedBy: 'md5' });
    } else {
      report.push({ cmd: entry.cmd, dir: entry.dir, status: 'unmatched', catalogId: null, archiveName: null, detail: `${candidates.length + suffixIds.size} candidate row(s), no md5/name match` });
    }
  }

  // ─── Print report table ──────────────────────────────────────────────────
  log('\nCMD                  DIR                            STATUS      CATALOG_ID                    DETAIL');
  log('-'.repeat(140));
  for (const r of report) {
    log(
      `${r.cmd.padEnd(20)} ${r.dir.slice(0, 30).padEnd(30)} ${r.status.padEnd(11)} ${(r.catalogId ?? '-').slice(0, 30).padEnd(30)} ${r.detail}`
    );
  }

  const counts = {
    already: report.filter(r => r.status === 'already').length,
    md5: report.filter(r => r.status === 'md5').length,
    name: report.filter(r => r.status === 'name').length,
    conflict: report.filter(r => r.status === 'conflict').length,
    unmatched: report.filter(r => r.status === 'unmatched').length,
    noBinary: report.filter(r => r.status === 'no-binary').length,
  };
  log('\n=== Summary ===');
  log(`Already matched:  ${counts.already}`);
  log(`MD5-matched:      ${counts.md5}`);
  log(`Name-matched:     ${counts.name} (requires --apply-name-matches to write)`);
  log(`Conflicts:        ${counts.conflict}`);
  log(`Unmatched:        ${counts.unmatched}`);
  log(`No binary found:  ${counts.noBinary}`);
  log(`Skipped (.info):  ${skipped.length}`);

  // ─── Apply ────────────────────────────────────────────────────────────────
  if (APPLY) {
    const toApply = updates.filter(u => u.matchedBy === 'md5' || APPLY_NAME_MATCHES);
    log(`\nApplying ${toApply.length} update(s) (${updates.filter(u => u.matchedBy === 'md5').length} md5${APPLY_NAME_MATCHES ? `, ${updates.filter(u => u.matchedBy === 'name').length} name` : ''})...`);

    const update = db.prepare(
      "UPDATE door_catalog SET installed = 1, installed_as = ?, install_dir = ? WHERE id = ?"
    );
    const applyAll = db.transaction((rows: typeof toApply) => {
      for (const u of rows) {
        update.run(u.cmd, `Doors/${u.dir}`, u.id);
      }
    });
    applyAll(toApply);

    const afterInstalled = (db.prepare('SELECT COUNT(*) as n FROM door_catalog WHERE installed = 1').get() as { n: number }).n;
    log(`door_catalog installed=1 count: ${beforeInstalled} -> ${afterInstalled}`);
  } else {
    log('\nDry run — no changes written. Re-run with --apply to write MD5 matches.');
  }

  db.close();
}

if (require.main === module) {
  main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
