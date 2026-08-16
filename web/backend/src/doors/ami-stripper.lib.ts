/**
 * ami-stripper.lib.ts — shared junk detection + archive stripping library.
 *
 * Used by:
 *  - build-door-catalog.ts (indexing)
 *  - dev/scripts/ami-stripper.ts (CLI)
 *  - Doors/ami-stripper/ (BBS door)
 *  - DoorManager install action (strip before extracting)
 *
 * Archive reading (listing + file extraction) goes through the shared
 * portable extractor factory (getExtractorForFile — pure-JS LHA, WASM LZX,
 * adm-zip ZIP, etc.) instead of the native `lha` CLI. That CLI only exists on
 * macOS dev machines (/opt/homebrew/bin/lha) — it is absent on the live
 * Linux container, and even where present, lhasa (the Alpine/Linux `lha`
 * package) cannot create archives (no `a` command) and cannot read LZX at
 * all. The extractor factory already solved this for DoorManager's
 * install/re-extract path (see Doors/door-manager/app.ts extractArchiveTo);
 * this library follows the same pattern.
 *
 * Archive repacking (stripArchive) writes a portable ZIP via adm-zip
 * (already a project dependency, already used to author ZIPs elsewhere —
 * see amiga-export.service.ts) instead of shelling out to `lha a`. This is
 * only used by "produce a new clean archive file" consumers (the CLI tool
 * and the AmiStripper BBS door) — DoorManager's interactive Strip flow
 * strips INSTALLED (already-extracted) door directories directly via
 * analyzeDirectory/stripFilesFromDirectory, which were always pure fs and
 * never depended on the lha CLI.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getExtractorForFile, IArchiveExtractor } from '../utils/archive-extractor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

const SEEDS_DIR = path.join(__dirname, '..', '..', 'seeds');
const PATTERNS_JSON = path.join(SEEDS_DIR, 'scene-strip-patterns.json');
const FINGERPRINTS_JSON = path.join(SEEDS_DIR, 'junk-fingerprints.json');


export interface StripEntry {
  path: string;
  size: number;
  md5: string;
}

export interface StripResult {
  kept: StripEntry[];
  stripped: StripEntry[];
  reason: Record<string, 'pattern' | 'md5' | 'content-scan'>;
}

/** Result of stripArchive — outputPath is the actual file written, which may
 * differ from the requested outPath (extension is forced to .zip since the
 * repacked archive is always a portable ZIP, regardless of source format). */
export interface StripArchiveResult extends StripResult {
  outputPath: string;
}

interface PatternDb {
  filenamePatterns: string[];
  dizPatterns: string[];
}

export interface FingerprintDb {
  [md5: string]: { filename: string; archiveCount: number };
}

function loadPatterns(): PatternDb {
  if (!fs.existsSync(PATTERNS_JSON)) {
    return { filenamePatterns: [], dizPatterns: [] };
  }
  return JSON.parse(fs.readFileSync(PATTERNS_JSON, 'utf-8'));
}

function loadFingerprints(): FingerprintDb {
  if (!fs.existsSync(FINGERPRINTS_JSON)) return {};
  return JSON.parse(fs.readFileSync(FINGERPRINTS_JSON, 'utf-8'));
}

/** Open the archive with the portable extractor factory. Throws with a
 * message suitable for surfacing to a sysop if the format is unsupported. */
async function openArchive(archivePath: string): Promise<IArchiveExtractor> {
  const extractor = await getExtractorForFile(archivePath);
  if (!extractor) {
    throw new Error(`Unsupported or unreadable archive format: ${path.basename(archivePath)}`);
  }
  return extractor;
}

// The pure-JS LHA reader emits Amiga-style directory-separated names with
// '\' (its "directory" extended header joins path segments with 0xFF, which
// the parser renders as a literal backslash). Normalize to '/' for display
// and for keys in StripResult, but extractFile() must still be called with
// the archive's RAW name (extractors do an exact/case-insensitive match
// against their internal listing) — see Doors/door-manager/app.ts
// extractArchiveTo for the same normalize-for-display-only convention.
function normalizeEntryName(rawName: string): string {
  return (rawName || '').replace(/\\/g, '/');
}

// ─── Content validation ───────────────────────────────────────────────────────

const WORKBENCH_MAGIC = Buffer.from([0x00, 0x00, 0x03, 0xe7]);
const HUNK_MAGIC = Buffer.from([0x00, 0x00, 0x03, 0xf3]);

function isWorkbenchIcon(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).equals(WORKBENCH_MAGIC);
}

