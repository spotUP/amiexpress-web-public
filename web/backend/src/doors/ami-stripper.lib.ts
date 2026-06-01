/**
 * ami-stripper.lib.ts — shared junk detection + archive stripping library.
 *
 * Used by:
 *  - build-door-catalog.ts (indexing)
 *  - dev/scripts/ami-stripper.ts (CLI)
 *  - Doors/ami-stripper/ (BBS door)
 *  - DoorManager install action (strip before extracting)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';

const LHA_BIN = [
  '/app/data/bbs/tools/bin/lha',
  '/opt/homebrew/bin/lha',
  '/usr/bin/lha',
  '/usr/local/bin/lha',
].find(p => fs.existsSync(p)) ?? 'lha';

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

interface PatternDb {
  filenamePatterns: string[];
  dizPatterns: string[];
}

interface FingerprintDb {
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

function lhaListRaw(archivePath: string): string[] {
  const result = spawnSync(LHA_BIN, ['l', '-q', archivePath], {
    encoding: 'latin1',
    timeout: 15000,
  });
  if (result.status !== 0) return [];
  return (result.stdout || '').split('\n').map((l: string) => l.trim()).filter(Boolean);
}

function lhaExtractFile(archivePath: string, internalPath: string): Buffer | null {
  const result = spawnSync(LHA_BIN, ['p', '-q', archivePath, internalPath], {
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout as unknown as Buffer;
}

function parseLhaListNames(lines: string[]): Array<{ name: string; size: number }> {
  const entries: Array<{ name: string; size: number }> = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    if (line.startsWith('-') || line.startsWith('=')) continue;
    const name = parts[parts.length - 1];
    const size = parseInt(parts[2], 10);
    if (!name || isNaN(size)) continue;
    entries.push({ name, size });
  }
  return entries;
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

function classifyFile(
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

  if (['.doc', '.readme', '.txt', '.nfo', ''].includes(ext) && !isBinaryContent(buf)) {
    if (hasAdSignals(buf)) return 'content-scan';
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeArchive(archivePath: string): Promise<StripResult> {
  const patterns = loadPatterns();
  const fingerprints = loadFingerprints();

  const listLines = lhaListRaw(archivePath);
  const entries = parseLhaListNames(listLines);

  const kept: StripEntry[] = [];
  const stripped: StripEntry[] = [];
  const reason: Record<string, 'pattern' | 'md5' | 'content-scan'> = {};

  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    const buf = lhaExtractFile(archivePath, entry.name);
    if (!buf) continue;

    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    const verdict = classifyFile(entry.name, buf, patterns.filenamePatterns, fingerprints);

    if (verdict) {
      stripped.push({ path: entry.name, size: entry.size, md5 });
      reason[entry.name] = verdict;
    } else {
      kept.push({ path: entry.name, size: entry.size, md5 });
    }
  }

  return { kept, stripped, reason };
}

// preservePaths: files that were flagged but the user chose to keep (false positives)
export async function stripArchive(archivePath: string, outPath: string, preservePaths?: Set<string>): Promise<StripResult> {
  const result = await analyzeArchive(archivePath);

  if (result.stripped.length === 0) {
    fs.copyFileSync(archivePath, outPath);
    return result;
  }

  // Files to actually extract: kept + user-preserved false positives
  const toExtract = [
    ...result.kept,
    ...(preservePaths ? result.stripped.filter(e => preservePaths.has(e.path)) : []),
  ];

  const tmpDir = `${outPath}.tmp_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    for (const entry of toExtract) {
      const buf = lhaExtractFile(archivePath, entry.path);
      if (!buf) continue;
      const dest = path.join(tmpDir, entry.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    }

    const lhaResult = spawnSync(LHA_BIN, ['a', outPath, '.'], {
      cwd: tmpDir,
      timeout: 30000,
    });
    if (lhaResult.status !== 0) {
      throw new Error(`lha repack failed: ${lhaResult.stderr?.toString()}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return result;
}

export async function analyzeDirectory(dirPath: string): Promise<StripResult> {
  const patterns = loadPatterns();
  const fingerprints = loadFingerprints();
  const kept: StripEntry[] = [];
  const stripped: StripEntry[] = [];
  const reason: Record<string, 'pattern' | 'md5' | 'content-scan'> = {};

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
      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      const verdict = classifyFile(relPath, buf, patterns.filenamePatterns, fingerprints);
      if (verdict) {
        stripped.push({ path: relPath, size: stat.size, md5 });
        reason[relPath] = verdict;
      } else {
        kept.push({ path: relPath, size: stat.size, md5 });
      }
    }
  }

  scanDir(dirPath, '');
  return { kept, stripped, reason };
}

export function stripFilesFromDirectory(dirPath: string, relPaths: string[]): void {
  for (const rel of relPaths) {
    const abs = path.join(dirPath, rel);
    try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch { /* ignore */ }
  }
}
