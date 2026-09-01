/**
 * Everything the admin needs to know about the board's screen files.
 *
 * Answers three questions the board could not answer before:
 *   - which file does node 7 actually display for BBSTITLE, and from where
 *   - which of these 891 files are byte-identical copies of one another
 *   - which `~CC_` and `~SS_` references point at something that is gone
 *
 * It resolves through screen-resolution.ts and findSecurityScreen - the same
 * two the loader uses - so the index and the board cannot drift. The test
 * `index-agrees-with-loader.test.ts` holds that claim to the loader itself.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { findSecurityScreen } from '../utils/screen-security.util';
import { readTooltypeMap } from '../utils/info-file.util';
import {
  ScreenDirType, SCREEN_DIR_MAP, getScreenDirType, getScreenFileName,
  resolveNodeScreenDir, screenSearchLocations,
} from './screen-resolution';
import { parseMciReferences, type MciReference } from './mci-references';

export type ScreenFormat = 'ansi' | 'text' | 'rip' | 'petscii';

export interface ScreenFileFacts {
  relPath: string;
  bytes: number;
  format: ScreenFormat;
  sha256: string;
  mci: MciReference[];
}

export interface ScopeResolution {
  scope: 'node' | 'conf' | 'board';
  id: number | null;
  /** Relative to the board root. */
  dir: string;
  /** True when a SCREENS tooltype sent this scope somewhere other than its own directory. */
  dirIsShared: boolean;
  /** Relative path of the file that wins, or null when nothing resolves. */
  file: string | null;
  /** Every security variant sitting in that directory, named exactly as it is on disk. */
  variants: string[];
}

export interface ScreenIndexEntry {
  screen: string;
  dirType: ScreenDirType;
  resolutions: ScopeResolution[];
  missingScopes: number;
  duplicateGroups: { sha256: string; paths: string[] }[];
}

export interface ScreenIndex {
  screens: ScreenIndexEntry[];
  unused: ScreenFileFacts[];
  files: Record<string, ScreenFileFacts>;
  builtAt: string;
}

/** The extensions the loader will accept for a screen (ScreenTypes.info plus this port's own). */
const SCREEN_EXTENSIONS = ['.txt', '.gr', '.ibm', '.seq', '.rip', '.ans', '.asc'];

function isScreenFile(name: string): boolean {
  if (name.endsWith('.backup')) return false;
  const lower = name.toLowerCase();
  return SCREEN_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter(name => {
      try {
        return fs.statSync(path.join(dir, name)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function nodeIds(baseDir: string): number[] {
  return fs.readdirSync(baseDir)
    .filter(d => /^Node\d+$/.test(d))
    .map(d => parseInt(d.slice(4), 10))
    .sort((a, b) => a - b);
}

function confIds(baseDir: string): number[] {
  return fs.readdirSync(baseDir)
    .filter(d => /^Conf\d+$/.test(d))
    .map(d => parseInt(d.slice(4), 10))
    .sort((a, b) => a - b);
}

/**
 * Every directory a screen could sit in: the board root, Screens/ and its
 * subdirectories, each node and conference and their Screens/, plus any
 * directory a SCREENS tooltype names.
 */
export function listScreenDirectories(baseDir: string): string[] {
  const dirs = new Set<string>([baseDir, path.join(baseDir, 'Screens')]);

  const addTree = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    dirs.add(dir);
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        if (fs.statSync(full).isDirectory()) dirs.add(full);
      } catch { /* a vanished entry is not a directory */ }
    }
  };

  addTree(path.join(baseDir, 'Screens'));
  for (const id of nodeIds(baseDir)) {
    dirs.add(path.join(baseDir, `Node${id}`));
    dirs.add(path.join(baseDir, `Node${id}`, 'Screens'));
    dirs.add(resolveNodeScreenDir(baseDir, id));
  }
  for (const id of confIds(baseDir)) {
    dirs.add(path.join(baseDir, `Conf${id}`));
    dirs.add(path.join(baseDir, `Conf${id}`, 'Screens'));
  }

  return [...dirs].filter(d => fs.existsSync(d));
}

/** The format, sniffed from the bytes rather than trusted from the extension. */
function sniffFormat(name: string, buf: Buffer): ScreenFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith('.rip') || buf.subarray(0, 2).toString('latin1') === '!|') return 'rip';
  if (lower.endsWith('.seq')) return 'petscii';
  if (buf.includes(0x1b)) return 'ansi';
  return 'text';
}

function commandExists(baseDir: string, command: string): boolean {
  const dir = path.join(baseDir, 'Commands', 'BBSCmd');
  return !!amigafs.findCaseInsensitive(dir, `${command}.info`);
}