function isAmigaHunk(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).equals(HUNK_MAGIC);
}

function isAmigaGuide(buf: Buffer): boolean {
  const text = buf.slice(0, 512).toString('latin1').toLowerCase();
  return text.includes('@database') || text.includes('@node');
}

function isBinaryContent(buf: Buffer): boolean {
  for (let i = 0; i < Math.min(buf.length, 1024); i++) {
    const b = buf[i];
    if (b > 0x7e) return true;
    if (b < 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09 && b !== 0x0c) return true;
  }
  return false;
}

const AD_SIGNAL_PATTERNS = [
  /\+\d{1,2}[\s-]\d+/,
  /\d{3}[-. ]\d{3,4}[-. ]\d{4}/,
  /call us/i,
  /greetings from/i,
  /visit us/i,
  /logon to/i,
  /connect to/i,
  /download here/i,
];

function hasAdSignals(buf: Buffer): boolean {
  const text = buf.toString('latin1');
  return AD_SIGNAL_PATTERNS.some(re => re.test(text));
}

function matchesPattern(filename: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  try {
    return new RegExp(regexStr, 'i').test(filename);
  } catch {
    return false;
  }
}

/**
 * Junk-detection verdict for a single file. Exported (pure, no fs/network)
 * so it can be unit-tested directly against crafted patterns/fingerprints
 * without depending on the live seeds/*.json content.
 */
export function classifyFile(
  name: string,
  buf: Buffer,
  filenamePatterns: string[],
  fingerprints: FingerprintDb
): 'pattern' | 'md5' | 'content-scan' | null {
  const base = path.basename(name).toLowerCase();
  const ext = path.extname(base);

  // Content-based protection
  if (ext === '.info' && isWorkbenchIcon(buf)) return null;
  if ((ext === '.library' || ext === '') && isAmigaHunk(buf)) return null;
  if (ext === '.guide' && isAmigaGuide(buf)) return null;
  if (['.cfg', '.dat', '.data', '.stat', '.config'].includes(ext) && isBinaryContent(buf)) return null;
  if (base === 'file_id.diz') return null;

  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  if (fingerprints[md5]) return 'md5';

  for (const pat of filenamePatterns) {
    if (matchesPattern(base, pat)) return 'pattern';
  }

  // Intentionally NOT content-scanning .txt/.doc/.readme/.nfo — too many false
  // positives (phone numbers, "connect to" etc. appear in legitimate docs).
  // Those files are flagged only by filename pattern or MD5 fingerprint above.

  return null;
}

/**
 * Strip-plan derivation: given a listing of (already-read) files, sort them
 * into kept/stripped/reason via classifyFile. Pure and synchronous — shared
 * by analyzeArchive, analyzeDirectory and stripArchive so the classification
 * pass exists in exactly one place regardless of the source (archive member
 * vs. on-disk file). Exported for direct unit testing.
 */
export function deriveStripPlan(
  entries: Array<{ path: string; size: number; buf: Buffer }>,
  filenamePatterns: string[],
  fingerprints: FingerprintDb
): StripResult {
  const kept: StripEntry[] = [];
  const stripped: StripEntry[] = [];
  const reason: Record<string, 'pattern' | 'md5' | 'content-scan'> = {};

  for (const entry of entries) {
    const md5 = crypto.createHash('md5').update(entry.buf).digest('hex');
    const verdict = classifyFile(entry.path, entry.buf, filenamePatterns, fingerprints);
    if (verdict) {
      stripped.push({ path: entry.path, size: entry.size, md5 });
      reason[entry.path] = verdict;
    } else {
      kept.push({ path: entry.path, size: entry.size, md5 });
    }
  }

  return { kept, stripped, reason };
}

/** Read every real (non-directory-marker) file out of an archive via the
 * portable extractor factory. Internal — callers get a StripResult via
 * deriveStripPlan, not raw buffers, except stripArchive which needs the
 * buffers again to build the repacked ZIP. */
