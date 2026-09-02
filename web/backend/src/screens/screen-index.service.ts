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
import { conferenceDir, conferenceNumbers } from '../conferences/conference-paths';
import { loadConfConfig } from '../services/conf-config.service';

export type ScreenFormat = 'ansi' | 'text' | 'rip' | 'petscii';

/**
 * Who reads a file, and why.
 *
 * A screen file is rarely "the" file for a screen: express.e:6273-6290 rounds
 * the caller's security level down to a multiple of five and walks DOWN until
 * a file exists, and at each step tries the caller's screen type (.GR, .IBM),
 * PETSCII (.SEQ), RIP (.RIP) and then plain .TXT. So `bull20.txt` is what
 * level 20-24 sees, `menu250.txt.GR` is the graphics menu for a sysop, and
 * both are read by the board every day.
 */
export interface ScreenReader {
  /** The catalogue name - CONF_BULL, MENU, LOGON. */
  screen: string;
  scope: 'node' | 'conf' | 'board';
  /** Node or conference number; null for a board screen. */
  id: number | null;
  /** The conference's name, when the board has one. */
  scopeName?: string;
  /** The security level this variant serves, when it carries one. */
  securityLevel?: number;
  /** GR, IBM, SEQ, RIP - the screen type a caller must have to see it. */
  screenType?: string;
  /** How it is reached: the file the loader picks, a variant of it, or an include. */
  via: 'resolved' | 'variant' | 'include';
  /**
   * The security levels this variant actually serves, as a range.
   *
   * express.e:6273-6290 walks DOWN in fives, so BULL20 serves everyone from 20
   * up to just under the next variant - and the highest variant serves every
   * level above it. "Level 20" alone reads as "only level 20", which is wrong
   * on every board.
   */
  serves?: string;
}

/** The artist's own credits, from the SAUCE record at the end of the file. */
export interface SauceFacts {
  title: string;
  author: string;
  group: string;
  date: string;
  width?: number;
  height?: number;
}

