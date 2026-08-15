#!/usr/bin/env node
/**
 * build-door-catalog.ts
 *
 * Indexes all archives in the door repository into the door_catalog SQLite table.
 *
 * Steps:
 *   1. Compile scene stripper pattern databases (filename + DIZ content patterns)
 *   2. MD5 cross-archive fingerprinting (flag files appearing in >=10 archives)
 *   3. Index each archive (metadata, FILE_ID.DIZ, doc files) into door_catalog
 *   4. Re-extract currently-installed doors (unless --skip-reextract)
 *
 * Usage:
 *   npx tsx dev/scripts/door-corpus/build-door-catalog.ts [--skip-reextract] [--verbose] [--archives-dir <path>]
 *
 * --archives-dir overrides which directory step 3 indexes (default: the
 * AmiExpress archives dir). Step 3 resolves door_type from the extracted
 * binary's bytes (detectDoorType from door-installer.ts) first, falling back
 * to corpus.json's doorType hint, so e.g. FAMEDoorPort binaries land as FIM
 * regardless of source directory. Steps 1/2 (stripper patterns, MD5
 * fingerprints) always run against the AmiExpress reference corpus.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync, spawnSync } from 'child_process';
import Database from 'better-sqlite3';
import { detectDoorType, AMIGA_68K_BINARY_EXT_RE } from '../../../web/backend/src/doors/door-installer';
import { getExtractorForFile } from '../../../web/backend/src/utils/archive-extractor';
import { resolveArchivePath } from '../../../web/backend/src/doors/door-catalog.service';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// Reference corpus used to compile scene-stripper patterns + MD5 fingerprints
// (steps 1/2). This stays fixed regardless of --archives-dir: those patterns
// are cross-corpus junk signatures, not tied to which archives get indexed.
const ARCHIVES_DIR = '~/Code/amiexpress_doors/Archives/AmiExpress';
const DB_PATH = path.join(REPO_ROOT, 'database.sqlite');
const CORPUS_JSON = path.join(REPO_ROOT, 'dev/scripts/door-corpus/corpus.json');
const PATTERNS_JSON = path.join(REPO_ROOT, 'dev/scripts/door-corpus/scene-strip-patterns.json');
const FINGERPRINTS_JSON = path.join(REPO_ROOT, 'dev/scripts/door-corpus/junk-fingerprints.json');
const DOORS_DIR = path.join(REPO_ROOT, 'Doors');
const BBSCMD_DIR = path.join(REPO_ROOT, 'Commands/BBSCmd');
const LHA_BIN = '/opt/homebrew/bin/lha';

const args = process.argv.slice(2);
const SKIP_REEXTRACT = args.includes('--skip-reextract');
const VERBOSE = args.includes('--verbose');

// Directory actually indexed in step 3 (defaults to ARCHIVES_DIR, i.e. the
// original AmiExpress-only behavior is unchanged when the flag is omitted).
function parseArgValue(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}
const INDEX_ARCHIVES_DIR = parseArgValue('--archives-dir') ?? ARCHIVES_DIR;

function log(msg: string) { console.log(msg); }
function verbose(msg: string) { if (VERBOSE) console.log('  ' + msg); }

// ─── Stripper database archives ───────────────────────────────────────────────

// Each entry: archive name -> internal file paths that contain patterns
// Type: 'filename' = match against filenames inside archives
//       'diz'      = match against text inside FILE_ID.DIZ
const STRIPPER_SOURCES: Array<{
  archive: string;
  files: string[];
  type: 'filename' | 'diz';
}> = [
  { archive: 'BSTRIP.LHA',      files: ['Mega.Strip'],                          type: 'filename' },
  { archive: 'NUMB-L10.LHA',    files: ['S/Lhacheck.Omit'],                     type: 'filename' },
  { archive: 'STRIPEM.LHA',     files: ['Killbanners', 'Rearc.omit'],           type: 'filename' },
  { archive: 'BRS-LC16.LHA',    files: ['csa16/s/lhacheck.strip'],              type: 'filename' },
  { archive: 'OTL-DY15.LHA',    files: ['s/Dynamite.Strip'],                    type: 'filename' },
  { archive: 'OTL-DY20.LHA',    files: ['s/Dynamite.Strip'],                    type: 'filename' },
  { archive: 'TVK-LC1.LHA',     files: ['s/BANNERS.KILL'],                      type: 'filename' },
  { archive: 'VTL-MS11.LHA',    files: ['MasterStripper/S/Lha.Strip'],          type: 'filename' },
  { archive: 'OTL-FC11.LHA',    files: ['s/FastCheck.Strip'],                   type: 'filename' },
  { archive: 'ACS-LH3.LHA',     files: ['S/banners.kill'],                      type: 'filename' },
  { archive: 'ACS-LHA3.LHA',    files: ['S/banners.kill'],                      type: 'filename' },
  { archive: 'SLHA31.LHA',      files: ['S/banners.kill'],                      type: 'filename' },
  { archive: 'NC_LCHK.LHA',     files: ['lhacheck/s/LHACheck.KILL'],            type: 'filename' },
  { archive: 'NC-LCHK.LHA',     files: ['lhacheck/s/LHACheck.KILL'],            type: 'filename' },
  { archive: 'NC_LCHK_.LHA',    files: ['lhacheck/s/LHACheck.KILL'],            type: 'filename' },
  { archive: 'NC-LCHK!.LHA',    files: ['lhacheck/s/LHACheck.KILL'],            type: 'filename' },
  { archive: 'TRSI-C24.LHA',    files: ['DRE!/dRE!CHECk/Lha.Strip', 'istrip.known', 'istrip.nowild', 'istrip.suspect'], type: 'filename' },
  { archive: 'TRSI-LCK.LHA',    files: ["Lha'Chekko/S/Lha.strip"],             type: 'filename' },
  { archive: 'DLT-FC14.LHA',    files: ['doors/dlt_filecheck/Strip.List'],      type: 'filename' },
  { archive: 'DLW-LR10.LHA',    files: ['lharunner/s/LHA.STRIP'],              type: 'filename' },
  { archive: 'MSY-LR10.LHA',    files: ['lharunner/s/LHA.STRIP'],              type: 'filename' },
  { archive: 'R^D-LCNA.LHA',    files: ['LHA-CHECKnADD.Strip'],               type: 'filename' },
  { archive: 'LFC-L221.LHA',    files: ['LZXstrip/s/LZXstrip.ads'],            type: 'filename' },
  { archive: 'X!-LS23O.LHA',    files: ['LZXstrip/s/LZXstrip.ads'],            type: 'filename' },
  { archive: 'ISTRIP21.LHA',    files: ['istrip.known', 'istrip.nowild', 'istrip.suspect'], type: 'filename' },
  { archive: 'ISTRIP2B.LHA',    files: ['istrip.known', 'istrip.nowild', 'istrip.suspect'], type: 'filename' },
  { archive: 'CB4!SA50.LHA',    files: ['iDsTRiP.liST', 'lZXsTRIP.lIST', 'lZXSTRIP.wild'], type: 'filename' },
  { archive: 'CB4!SA63.LHA',    files: ['iDsTRiP.liST', 'lZXsTRIP.lIST', 'lZXSTRIP.wild'], type: 'filename' },
  { archive: 'CB4!ST13.LHA',    files: ['iDsTRiP.liST', 'lZXsTRIP.lIST', 'lZXSTRIP.wild'], type: 'filename' },
  { archive: 'DNC_FLHA.LHA',    files: ['FAST.STRIP'],                          type: 'filename' },
  { archive: 'HF-LS2O3.LHA',    files: ['lZXSTRIP.list'],                       type: 'filename' },
  { archive: 'I!LZS20.LHA',     files: ['lZXSTRIP.list'],                       type: 'filename' },
  { archive: 'INT-LZS.LHA',     files: ['lZXSTRIP.list'],                       type: 'filename' },
  { archive: 'X!LS104B.LHA',    files: ['lZXSTRIP.list'],                       type: 'filename' },
  { archive: 'X!LS105B.LHA',    files: ['lZXSTRIP.list'],                       type: 'filename' },
  { archive: 'I!LZS2O2.LHA',    files: ['lZXSTRIP.wILD'],                       type: 'filename' },
  // FILE_ID.DIZ content string databases
  { archive: 'CDS-FDSC.LHA',    files: ['FileDescription.Strip'],               type: 'diz' },
  { archive: 'FD!CHECK.LHA',    files: ['checker/s/FileId.strip'],              type: 'diz' },
  { archive: 'ORS-ID10.LHA',    files: ["bbs/modules/mm_tools/dizstrip'n'add/Diz.Strip"], type: 'diz' },
  { archive: 'HF-IS1O.LHA',     files: ['idstrip/s/iDsTRiP.liST'],             type: 'diz' },
  { archive: 'HF-LS21.LHA',     files: ['lzxstrip/s/lZXsTRiP.liST'],           type: 'diz' },
  { archive: 'SAD^F45R.LHA',    files: ['BBS/DOORS/SCEPTIC/F!-FIDEnhance/Config/SAD-Fidenhance.strip'], type: 'diz' },
];

// ─── lha helpers ─────────────────────────────────────────────────────────────

function lhaList(archivePath: string): string[] {
  try {
    const result = spawnSync(LHA_BIN, ['l', '-q', archivePath], {
      encoding: 'latin1',
      timeout: 10000,
    });
    if (result.status !== 0) return [];
    return (result.stdout || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function lhaExtractFile(archivePath: string, internalPath: string): Buffer | null {
  try {
    const result = spawnSync(LHA_BIN, ['p', '-q', archivePath, internalPath], {
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.status !== 0 || !result.stdout) return null;
    return result.stdout as unknown as Buffer;
  } catch {
    return null;
  }
}

// Parse lha list output to get file entries: [{name, size}]
function parseLhaList(lines: string[]): Array<{ name: string; size: number }> {
  const entries: Array<{ name: string; size: number }> = [];
  for (const line of lines) {
    // lha -l output: permission  uid/gid  size  ratio  date  name
    // Try to extract the last field as name and size as 3rd field
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    // Skip header/footer lines
    if (line.startsWith('-') || line.startsWith('=') || line.includes('file') && line.includes('Kbyte')) continue;
    const name = parts[parts.length - 1];
    const sizeStr = parts[2];
    const size = parseInt(sizeStr, 10);
    if (!name || isNaN(size)) continue;
    entries.push({ name, size });
  }
  return entries;
}

// Case-insensitive filename basename match within archive path
function findInArchive(listLines: string[], target: string): string | null {
  const targetLower = target.toLowerCase();
  for (const line of listLines) {
    const parts = line.split(/\s+/);
    const name = parts[parts.length - 1];
    if (!name) continue;
    const nameLower = name.toLowerCase();
    if (nameLower === targetLower || path.basename(nameLower) === path.basename(targetLower)) {
      return name;
    }
    // Also try path suffix match
    if (nameLower.endsWith('/' + targetLower) || nameLower.endsWith('/' + path.basename(targetLower))) {
      return name;
    }
  }
  return null;
}

// ─── Format-agnostic archive access (LHA/LZH via native lha, LZX via WASM) ───

interface OpenArchive {
  entries: Array<{ name: string; size: number }>;
  extract: (internalPath: string) => Promise<Buffer | null>;
}

// LZX has no native `lha`-binary support here; reuse the app's own WASM-backed
// unlzx port (web/backend/src/utils/extractors/lzx-wasm-extractor.ts) via the
// shared extractor factory rather than re-implementing LZX parsing.
async function openArchive(archivePath: string): Promise<OpenArchive> {
  if (/\.lzx$/i.test(archivePath)) {
    try {
      const extractor = await getExtractorForFile(archivePath);
      if (!extractor) return { entries: [], extract: async () => null };
      const full = await extractor.getEntries(archivePath);
      const byName = new Map<string, Buffer>();
      for (const e of full) {
        if (e.data) byName.set(e.name.toLowerCase(), Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data));
      }
      return {
        entries: full.map(e => ({ name: e.name, size: e.size })),
        extract: async (internalPath: string) => byName.get(internalPath.toLowerCase()) ?? null,
      };
    } catch (err) {
      verbose(`LZX extract failed: ${archivePath}: ${(err as Error).message}`);
      return { entries: [], extract: async () => null };
    }
  }
  const entries = parseLhaList(lhaList(archivePath));
  return {
    entries,
    extract: async (internalPath: string) => lhaExtractFile(archivePath, internalPath),
  };
}

// Case-insensitive lookup by basename/suffix over a structured entry list
// (mirrors findInArchive's matching rules, but works off {name,size} instead
// of raw `lha -l` text lines so it applies equally to LZX entries).
function findEntryByName(entries: Array<{ name: string; size: number }>, target: string): string | null {
  const targetLower = target.toLowerCase();
  const baseLower = path.basename(targetLower);
  for (const e of entries) {
    const nameLower = e.name.toLowerCase();
    if (nameLower === targetLower || path.basename(nameLower) === baseLower) return e.name;
    if (nameLower.endsWith('/' + targetLower) || nameLower.endsWith('/' + baseLower)) return e.name;
  }
  return null;
}

function findDocFileFromEntries(entries: Array<{ name: string; size: number }>): string | null {
  for (const ext of DOC_EXTENSIONS) {
    for (const e of entries) {
      const nameLower = e.name.toLowerCase();
      if (nameLower.endsWith(ext) && !nameLower.includes('install')) return e.name;
    }
  }
  return null;
}

// A plausible primary door binary: either the classic dot-less AmiExpress
// convention, or a known 68K binary extension (.exe/.xim/.aim/.sim/.tim/.fim)
// per AMIGA_68K_BINARY_EXT_RE — the same gate door-installer.ts uses to find
// the executable at install time (single source of truth for that regex).
export function isCandidateBinaryEntry(entryName: string): boolean {
  const base = path.basename(entryName);
  return !base.includes('.') || AMIGA_68K_BINARY_EXT_RE.test(base);
}

// door_type resolution order: ground-truth binary sniff (detectDoorType on
// the extracted bytes) > corpus.json hint > historical XIM default.
export function resolveDoorType(detectedFromBinary: string | null, corpusDoorType: string | undefined): string {
  return detectedFromBinary ?? corpusDoorType ?? 'XIM';
}

// ─── Step 1: Compile scene stripper pattern databases ───────────────────────

function normalizePattern(p: string): string {
  return p.trim().toLowerCase().replace(/#\?/g, '*');
}

function compileStripperDatabases(): { filenamePatterns: string[]; dizPatterns: string[] } {
  log('\n[1/4] Compiling scene stripper pattern databases...');

  const filenamePatterns = new Set<string>();
  const dizPatterns = new Set<string>();

  for (const source of STRIPPER_SOURCES) {
    const archivePath = path.join(ARCHIVES_DIR, source.archive);
    if (!fs.existsSync(archivePath)) {
      verbose(`SKIP (not found): ${source.archive}`);
      continue;
    }

    const listLines = lhaList(archivePath);

    for (const targetFile of source.files) {
      // Try to find the file in the archive (case-insensitive)
      const actualName = findInArchive(listLines, targetFile) ?? targetFile;
      const buf = lhaExtractFile(archivePath, actualName);
      if (!buf) {
        verbose(`SKIP (extract failed): ${source.archive}:${targetFile}`);
        continue;
      }

      const text = buf.toString('latin1');
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      let added = 0;

      for (const line of lines) {
        if (line.startsWith(';') || line.startsWith('#')) continue; // comments
        const pat = normalizePattern(line);
        if (!pat || pat.length < 3) continue;
        if (source.type === 'filename') {
          filenamePatterns.add(pat);
        } else {
          dizPatterns.add(pat);
        }
        added++;
      }
      verbose(`  ${source.archive}:${targetFile} -> ${added} patterns`);
    }
  }

  log(`  Filename patterns: ${filenamePatterns.size}`);
  log(`  DIZ content patterns: ${dizPatterns.size}`);

  const result = {
    filenamePatterns: Array.from(filenamePatterns).sort(),
    dizPatterns: Array.from(dizPatterns).sort(),
  };

  fs.writeFileSync(PATTERNS_JSON, JSON.stringify(result, null, 2));
  log(`  Saved to ${PATTERNS_JSON}`);
  return result;
}

// ─── Step 2: MD5 cross-archive fingerprinting ────────────────────────────────

interface FingerprintEntry {
  filename: string;
  md5: string;
  archiveCount: number;
  archives: string[];
  methods: string[];
}

function buildMd5Fingerprints(): Map<string, FingerprintEntry> {
  log('\n[2/4] Building MD5 cross-archive fingerprints...');

  const archives = fs.readdirSync(ARCHIVES_DIR).filter(f => /\.(lha|lzh)$/i.test(f));
  const md5ToArchives = new Map<string, Set<string>>();
  const md5ToFilename = new Map<string, string>();
  let processed = 0;

  for (const archive of archives) {
    const archivePath = path.join(ARCHIVES_DIR, archive);
    const listLines = lhaList(archivePath);
    const entries = parseLhaList(listLines);

    for (const entry of entries) {
      // Skip directories
      if (entry.name.endsWith('/')) continue;
      // Skip very large files (executables, data)
      if (entry.size > 100 * 1024) continue;
      // Only fingerprint small files that could be ads
      if (entry.size < 10) continue;

      const buf = lhaExtractFile(archivePath, entry.name);
      if (!buf) continue;

      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      if (!md5ToArchives.has(md5)) {
        md5ToArchives.set(md5, new Set());
        md5ToFilename.set(md5, path.basename(entry.name));
      }
      md5ToArchives.get(md5)!.add(archive);
    }

    processed++;
    if (processed % 100 === 0) {
      process.stdout.write(`\r  Scanned ${processed}/${archives.length} archives...`);
    }
  }
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  log(`  Scanned ${processed} archives`);

  // Collect entries appearing in >= 10 archives
  const fingerprints = new Map<string, FingerprintEntry>();
  const MIN_COUNT = 10;

  for (const [md5, archiveSet] of md5ToArchives) {
    if (archiveSet.size >= MIN_COUNT) {
      const filename = md5ToFilename.get(md5)!;
      fingerprints.set(md5, {
        filename,
        md5,
        archiveCount: archiveSet.size,
        archives: Array.from(archiveSet).slice(0, 20), // store first 20 for reference
        methods: ['md5'],
      });
    }
  }

  log(`  Flagged ${fingerprints.size} files as BBS stamps (>= ${MIN_COUNT} archives)`);

  // Save fingerprints
  const fingerprintsObj: Record<string, FingerprintEntry> = {};
  for (const [md5, entry] of fingerprints) {
    fingerprintsObj[md5] = entry;
  }
  fs.writeFileSync(FINGERPRINTS_JSON, JSON.stringify(fingerprintsObj, null, 2));
  log(`  Saved to ${FINGERPRINTS_JSON}`);

  return fingerprints;
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
  // Has at least one non-printable, non-whitespace byte
  for (let i = 0; i < Math.min(buf.length, 1024); i++) {
    const b = buf[i];
    if (b > 0x7e && b !== 0x0a && b !== 0x0d && b !== 0x09) return true;
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

function isJunkFile(
  filename: string,
  buf: Buffer,
  filenamePatterns: string[],
  fingerprints: Map<string, FingerprintEntry>
): { junk: boolean; reason: string } {
  const base = path.basename(filename).toLowerCase();
  const ext = path.extname(base);

  // Content-based protection first
  if (ext === '.info' && isWorkbenchIcon(buf)) {
    return { junk: false, reason: '' };
  }
  if ((ext === '.library' || ext === '') && isAmigaHunk(buf)) {
    return { junk: false, reason: '' };
  }
  if (ext === '.guide' && isAmigaGuide(buf)) {
    return { junk: false, reason: '' };
  }
  if (['.cfg', '.dat', '.data', '.stat', '.config'].includes(ext) && isBinaryContent(buf)) {
    return { junk: false, reason: '' };
  }
  if (base === 'file_id.diz') {
    return { junk: false, reason: '' }; // always keep, we'll strip BBS lines separately
  }

  // MD5 fingerprint check
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  if (fingerprints.has(md5)) {
    const fp = fingerprints.get(md5)!;
    return { junk: true, reason: `md5: known stamp (${fp.archiveCount} archives)` };
  }

  // Filename pattern check
  for (const pat of filenamePatterns) {
    if (matchesPattern(base, pat)) {
      return { junk: true, reason: `pattern: ${pat}` };
    }
  }

  // For plain text files, check ad signals
  if (['.doc', '.readme', '.txt', '.nfo', ''].includes(ext) && !isBinaryContent(buf)) {
    if (hasAdSignals(buf)) {
      return { junk: true, reason: 'content: ad-signal scan' };
    }
  }

  return { junk: false, reason: '' };
}

function matchesPattern(filename: string, pattern: string): boolean {
  // Convert glob-style pattern (with * and ?) to regex
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  try {
    return new RegExp(regexStr, 'i').test(filename);
  } catch {
    return false;
  }
}

// ─── DIZ parsing (reuse DoorManager pattern) ─────────────────────────────────

interface DizInfo {
  name: string | null;
  version: string | null;
  author: string | null;
  description: string | null;
}

function parseDiz(dizText: string): DizInfo {
  const lines = dizText.split('\n').map(l => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim());
  const result: DizInfo = { name: null, version: null, author: null, description: null };

  // First non-empty line is usually the name + version
  const firstLine = lines.find(l => l.length > 0) ?? '';
  const verMatch = firstLine.match(/v(\d+[\d.]*)/i);
  if (verMatch) result.version = verMatch[1];
  result.name = firstLine.replace(/v\d+[\d.]*\s*/i, '').trim() || null;

  // Look for "by <author>" or "<name>/<group>" patterns
  for (const line of lines) {
    const byMatch = line.match(/\bby\s+(\S+)/i);
    if (byMatch && !result.author) result.author = byMatch[1];
    const slashMatch = line.match(/\b([A-Z][a-z]+)\/([A-Z][a-z]+)\b/);
    if (slashMatch && !result.author) result.author = slashMatch[0];
  }

  // Description: everything from line 2 onwards, first 3 non-empty lines
  const descLines = lines.slice(1).filter(l => l.length > 0).slice(0, 3);
  if (descLines.length > 0) result.description = descLines.join(' ');

  return result;
}