async function readArchiveFiles(
  extractor: IArchiveExtractor,
  archivePath: string
): Promise<Array<{ path: string; size: number; buf: Buffer }>> {
  const rawEntries = await extractor.getEntries(archivePath);
  const files: Array<{ path: string; size: number; buf: Buffer }> = [];

  for (const raw of rawEntries) {
    const name = normalizeEntryName(raw.name);
    if (!name || name.endsWith('/')) continue; // directory marker

    let buf: Buffer | null = null;
    // extractFile must be called with the RAW (possibly backslash-separated)
    // name — extractors match exactly/case-insensitively against their own
    // internal listing, so the normalized display name will not resolve.
    try { buf = await extractor.extractFile(archivePath, raw.name); } catch { buf = null; }
    if (!buf) continue;

    files.push({ path: name, size: raw.size, buf });
  }

  return files;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeArchive(archivePath: string): Promise<StripResult> {
  const patterns = loadPatterns();
  const fingerprints = loadFingerprints();
  const extractor = await openArchive(archivePath);
  const files = await readArchiveFiles(extractor, archivePath);
  return deriveStripPlan(files, patterns.filenamePatterns, fingerprints);
}

/**
 * Extract an archive to destDir, omitting junk files (unless listed in
 * preservePaths — files flagged but kept anyway by user choice).
 * Portable — reads via the extractor factory instead of the `lha` CLI.
 */
export async function extractClean(archivePath: string, destDir: string, preservePaths?: Set<string>): Promise<void> {
  const patterns = loadPatterns();
  const fingerprints = loadFingerprints();
  const extractor = await openArchive(archivePath);
  const files = await readArchiveFiles(extractor, archivePath);
  const plan = deriveStripPlan(files, patterns.filenamePatterns, fingerprints);
  const stripPaths = new Set(plan.stripped.filter(e => !preservePaths?.has(e.path)).map(e => e.path));

  fs.mkdirSync(destDir, { recursive: true });
  const destRoot = path.normalize(destDir + path.sep);

  for (const file of files) {
    if (stripPaths.has(file.path)) continue; // skip junk

    const outPath = path.normalize(path.join(destDir, file.path));
    if (!outPath.startsWith(destRoot)) continue; // zip-slip guard
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, file.buf);
  }
}

/**
 * Analyze + repack an archive with junk files removed. The repacked archive
 * is always written as a ZIP via adm-zip — there is no portable LHA writer
 * (lha.js / lha-extractor.ts only reads), and lhasa (the Linux `lha` CLI)
 * cannot create archives either, so ZIP is the only format this process can
 * author across platforms. outputPath in the return value is the actual
 * file written; it always ends in .zip regardless of what extension outPath
 * was given, since writing LHA/LZX bytes under a mismatched extension would
 * be worse than the format changing outright.
 *
 * preservePaths: files that were flagged but the user chose to keep (false
 * positives) — kept in the output archive rather than dropped.
 */
export async function stripArchive(
  archivePath: string,
  outPath: string,
  preservePaths?: Set<string>
): Promise<StripArchiveResult> {
  const patterns = loadPatterns();
  const fingerprints = loadFingerprints();
  const extractor = await openArchive(archivePath);
  const files = await readArchiveFiles(extractor, archivePath);
  const plan = deriveStripPlan(files, patterns.filenamePatterns, fingerprints);
  const stripPaths = new Set(plan.stripped.filter(e => !preservePaths?.has(e.path)).map(e => e.path));

  const zip = new AdmZip();
  for (const file of files) {
    if (stripPaths.has(file.path)) continue;
    // adm-zip stores forward-slash-separated entry names natively.
    zip.addFile(file.path, file.buf);
  }

  const outputPath = /\.zip$/i.test(outPath)
    ? outPath
    : outPath.replace(/\.(lha|lzx|lzh)$/i, '') + '.zip';
  zip.writeZip(outputPath);

  return { ...plan, outputPath };
}

export async function analyzeDirectory(dirPath: string): Promise<StripResult> {
  const patterns = loadPatterns();
  const fingerprints = loadFingerprints();
  const files: Array<{ path: string; size: number; buf: Buffer }> = [];

  function scanDir(absDir: string, relPrefix: string): void {
    let entries: string[];
    try { entries = fs.readdirSync(absDir); } catch { return; }
    for (const name of entries) {
      const absPath = path.join(absDir, name);
      const relPath = relPrefix ? `${relPrefix}/${name}` : name;
      const stat = fs.statSync(absPath);
      if (stat.isDirectory()) { scanDir(absPath, relPath); continue; }
      let buf: Buffer;
      try { buf = fs.readFileSync(absPath); } catch { continue; }
      files.push({ path: relPath, size: stat.size, buf });
    }
  }

  scanDir(dirPath, '');
  return deriveStripPlan(files, patterns.filenamePatterns, fingerprints);
}

export function stripFilesFromDirectory(dirPath: string, relPaths: string[]): void {
  for (const rel of relPaths) {
    const abs = path.join(dirPath, rel);
    try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch { /* ignore */ }
  }
}