export interface ScreenFileFacts {
  relPath: string;
  bytes: number;
  format: ScreenFormat;
  sha256: string;
  mci: MciReference[];
  /** Every screen that reads this file. Empty means nothing on the board does. */
  readBy: ScreenReader[];
  /** Present when the art carries a SAUCE record - most ANSI art does. */
  sauce?: SauceFacts;
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

/** A conference as the board names it - `Conf2` means nothing to a designer. */
export interface ConferenceFacts {
  id: number;
  name: string;
  /** The directory it reads, relative to the board root. */
  dir: string;
}

export interface ScreenIndex {
  screens: ScreenIndexEntry[];
  /** Files no screen reads - by the rule in ScreenReader, not by "is not the winner". */
  unused: ScreenFileFacts[];
  files: Record<string, ScreenFileFacts>;
  conferences: ConferenceFacts[];
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

/**
 * The conferences the board HAS - ConfConfig.info, not the directories.
 *
 * A deleted conference leaves its directory behind on purpose, so the disk is
 * not the list. Reading it as one showed fourteen conferences for a board with
 * five, nine of them named after directories nothing joins.
 */
function confIds(baseDir: string): number[] {
  return conferenceNumbers(baseDir);
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
    // Both the directory NAMED Conf<n> and the one conference n actually reads:
    // a renumbered board has conference 1 living in Conf2/, and the manager has
    // to list the files either way round.
    dirs.add(path.join(baseDir, `Conf${id}`));
    dirs.add(path.join(baseDir, `Conf${id}`, 'Screens'));
    const located = conferenceDir(baseDir, id);
    dirs.add(located);
    dirs.add(path.join(located, 'Screens'));
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

/**
 * The SAUCE record an art program appends: 128 bytes at the end of the file,
 * starting with "SAUCE00". It carries the title, the artist and the group -
 * exactly what a designer wants to see beside a thumbnail, and what nothing in
 * the manager was reading.
 */
function readSauce(buf: Buffer): SauceFacts | undefined {
  if (buf.length < 128) return undefined;
  const record = buf.subarray(buf.length - 128);
  if (record.subarray(0, 7).toString('latin1') !== 'SAUCE00') return undefined;

  const text = (start: number, length: number) =>
    record.subarray(start, start + length).toString('latin1').replace(/\0/g, '').trim();

  const title = text(7, 35);
  const author = text(42, 20);
  const group = text(62, 20);
  const date = text(82, 8);
  const width = record.readUInt16LE(96);
  const height = record.readUInt16LE(98);

  // An all-blank record says nothing; treat it as unsigned rather than
  // rendering four empty fields.
  if (!title && !author && !group) return undefined;

  return { title, author, group, date, width: width || undefined, height: height || undefined };
}

/** What the board calls a command, from its own icon. */
function commandName(baseDir: string, command: string): string | undefined {
  const dir = path.join(baseDir, 'Commands', 'BBSCmd');
  const file = amigafs.findCaseInsensitive(dir, `${command}.info`);
  if (!file) return undefined;

  try {
    const name = readTooltypeMap(file).get('NAME');
    return name?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function commandExists(baseDir: string, command: string): boolean {
  const dir = path.join(baseDir, 'Commands', 'BBSCmd');
  return !!amigafs.findCaseInsensitive(dir, `${command}.info`);
}

/**
 * The file an `~SS_`/`~SR_` target names, as it sits on disk.
 *
 * `BBS:screens/x.txt` and `screens/x.txt` mean the same file, and the volume is
 * case-insensitive, so the answer is whatever findCaseInsensitive turns up.
 */
function resolveScreenReference(baseDir: string, target: string): string | null {
  const rel = target.replace(/^BBS:/i, '').replace(/\//g, path.sep);
  const full = path.join(baseDir, rel);
  return amigafs.findCaseInsensitive(path.dirname(full), path.basename(full));
}

function screenRefExists(baseDir: string, target: string): boolean {
  return !!resolveScreenReference(baseDir, target);
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
        // "~CC_gwall" is a command name; "Global Wall" is what the sysop calls
        // it. The icon knows, so the manager can say it.
        targetName: ref.code === 'CC' ? commandName(baseDir, ref.target) : undefined,
      }));

  return {
    // Readers are filled in by buildScreenIndex, which is the only place that
    // knows which nodes and conferences exist and what each one reads.
    readBy: [],
    sauce: readSauce(buf),
    relPath: path.relative(baseDir, absPath),
    bytes: buf.length,
    format,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    mci,
  };
}

/** The stem a security variant shares with its base screen: LOGON20.TXT -> logon. */
/** The screen types a caller can carry, plus the two this port adds. */
const SCREEN_TYPES = ['GR', 'IBM', 'ANS', 'ASC', 'SEQ', 'RIP'];

/**
 * Does `fileName` serve `screenFile`, and to whom?
 *
 * express.e:6273-6290: the caller's level is rounded down to a multiple of five
 * and walked down, and at each step the loader tries the caller's screen type,
 * then PETSCII, then RIP, then plain .TXT. So for BULL these all serve
 * somebody: BULL.TXT, BULL20.TXT, BULL20.TXT.GR, BULL.SEQ, BULL250.RIP.
 *
 * Returns null when the name is a different screen entirely.
 */
function variantOf(screenFile: string, fileName: string): { securityLevel?: number; screenType?: string } | null {
  const base = screenFile.toLowerCase().replace(/\.[^.]*$/, '');
  const lower = fileName.toLowerCase();

  // <base><level?>(.txt)?(.type)?
  const match = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)?(\\..+)?$`).exec(lower);
  if (!match) return null;

  const level = match[1] ? parseInt(match[1], 10) : undefined;
  // express.e only ever looks for multiples of five, so `BULL3.TXT` is not a
  // level-3 screen - it is a different file that happens to start the same way.
  if (level !== undefined && (level % 5 !== 0 || level > 255)) return null;

  const suffix = (match[2] ?? '').toUpperCase();
  const screenType = SCREEN_TYPES.find(type => suffix.endsWith(`.${type}`) && suffix !== '.TXT');

  return { securityLevel: level, screenType };
}

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

  /** relPath -> every screen that reads it. The answer to "can I delete this?". */
  const readers = new Map<string, ScreenReader[]>();

  const confConfig = loadConfConfig(baseDir);
  const conferences: ConferenceFacts[] = conferenceNumbers(baseDir).map(id => ({
    id,
    name: confConfig?.entries[id - 1]?.name?.trim() || `Conference ${id}`,
    dir: path.relative(baseDir, conferenceDir(baseDir, id)),
  }));
  const conferenceNames = new Map(conferences.map(conf => [conf.id, conf.name]));

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

      // Everything in that directory this screen can serve, and to whom. The
      // loader picks ONE of these per caller; all of them are read by the board.
      const variants: string[] = [];
      const matched: { name: string; securityLevel?: number; screenType?: string }[] = [];
      for (const name of listDir(dir)) {
        if (!isScreenFile(name)) continue;
        const variant = variantOf(fileName, name);
        if (!variant) continue;

        variants.push(name);
        matched.push({ name, ...variant });
      }

      // Which callers each variant actually serves. express.e walks DOWN in
      // fives, so a variant covers everything from its own level up to just
      // below the next one, and the top variant covers everything above it.
      const levels = [...new Set(matched.map(m => m.securityLevel).filter((l): l is number => l !== undefined))]
        .sort((a, b) => a - b);

      for (const variant of matched) {
        const rel = path.relative(baseDir, path.join(dir, variant.name));
        const level = variant.securityLevel;
        const next = level === undefined ? undefined : levels.find(l => l > level);

        readers.set(rel, [...(readers.get(rel) ?? []), {
          screen,
          scope,
          id,
          scopeName: scope === 'conf' && id ? conferenceNames.get(id) : undefined,
          securityLevel: level,
          screenType: variant.screenType,
          serves: level === undefined
            ? undefined
            : next !== undefined ? `${level}-${next - 1}` : `${level} and above`,
          via: found && path.relative(baseDir, found) === rel ? 'resolved' : 'variant',
        }]);
      }
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

  // A screen can pull another file in with ~SS_ or ~nSR_; that file is read by
  // the board just as surely as the screen naming it, and counting it unread is
  // how a sysop gets told to delete a logo every screen includes.
  for (const [rel, existing] of [...readers.entries()]) {
    const facts = factsFor(path.join(baseDir, rel));
    for (const ref of facts.mci) {
      if (ref.code !== 'SS' && ref.code !== 'SR') continue;
      const target = resolveScreenReference(baseDir, ref.target);
      if (!target) continue;

      const targetRel = path.relative(baseDir, target);
      readers.set(targetRel, [...(readers.get(targetRel) ?? []), {
        ...existing[0],
        via: 'include',
      }]);
    }
  }

  // Everything else under a screen directory. Listed, never hidden: a file
  // nothing reads is exactly what a sysop wants to find - but "nothing reads
  // it" now means no screen, at any security level, in any screen type, and no
  // include. It used to mean "is not the one file the loader picks at level
  // 255", which called every variant on the board dead.
  const unused: ScreenFileFacts[] = [];
  for (const dir of listScreenDirectories(baseDir)) {
    for (const name of listDir(dir)) {
      if (!isScreenFile(name)) continue;
      const rel = path.relative(baseDir, path.join(dir, name));
      if (readers.has(rel)) continue;
      unused.push(factsFor(path.join(dir, name)));
    }
  }

  for (const [rel, list] of readers.entries()) {
    const facts = files[rel] ?? factsFor(path.join(baseDir, rel));
    facts.readBy = list;
    files[rel] = facts;
  }

  return { screens, unused, files, conferences, builtAt: new Date().toISOString() };
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