// ─── Doc file detection ───────────────────────────────────────────────────────

const DOC_EXTENSIONS = ['.guide', '.doc', '.readme', '.txt'];

function findDocFile(listLines: string[]): string | null {
  // Prefer .guide > .doc > .readme > .txt
  for (const ext of DOC_EXTENSIONS) {
    for (const line of listLines) {
      const parts = line.split(/\s+/);
      const name = parts[parts.length - 1] ?? '';
      if (name.toLowerCase().endsWith(ext) && !name.toLowerCase().includes('install')) {
        return name;
      }
    }
  }
  return null;
}

// Parse tooltype hints from doc text
function extractSuggestedTooltypes(docText: string): Record<string, string> {
  const tooltypes: Record<string, string> = {};
  const keywords = ['LOCATION', 'STACK', 'TYPE', 'ACCESS', 'PRIORITY'];
  const lines = docText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    for (const kw of keywords) {
      const match = trimmed.match(new RegExp(`${kw}\\s*=\\s*([^\\s,;]+)`, 'i'));
      if (match && !tooltypes[kw]) {
        tooltypes[kw] = match[1];
      }
    }
  }
  return tooltypes;
}

// ─── Release group heuristic ─────────────────────────────────────────────────

function extractReleaseGroup(archiveName: string): string | null {
  // Prefix patterns like "5D-", "AFL-", "LSD-", "EMPiRE", "TRSI", "OTL", etc.
  const prefixMatch = archiveName.match(/^([A-Z0-9!^]{2,8})[!_-]/i);
  if (prefixMatch) return prefixMatch[1].toUpperCase();
  return null;
}