function screenRefExists(baseDir: string, target: string): boolean {
  // `BBS:screens/x.txt` and `screens/x.txt` both mean the same file here.
  const rel = target.replace(/^BBS:/i, '').replace(/\//g, path.sep);
  const full = path.join(baseDir, rel);
  return !!amigafs.findCaseInsensitive(path.dirname(full), path.basename(full));
}

export function screenFileFacts(baseDir: string, absPath: string): ScreenFileFacts {
  const buf = fs.readFileSync(absPath);
  const name = path.basename(absPath);
  const format = sniffFormat(name, buf);

  // Only a text-shaped screen carries MCI; RIP and PETSCII bytes would produce
  // noise that looks like references.
  const mci = format === 'rip' || format === 'petscii'
    ? []
    : parseMciReferences(buf.toString('latin1')).map(ref => ({
        ...ref,
        resolves: ref.code === 'CL'
          ? true
          : ref.code === 'CC'
            ? commandExists(baseDir, ref.target)
            : screenRefExists(baseDir, ref.target),
      }));

  return {
    relPath: path.relative(baseDir, absPath),
    bytes: buf.length,
    format,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    mci,
  };
}

/** The stem a security variant shares with its base screen: LOGON20.TXT -> logon. */
function variantStem(fileName: string): string {
  return fileName.toLowerCase().replace(/\.[^.]*$/, '').replace(/\d+$/, '');
}

function scopesFor(baseDir: string, dirType: ScreenDirType): { scope: ScopeResolution['scope']; id: number | null }[] {
  if (dirType === ScreenDirType.NODE) return nodeIds(baseDir).map(id => ({ scope: 'node' as const, id }));
  if (dirType === ScreenDirType.CONF) return confIds(baseDir).map(id => ({ scope: 'conf' as const, id }));
  return [{ scope: 'board' as const, id: null }];
}

export function buildScreenIndex(baseDir: string): ScreenIndex {
  const files: Record<string, ScreenFileFacts> = {};
  const factsFor = (abs: string): ScreenFileFacts => {
    const rel = path.relative(baseDir, abs);
    if (!files[rel]) files[rel] = screenFileFacts(baseDir, abs);
    return files[rel];
  };

  const resolvedPaths = new Set<string>();
  const screens: ScreenIndexEntry[] = [];

  for (const [screen, dirType] of Object.entries(SCREEN_DIR_MAP)) {
    const fileName = getScreenFileName(screen);
    const stem = variantStem(fileName);
    const resolutions: ScopeResolution[] = [];

    for (const { scope, id } of scopesFor(baseDir, dirType)) {
      const locations = screenSearchLocations(baseDir, screen, {
        nodeId: scope === 'node' ? (id ?? 0) : 1,
        confId: scope === 'conf' ? (id ?? undefined) : undefined,
      });
      if (locations.length === 0) continue;

      const dir = locations[0].dir;
      const ownDir = scope === 'node' ? path.join(baseDir, `Node${id}`) : dir;

      let found: string | null = null;
      for (const location of locations) {
        // The same call the loader makes, so the answer is the loader's answer.
        const hit = findSecurityScreen(path.join(location.dir, fileName), 255, '.TXT', false, false);
        if (!hit) continue;
        // findSecurityScreen answers with the extension it BUILT (`.TXT`),
        // which on a case-insensitive filesystem is not the name on disk. The
        // manager shows and edits real filenames, so report the real one.
        found = amigafs.findCaseInsensitive(path.dirname(hit), path.basename(hit)) || hit;
        break;
      }

      const variants = listDir(dir).filter(n => isScreenFile(n) && variantStem(n) === stem);
      if (found) resolvedPaths.add(path.relative(baseDir, found));

      resolutions.push({
        scope,
        id,
        dir: path.relative(baseDir, dir) || '.',
        dirIsShared: scope === 'node' && dir !== ownDir,
        file: found ? path.relative(baseDir, found) : null,
        variants,
      });
    }

    const hashes = new Map<string, string[]>();
    for (const res of resolutions) {
      if (!res.file) continue;
      const facts = factsFor(path.join(baseDir, res.file));
      hashes.set(facts.sha256, [...(hashes.get(facts.sha256) ?? []), res.file]);
    }

    screens.push({
      screen,
      dirType,
      resolutions,
      missingScopes: resolutions.filter(r => !r.file).length,
      duplicateGroups: [...hashes.entries()]
        .filter(([, paths]) => paths.length > 1)
        .map(([sha256, paths]) => ({ sha256, paths })),
    });
  }

  // Everything else under a screen directory. Listed, never hidden: a file
  // nothing reads is exactly what a sysop wants to find.
  const unused: ScreenFileFacts[] = [];
  for (const dir of listScreenDirectories(baseDir)) {
    for (const name of listDir(dir)) {
      if (!isScreenFile(name)) continue;
      const rel = path.relative(baseDir, path.join(dir, name));
      if (resolvedPaths.has(rel)) continue;
      unused.push(factsFor(path.join(dir, name)));
    }
  }

  return { screens, unused, files, builtAt: new Date().toISOString() };
}

let cached: { key: string; index: ScreenIndex } | null = null;

/** The index, rebuilt when any screen directory's mtime moves. */
export function getScreenIndex(baseDir: string): ScreenIndex {
  const key = listScreenDirectories(baseDir)
    .map(d => {
      try { return `${d}:${fs.statSync(d).mtimeMs}`; } catch { return `${d}:gone`; }
    })
    .join('|');

  if (cached && cached.key === key) return cached.index;
  const index = buildScreenIndex(baseDir);
  cached = { key, index };
  return index;
}

/** Called by every write route: the next read rebuilds. */
export function invalidateScreenIndex(): void {
  cached = null;
}