// ─── Corpus.json lookup ───────────────────────────────────────────────────────

interface CorpusEntry {
  id: string;
  name: string;
  doorType?: string;
  category?: string;
  binary?: string;
  command?: string;
  notes?: string;
}

function loadCorpus(): Map<string, CorpusEntry> {
  const corpus = new Map<string, CorpusEntry>();
  if (!fs.existsSync(CORPUS_JSON)) return corpus;
  const parsed = JSON.parse(fs.readFileSync(CORPUS_JSON, 'utf-8'));
  const entries: CorpusEntry[] = Array.isArray(parsed) ? parsed : (parsed.doors ?? []);
  for (const e of entries) {
    corpus.set(e.id, e);
    if (e.binary) {
      // Index by binary basename too
      corpus.set(path.basename(e.binary).toLowerCase(), e);
    }
  }
  return corpus;
}

// ─── Installed doors detection ───────────────────────────────────────────────

function getInstalledDoors(): Map<string, { cmd: string; dir: string }> {
  const installed = new Map<string, { cmd: string; dir: string }>();
  if (!fs.existsSync(BBSCMD_DIR)) return installed;

  for (const file of fs.readdirSync(BBSCMD_DIR)) {
    if (!file.endsWith('.info')) continue;
    const cmd = file.replace(/\.info$/, '');
    const filePath = path.join(BBSCMD_DIR, file);
    const data = fs.readFileSync(filePath);

    // Parse LOCATION tooltype from Amiga .info binary
    const locationKey = Buffer.from('LOCATION=', 'latin1');
    let idx = 0;
    while (idx < data.length) {
      idx = data.indexOf(locationKey, idx);
      if (idx === -1) break;
      idx += locationKey.length;

      const endNull = data.indexOf(0x00, idx);
      const endNl = data.indexOf(0x0a, idx);
      const ends = [endNull, endNl].filter(x => x !== -1);
      const end = ends.length ? Math.min(...ends) : data.length;
      const location = data.slice(idx, end).toString('latin1').trim();

      // Parse dir from LOCATION (Doors:DirName/binary or BBS:doors/DirName/binary)
      const m = location.match(/^(?:doors?[:/])([^:/\r\n]+)/i);
      if (m) {
        installed.set(cmd.toUpperCase(), { cmd, dir: m[1] });
        break;
      }
      const m2 = location.match(/^bbs:doors?[:/]([^:/\r\n]+)/i);
      if (m2) {
        installed.set(cmd.toUpperCase(), { cmd, dir: m2[1] });
        break;
      }
    }
  }
  return installed;
}

// ─── Main: Step 3 — Index archives ───────────────────────────────────────────

async function indexArchives(
  db: Database.Database,
  filenamePatterns: string[],
  fingerprints: Map<string, FingerprintEntry>,
  corpus: Map<string, CorpusEntry>,
  installed: Map<string, { cmd: string; dir: string }>
): Promise<void> {
  log('\n[3/4] Indexing archives into door_catalog...');

  const archives = fs.readdirSync(INDEX_ARCHIVES_DIR)
    .filter(f => /\.(lha|lzh|lzx)$/i.test(f))
    .sort();

  // Skip .LZX/.LZH if a .LHA with the same base exists
  const lhaBaseNames = new Set(
    archives.filter(f => /\.lha$/i.test(f)).map(f => f.replace(/\.(lha)$/i, '').toLowerCase())
  );
  const toProcess = archives.filter(f => {
    if (/\.lha$/i.test(f)) return true;
    const base = f.replace(/\.(lzx|lzh)$/i, '').toLowerCase();
    return !lhaBaseNames.has(base);
  });

  const upsert = db.prepare(`
    INSERT INTO door_catalog (
      id, archive_name, archive_path, binary_name, door_type, name, version,
      author, release_group, description, file_id_diz, doc_filename, doc_raw,
      suggested_tooltypes, category, archive_size, junk_count, installed,
      installed_as, install_dir, corpus_id, source
    ) VALUES (
      @id, @archive_name, @archive_path, @binary_name, @door_type, @name, @version,
      @author, @release_group, @description, @file_id_diz, @doc_filename, @doc_raw,
      @suggested_tooltypes, @category, @archive_size, @junk_count, @installed,
      @installed_as, @install_dir, @corpus_id, @source
    )
    ON CONFLICT(id) DO UPDATE SET
      archive_name = excluded.archive_name,
      archive_path = excluded.archive_path,
      binary_name = excluded.binary_name,
      door_type = excluded.door_type,
      name = excluded.name,
      version = excluded.version,
      author = excluded.author,
      release_group = excluded.release_group,
      description = excluded.description,
      file_id_diz = excluded.file_id_diz,
      doc_filename = excluded.doc_filename,
      doc_raw = excluded.doc_raw,
      suggested_tooltypes = excluded.suggested_tooltypes,
      category = excluded.category,
      archive_size = excluded.archive_size,
      junk_count = excluded.junk_count,
      corpus_id = excluded.corpus_id,
      source = excluded.source,
      indexed_at = strftime('%s','now')
  `);

  const insertMany = db.transaction((rows: any[]) => {
    for (const row of rows) upsert.run(row);
  });

  const upsertFile = db.prepare(
    'INSERT OR REPLACE INTO door_catalog_files (catalog_id, path, size, is_junk, junk_reason) VALUES (?, ?, ?, ?, ?)'
  );
  const insertFiles = db.transaction((catalogId: string, files: Array<{ path: string; size: number; is_junk: number; junk_reason: string | null }>) => {
    db.prepare('DELETE FROM door_catalog_files WHERE catalog_id = ?').run(catalogId);
    for (const f of files) upsertFile.run(catalogId, f.path, f.size, f.is_junk, f.junk_reason);
  });

  let processed = 0;
  let skippedLzx = 0;
  let collisions = 0;
  const batchSize = 50;
  let batch: any[] = [];

  const existingRow = db.prepare('SELECT archive_name FROM door_catalog WHERE id = ?');
  // Same-id archives already queued earlier in *this* run. A DB lookup alone
  // isn't enough: rows are only flushed to disk every `batchSize` archives,
  // so two colliding archives landing in the same unflushed batch would both
  // see "no existing row" and silently clobber each other via ON CONFLICT.
  const seenThisRun = new Map<string, string>(); // id -> archive_name

  // door_catalog.archive_path is stored RELATIVE to the archives root
  // (e.g. "FAME/foo.lha") so the DB is portable across machines — see
  // door-catalog.service.ts's resolveArchivePath(), the single reader of
  // this column. INDEX_ARCHIVES_DIR is a specific subdir (AmiExpress/FAME/
  // etc); its basename is the root-relative prefix we store.
  const archivesSubdir = path.basename(INDEX_ARCHIVES_DIR);

  for (const archiveName of toProcess) {
    const archivePath = path.join(INDEX_ARCHIVES_DIR, archiveName);
    const archiveRelPath = `${archivesSubdir}/${archiveName}`;
    const archiveSize = fs.statSync(archivePath).size;
    const isLzx = /\.lzx$/i.test(archiveName);

    // Make a stable ID from the archive name (strip extension, lowercase, replace non-alnum)
    const baseId = archiveName.replace(/\.(lha|lzx|lzh)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Same normalized id already claimed by a *different* archive_name —
    // either earlier in this same run (e.g. D_NEW310.LHA / D!NEW310.LHA both
    // normalize to "d_new310") or by a previous run indexing a different
    // source directory (e.g. the same archive name shipped in both
    // AmiExpress/ and FAME/): never clobber that row — skip and log instead.
    // A re-run over the *same* archive (identical archive_name) is expected
    // to update its own row, so that case falls through normally.
    const queuedAs = seenThisRun.get(baseId);
    if (queuedAs && queuedAs !== archiveName) {
      log(`  SKIP (id collision with ${queuedAs}, already queued this run): ${archiveName}`);
      collisions++;
      continue;
    }
    const existing = existingRow.get(baseId) as { archive_name: string } | undefined;
    if (existing && existing.archive_name !== archiveName) {
      log(`  SKIP (id collision, already indexed as ${existing.archive_name}): ${archiveName}`);
      collisions++;
      continue;
    }
    seenThisRun.set(baseId, archiveName);

    const { entries, extract } = await openArchive(archivePath);
    if (entries.length === 0) {
      if (isLzx) {
        log(`  SKIP (LZX extraction failed): ${archiveName}`);
        skippedLzx++;
      } else {
        log(`  SKIP (empty/unreadable archive): ${archiveName}`);
      }
      continue;
    }

    // Find FILE_ID.DIZ
    let dizText: string | null = null;
    const dizName = findEntryByName(entries, 'FILE_ID.DIZ');
    if (dizName) {
      const buf = await extract(dizName);
      if (buf) dizText = buf.toString('latin1');
    }

    const dizInfo = dizText ? parseDiz(dizText) : { name: null, version: null, author: null, description: null };

    // Find doc file
    let docFilename: string | null = null;
    let docRaw: string | null = null;
    let suggestedTooltypes: Record<string, string> = {};

    const docEntry = findDocFileFromEntries(entries);
    if (docEntry) {
      const buf = await extract(docEntry);
      if (buf) {
        docFilename = path.basename(docEntry);
        docRaw = buf.toString('latin1');
        suggestedTooltypes = extractSuggestedTooltypes(docRaw);
      }
    }

    // Find primary executable (HUNK binary) and sniff its real door_type
    // from the extracted bytes (FAMEDoorPort/AEDoorPort/DoorControl) —
    // single source of truth via door-installer.ts's detectDoorType.
    let binaryName: string | null = null;
    let detectedDoorType: string | null = null;
    for (const entry of entries.slice(0, 30)) {
      if (entry.name.endsWith('/') || entry.size > 512 * 1024) continue;
      if (!isCandidateBinaryEntry(entry.name)) continue;
      const buf = await extract(entry.name);
      if (buf && isAmigaHunk(buf)) {
        binaryName = path.basename(entry.name);
        detectedDoorType = detectDoorType(buf);
        break;
      }
    }

    // Count junk files and build file list for door_catalog_files
    let junkCount = 0;
    const fileRows: Array<{ path: string; size: number; is_junk: number; junk_reason: string | null }> = [];
    for (const entry of entries) {
      if (entry.name.endsWith('/')) continue;
      const base = path.basename(entry.name).toLowerCase();
      let isJunk = 0;
      let junkReason: string | null = null;
      for (const pat of filenamePatterns) {
        if (matchesPattern(base, pat)) { isJunk = 1; junkReason = 'pattern'; junkCount++; break; }
      }
      fileRows.push({ path: entry.name, size: entry.size, is_junk: isJunk, junk_reason: junkReason });
    }

    // Corpus lookup
    const corpusEntry = corpus.get(baseId) ?? corpus.get(binaryName?.toLowerCase() ?? '');

    // Release group
    const releaseGroup = extractReleaseGroup(archiveName);

    // Determine name (corpus > DIZ > archive basename)
    const name = corpusEntry?.name ?? dizInfo.name ?? baseId.replace(/_/g, ' ');

    // Installed status
    // Check if any installed dir matches by corpus id or binary name
    let isInstalled = 0;
    let installedAs: string | null = null;
    let installDir: string | null = null;

    for (const [cmd, info] of installed) {
      if (
        info.dir.toLowerCase() === baseId ||
        (binaryName && info.dir.toLowerCase() === binaryName.toLowerCase()) ||
        (corpusEntry && info.dir.toLowerCase() === corpusEntry.id.toLowerCase())
      ) {
        isInstalled = 1;
        installedAs = info.cmd;
        installDir = `Doors/${info.dir}`;
        break;
      }
    }

    batch.push({
      id: baseId,
      archive_name: archiveName,
      archive_path: archiveRelPath,
      binary_name: binaryName,
      door_type: resolveDoorType(detectedDoorType, corpusEntry?.doorType),
      name,
      version: dizInfo.version ?? null,
      author: dizInfo.author ?? null,
      release_group: releaseGroup,
      description: dizInfo.description ?? null,
      file_id_diz: dizText,
      doc_filename: docFilename,
      doc_raw: docRaw,
      suggested_tooltypes: Object.keys(suggestedTooltypes).length ? JSON.stringify(suggestedTooltypes) : null,
      category: corpusEntry?.category ?? null,
      archive_size: archiveSize,
      junk_count: junkCount,
      installed: isInstalled,
      installed_as: installedAs,
      install_dir: installDir,
      corpus_id: corpusEntry?.id ?? null,
      source: 'scan',
    });

    // Store file listing immediately (outside batch, each archive individually)
    insertFiles(baseId, fileRows);

    processed++;

    if (batch.length >= batchSize) {
      insertMany(batch);
      batch = [];
    }

    if (processed % 50 === 0) {
      process.stdout.write(`\r  Indexed ${processed}/${toProcess.length} archives...`);
    }
  }

  if (batch.length > 0) insertMany(batch);
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  log(`  Indexed ${processed} archives (skipped LZX: ${skippedLzx}, collisions: ${collisions})`);

  const count = (db.prepare('SELECT COUNT(*) as n FROM door_catalog').get() as { n: number }).n;
  log(`  door_catalog rows: ${count}`);
}

// ─── Step 4: Re-extract installed doors ──────────────────────────────────────

function reextractInstalledDoors(
  db: Database.Database,
  filenamePatterns: string[],
  fingerprints: Map<string, FingerprintEntry>
): void {
  log('\n[4/4] Re-extracting installed doors from archives...');

  const rows = db.prepare('SELECT * FROM door_catalog WHERE installed = 1').all() as any[];
  log(`  Found ${rows.length} installed doors to re-extract`);

  for (const row of rows) {
    const archivePath = resolveArchivePath(row.archive_path);
    if (!row.install_dir || !fs.existsSync(archivePath)) continue;
    const outDir = path.join(REPO_ROOT, row.install_dir);

    log(`  Extracting ${row.archive_name} -> ${row.install_dir}/`);

    // Get list of files in archive
    const listLines = lhaList(archivePath);

    // Find the internal dir prefix (usually matches binary name or dir name)
    for (const line of listLines) {
      const parts = line.split(/\s+/);
      const fname = parts[parts.length - 1];
      if (!fname || fname.endsWith('/')) continue;

      const buf = lhaExtractFile(archivePath, fname);
      if (!buf) continue;

      const { junk } = isJunkFile(fname, buf, filenamePatterns, fingerprints);
      if (junk) {
        verbose(`  SKIP junk: ${fname}`);
        continue;
      }

      // Determine output path (strip leading dir component if any)
      const parts2 = fname.split('/');
      const relPath = parts2.length > 1 ? parts2.slice(1).join('/') : fname;
      if (!relPath) continue;

      const outPath = path.join(outDir, relPath);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buf);
      verbose(`  WRITE: ${relPath}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('=== AmiExpress Door Catalog Builder ===');
  log(`Archives: ${INDEX_ARCHIVES_DIR}`);
  log(`Database: ${DB_PATH}`);

  if (!fs.existsSync(INDEX_ARCHIVES_DIR)) {
    console.error(`ERROR: Archives directory not found: ${INDEX_ARCHIVES_DIR}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS door_catalog (
      id                  TEXT PRIMARY KEY,
      archive_name        TEXT NOT NULL UNIQUE,
      archive_path        TEXT NOT NULL,
      binary_name         TEXT,
      door_type           TEXT DEFAULT 'XIM',
      name                TEXT NOT NULL,
      version             TEXT,
      author              TEXT,
      release_group       TEXT,
      description         TEXT,
      file_id_diz         TEXT,
      doc_filename        TEXT,
      doc_raw             TEXT,
      suggested_tooltypes TEXT,
      category            TEXT,
      archive_size        INTEGER DEFAULT 0,
      junk_count          INTEGER DEFAULT 0,
      installed           INTEGER DEFAULT 0,
      installed_as        TEXT,
      install_dir         TEXT,
      corpus_id           TEXT,
      source              TEXT DEFAULT 'scan',
      indexed_at          INTEGER DEFAULT (strftime('%s','now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_door_catalog_installed ON door_catalog(installed)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_door_catalog_category ON door_catalog(category)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_door_catalog_name ON door_catalog(name)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS door_catalog_files (
      catalog_id TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      is_junk INTEGER DEFAULT 0,
      junk_reason TEXT,
      PRIMARY KEY (catalog_id, path)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_dcf_catalog_id ON door_catalog_files(catalog_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_dcf_is_junk ON door_catalog_files(is_junk)');

  const corpus = loadCorpus();
  log(`Corpus entries loaded: ${corpus.size}`);

  const installed = getInstalledDoors();
  log(`Installed doors detected: ${installed.size}`);

  const { filenamePatterns, dizPatterns } = compileStripperDatabases();
  const fingerprints = buildMd5Fingerprints();

  await indexArchives(db, filenamePatterns, fingerprints, corpus, installed);

  if (!SKIP_REEXTRACT) {
    reextractInstalledDoors(db, filenamePatterns, fingerprints);
  } else {
    log('\n[4/4] Skipping re-extract (--skip-reextract)');
  }

  db.close();

  log('\n=== Done ===');
  const statsDb = new Database(DB_PATH, { readonly: true });
  const stats = statsDb.prepare('SELECT COUNT(*) as total, SUM(installed) as inst FROM door_catalog').get() as any;
  log(`door_catalog: ${stats.total} total, ${stats.inst ?? 0} installed`);
  statsDb.close();
}

// Guard so the pure helpers above (resolveDoorType, isCandidateBinaryEntry)
// can be imported from tests without triggering a full catalog run.
if (require.main === module) {
  main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
