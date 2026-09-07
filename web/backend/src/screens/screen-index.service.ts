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
  resolveNodeScreenDir, screenSearchLocations, isScreenFile,
} from './screen-resolution';
import { countMciCodes, scanMciCodes } from './mci-catalog';
import { readScreenFlags } from './screen-flags';
import { parseMciReferences, type MciReference } from './mci-references';
import { commandLocationIsLive, loadCommandFromInfo } from '../utils/amiga-command-parser.util';
import { BBSPaths } from '../utils/bbs-paths.util';
import { conferenceDir, conferenceNumbers } from '../conferences/conference-paths';
import { readThemeRegistry, themeDirectory } from './theme-registry';
import { loadConfConfig } from '../services/conf-config.service';
import { screenTypeNames } from './screen-metadata';

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
  /** What the BOARD calls that type, from ScreenTypes.info - "Amiga Ansi". */
  screenTypeName?: string;
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
  /**
   * What is wrong with the file itself, if anything.
   *
   * `empty` - zero bytes, so it draws nothing.
   * `colour-codes-without-escape` - it holds `[0;1;31m` with the ESC byte
   *   gone, so a caller sees the codes printed instead of the colour. 47 files
   *   on the live board are in that state; the editor showing them as plain
   *   text was right, and nothing said why.
   */
  problems: ScreenProblem[];
  /**
   * Why a designer would never edit this file.
   *
   * `backup` - an old copy kept beside the real one: `.bak`, `.old`,
   *   `.backup-<stamp>`, `.stale`.
   * `runtime` - the board writes it for itself, so an edit is overwritten.
   *
   * Flagged, never hidden by the index: a file the manager refuses to show is
   * a file a sysop cannot find, and this board has already been told once that
   * its live screens were read by nothing.
   */
  generated?: 'backup' | 'runtime';
  /**
   * How many times each MCI code appears in this file, by catalog code.
   *
   * Counted from the buffer already in hand, so the census costs nothing on
   * top of the read and is cached with the rest of the file's facts. The
   * manager needs it to say "used in 179 files" beside `~SP` rather than
   * listing a hundred codes with nothing to tell them apart.
   */
  mciCodes: Record<string, number>;
  /**
   * Nothing here but the codes the board runs - no art at all.
   *
   * A screen is a program, and 258 of this board's files are pure plumbing:
   * `AWAITSCREEN.TXT` is `~CC_V-AWAIT|`, `LOGON10.TXT` is four includes and a
   * pause. Strip the codes, strip the escapes, strip the whitespace, and
   * nothing printable is left. An artist should never open one - the art they
   * are looking for is in the file those codes PULL IN.
   *
   * Flagged, never hidden by the index. The manager decides what to show; a
   * file the index refuses to report is a file a sysop cannot find, and this
   * board has been told once already that its live screens were read by
   * nothing.
   */
  codesOnly: boolean;

  /**
   * The door that owns this file, when it is a DOOR's art rather than the
   * board's.
   *
   * A door's screens are not routed by `screen-resolution.ts` at all - the
   * door opens them itself, through XIM JH_SF for a 68K door or its own reads
   * for a TypeScript one - so `findSecurityScreen`, the type-extension routing
   * and the whole scope model do NOT apply to them. They are listed because a
   * sysop asked to find "the art GWALL draws" without knowing that door's
   * directory layout, and they are TAGGED so the manager can keep them apart
   * from screens the board resolves.
   */
  door?: string;

  /**
   * The theme this file belongs to, when it lives under a registered theme's
   * directory. A theme's file is read by every caller WEARING the theme and
   * by nobody else, so in the board's own index it has no reader and is not
   * "read by nothing" either - the sysop opened Themes/tango/Board/BULL.TXT
   * and was told "no screen on this board reads this file", which was false.
   * Select the theme and the index built for it names the readers.
   */
  theme?: string;
}

export type ScreenProblem = 'empty' | 'colour-codes-without-escape';

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
  /** How many file areas it declares (NDIRS). Neither areas nor bases are named on disk. */
  fileAreas: number;
  /** How many message bases sit in it. */
  messageBases: number;
}

/**
 * A bulletin: art a caller reads by number.
 *
 * The board publishes their titles in `Bulletins/BullHelp.txt` - "#20 Card
 * Lobby Weekly Leaders" - and nothing was reading it, so a designer looking for
 * the weekly leaders bulletin had a numbered file and no way in.
 */
export interface BulletinFacts {
  number: number;
  /** Relative path of the art itself. */
  file: string;
  /** The title the board publishes, when it publishes one. */
  title?: string;
}

export interface ScreenIndex {
  screens: ScreenIndexEntry[];
  /** Files no screen reads - by the rule in ScreenReader, not by "is not the winner". */
  unused: ScreenFileFacts[];
  files: Record<string, ScreenFileFacts>;
  conferences: ConferenceFacts[];
  bulletins: BulletinFacts[];
  builtAt: string;
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
/**
 * Every installed door that has art of its own, and where it keeps it.
 *
 * Deliberately NOT part of `listScreenDirectories`: that list is what the
 * board RESOLVES screens from, and putting a door's directory in it would make
 * the door's files look like screens a caller could be served. They are a
 * different kind of thing and the index says so with the `door` tag.
 *
 * `node_modules` and `dist` are skipped: a door's dependencies are megabytes of
 * files that are not art, and one of them will always end in .txt.
 */
export function listDoorScreenDirectories(baseDir: string): { door: string; dir: string }[] {
  const doorsRoot = path.join(baseDir, 'Doors');
  const out: { door: string; dir: string }[] = [];

  let doors: fs.Dirent[];
  try {
    doors = fs.readdirSync(doorsRoot, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of doors) {
    if (!entry.isDirectory()) continue;
    const door = entry.name;

    const walk = (dir: string, depth: number) => {
      if (depth > 3) return; // deep enough for Doors/<door>/assets/screens
      let kids: fs.Dirent[];
      try {
        kids = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      if (kids.some(kid => kid.isFile() && isScreenFile(kid.name))) {
        out.push({ door, dir });
      }
      for (const kid of kids) {
        if (!kid.isDirectory()) continue;
        if (kid.name === 'node_modules' || kid.name === 'dist' || kid.name === '.git') continue;
        walk(path.join(dir, kid.name), depth + 1);
      }
    };
    walk(path.join(doorsRoot, door), 0);
  }

  return out;
}

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

  // Every theme's scope directories, so the manager can list and the editor can
  // open a theme's screens. Without this a theme is a directory nobody can
  // reach: the artist would have to write files onto the volume by hand, and
  // the sysop could create a theme they then could not fill.
  //
  // Read from the REGISTRY rather than by globbing `Themes/`: a directory with
  // no entry is not a theme, and listing it would offer files that nothing can
  // ever resolve.
  for (const theme of readThemeRegistry(baseDir).themes) {
    const root = themeDirectory(baseDir, theme);
    if (!root) continue; // `default` is the board's own screens, already listed
    addTree(root);
    addTree(path.join(root, 'Conf'));
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
/**
 * What is wrong with the bytes themselves.
 *
 * A CSI sequence is ESC + `[` + parameters + a letter. A file carrying `[0;1;31m`
 * with no ESC anywhere lost its escapes to a text-mode copy somewhere in its
 * history, and the board prints the codes at the caller instead of colouring
 * the line.
 */
/**
 * An old copy kept beside the real file. Every board grows these.
 *
 * Deliberately about the NAME: content cannot tell a backup from the screen it
 * was copied from - that is what makes it a backup.
 */
const BACKUP_NAME = /(\.bak\b|\.old\b|\.orig\b|\.stale\b|\.backup|~$|\.save\b|\.prev\b|\bcopy\b|\bcopy \d+\b)/i;

/**
 * Files the BOARD writes, which an edit would simply lose.
 *
 * express.e writes `Node<n>/CallersLog` and the other logs without a screen
 * extension, so they were never listed.
 *
 * `Callers.txt` and `callers!.txt` used to be here on the sysop's word and are
 * NOT board-written: express.e's only writer is `callersLog()`, which builds
 * `Node<n>/CallersLog` (express.e:9499) and never a `.txt`. On this board all
 * 62 copies are one of two hashes, the oldest stamped 2008, and not one is
 * dirty in git while every `Node<n>/CallersLog` is - the board rewrites the
 * log and leaves the screen alone. They are hand-drawn ANSI: a framed
 * `Spee N Name Location On-Time Action H:MM` header a designer may want to
 * edit.
 *
 * `Bulletins/lastc.txt` stays: Super-AmiLog (`Utils/lastcallers`) signs it in
 * the art, and RUNTIME_CONTENT's last-callers marker catches it too.
 */
const RUNTIME_NAME = /^(callerslog.*|lastc\.txt|.*\.log)$/i;

/**
 * Signatures of the tools that WRITE screens on this board.
 *
 * Bulletins 1 to 6 are rewritten every boot - five by MultiTop-II, whose own
 * header is in the art, and one by a last-callers generator. bull9 is
 * hand-drawn and untouched since January. A designer opening the gallery
 * should see the second kind, not the first.
 *
 * Content, not names: `bull6.txt` looks exactly like `bull9.txt` from the
 * outside, and the file names carry no hint at all.
 */
const RUNTIME_CONTENT: { marker: RegExp; tool: string }[] = [
  { marker: /MultiTop/i, tool: 'MultiTop-II' },
  { marker: /l\s*AST\s*c\s*ALLERS|LAST CALLERS/i, tool: 'a last-callers generator' },
];

function classifyGenerated(
  relPath: string,
  buf: Buffer,
  baseDir: string,
): 'backup' | 'runtime' | undefined {
  // The sysop's own answer first. `art` is an override that says the
  // heuristics below are wrong about this file, so it returns nothing rather
  // than a classification.
  const flag = readScreenFlags(baseDir)[relPath];
  if (flag === 'art') return undefined;
  if (flag) return flag;

  const name = path.basename(relPath);
  if (BACKUP_NAME.test(name)) return 'backup';
  if (RUNTIME_NAME.test(name)) return 'runtime';

  // Only worth reading for a bulletin-sized file; a 240 KB RIP screen is not
  // written by a stats door.
  if (buf.length < 64_000) {
    const text = buf.toString('latin1');
    if (RUNTIME_CONTENT.some(({ marker }) => marker.test(text))) return 'runtime';
  }

  return undefined;
}

/**
 * Is there anything in this file but codes?
 *
 * Take out every MCI code, then every ANSI escape, then all whitespace and
 * control bytes. What remains is what a caller would SEE drawn by this file
 * itself - and for a screen that only pulls other screens in, that is nothing.
 *
 * Added by 7d6826966 ("the screens page shows art by default, plumbing on
 * request") and lost again when 32d8118bc rewrote this file from a branch cut
 * before it - the perf rewrite replaced the whole module, so nothing in git
 * records a deletion and no commit shows up under `git log -S isCodesOnly`.
 * tests/screens/codes-only-screens.test.ts survived the loss and is what
 * caught it. The `codesOnly` FACT this used to put on ScreenFileFacts, and the
 * config-app artist filter that read it, went the same way and are NOT
 * restored here - see the report.
 */
export function isCodesOnly(text: string): boolean {
  let rest = text;
  // Back to front, so an earlier removal never shifts a later offset.
  for (const code of scanMciCodes(text).sort((a, b) => b.at - a.at)) {
    rest = rest.slice(0, code.at) + rest.slice(code.at + code.text.length);
  }

  return rest
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/[\s\x00-\x1f\x7f]/g, '')
    .length === 0;
}

function fileProblems(buf: Buffer, format: ScreenFormat): ScreenProblem[] {
  const problems: ScreenProblem[] = [];
  if (buf.length === 0) problems.push('empty');

  // Only for text-shaped screens: RIP and PETSCII carry their own byte
  // conventions and `[` means nothing special in them.
  if (format !== 'rip' && format !== 'petscii') {
    const text = buf.toString('latin1');
    const hasEscape = text.includes('\x1b');
    const hasBareCsi = /\[[0-9][0-9;]*m/.test(text);
    if (!hasEscape && hasBareCsi) problems.push('colour-codes-without-escape');
  }

  return problems;
}

/**
 * The titles the board publishes for its bulletins.
 *
 * BullHelp.txt is the menu a caller reads: a `#<number>` and a title, with any
 * amount of decoration around it. Parsed loosely on purpose - it is art, and
 * every board's is laid out differently.
 */
function bulletinTitles(baseDir: string): Map<number, string> {
  const titles = new Map<number, string>();
  const help = amigafs.findCaseInsensitive(path.join(baseDir, 'Bulletins'), 'BullHelp.txt');
  if (!help) return titles;

  try {
    const text = fs.readFileSync(help, 'latin1');
    // Strip colour so a title does not arrive wearing its escape codes.
    for (const line of text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split(/\r?\n/)) {
      const match = /^\s*#\s*(\d+)\s+(.+?)\s*$/.exec(line);
      if (!match) continue;
      titles.set(parseInt(match[1], 10), match[2].trim());
    }
  } catch { /* an unreadable help screen simply names nothing */ }

  return titles;
}

/** Every bulletin on the board, named where the board names it. */
function listBulletins(baseDir: string): BulletinFacts[] {
  const dir = path.join(baseDir, 'Bulletins');
  const titles = bulletinTitles(baseDir);

  try {
    return fs.readdirSync(dir)
      .map(name => ({ name, match: /^bull(\d+)\.[^.]+$/i.exec(name) }))
      .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
      .map(entry => ({
        number: parseInt(entry.match[1], 10),
        file: path.relative(baseDir, path.join(dir, entry.name)),
        title: titles.get(parseInt(entry.match[1], 10)),
      }))
      .sort((a, b) => a.number - b.number);
  } catch {
    return [];
  }
}

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

/**
 * Every command the board has an icon for, with the name IT calls the command.
 *
 * `~CC_gwall|` runs a command; `Commands/BBSCmd/GWALL.info` says the board
 * calls it "Global Wall" and who may run it. A picker that showed `gwall`
 * would be showing the sysop a filename, and the icon has been carrying the
 * real name all along.
 */
export interface BbsCommandChoice {
  /** What goes after `~CC_` - the icon's base name, in its own casing. */
  command: string;
  /** The icon's NAME tooltype, when it has one. */
  name?: string;
  /** The icon's ACCESS tooltype, as written. */
  access?: string;
}

export function listBbsCommands(baseDir: string): BbsCommandChoice[] {
  const dir = path.join(baseDir, 'Commands', 'BBSCmd');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const choices: BbsCommandChoice[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.info')) continue;
    const command = entry.slice(0, -'.info'.length);
    if (!command) continue;

    let tooltypes: Map<string, string>;
    try {
      tooltypes = readTooltypeMap(path.join(dir, entry));
    } catch {
      choices.push({ command });
      continue;
    }

    choices.push({
      command,
      name: tooltypes.get('NAME')?.trim() || undefined,
      access: tooltypes.get('ACCESS')?.trim() || undefined,
    });
  }

  return choices.sort((a, b) => a.command.localeCompare(b.command));
}

/**
 * Whether pressing that key does anything.
 *
 * An icon is not enough. `Commands/BBSCmd/<name>.info` can survive a door that
 * has been uninstalled, and the loader then SKIPS the registration - so the
 * screen still advertises the key, the caller still presses it, and nothing
 * happens. Reported from the live board 2026-09-02: "we have an mci command
 * that doesnt find its door as its not installed but its not listed as a
 * health issue".
 *
 * The liveness rule is the board's own - commandLocationIsLive - and not a
 * second one written here. It has to be, because the obvious rule is wrong:
 * nothing named `Doors/bbslink/bbslink` has ever existed on this board and 24
 * live commands point at it, so a missing FILE inside a door directory is
 * normal and only a missing DIRECTORY means the door is gone.
 */
function commandExists(baseDir: string, command: string): boolean {
  const dir = path.join(baseDir, 'Commands', 'BBSCmd');
  const icon = amigafs.findCaseInsensitive(dir, `${command}.info`);
  if (!icon) return false;

  try {
    const definition = loadCommandFromInfo(icon);
    // An icon with no tooltypes at all reads as null; the board keeps such a
    // registration, so this does too rather than calling art dead.
    if (!definition) return true;
    return commandLocationIsLive(baseDir, definition);
  } catch {
    return true;
  }
}

/**
 * The file an `~SS_`/`~SR_` target names, as it sits on disk.
 *
 * `BBS:screens/x.txt` and `screens/x.txt` mean the same file, and an Amiga
 * volume is case-insensitive in every part of a path - the directory as much
 * as the filename.
 *
 * Through BBSPaths, because a screen names its target in Amiga assigns and
 * `BBS:` is not the only one this board uses - `WORK:bbs/Screens/logoff/logoff`
 * appears in 42 of them. Stripping `BBS:` by hand answered for one assign and
 * treated the rest as literal directory names, which is a different verdict
 * from the one the loader reaches at runtime. Same resolver, same answer.
 */
function boardPath(baseDir: string, target: string): string {
  const resolved = new BBSPaths(baseDir).resolveAmigaPath(target);
  const absolute = path.isAbsolute(resolved)
    ? resolved
    : path.join(baseDir, resolved.replace(/\//g, path.sep));

  /*
   * A leading `bbs/` under the board root collapses away, because that is
   * what the BOARD does with it - twice, in two different ways.
   *
   * This board's screens say `~3SR_WORK:bbs/Screens/logoff/logoff`. `WORK:`
   * is the board root, so read literally that names `<root>/bbs/Screens/...`
   * and there is no `bbs` directory - which is how the manager came to report
   * a hundred live references as pointing at nothing, and how it told a sysop
   * that art the board displays every logoff was never displayed. The sysop
   * said so plainly: "the logoff ansi logos are also flagged as not in use i
   * doubt that".
   *
   * The runtime strips it in the `~SR_` sentinel (screen.handler:558-562) and
   * again on the `~SS_` path (screen.handler:1031). The index has to make the
   * same move or it is answering a different question from the board.
   */
  const prefix = path.join(baseDir, 'bbs') + path.sep;
  if (absolute.toLowerCase().startsWith(prefix.toLowerCase())) {
    return path.join(baseDir, absolute.slice(prefix.length));
  }
  return absolute;
}

/** A path as the filesystem spells it, whatever case the caller used. */
function onDiskSpelling(absolute: string): string {
  try {
    return fs.realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

function resolveScreenReference(baseDir: string, target: string): string | null {
  /*
   * EVERY component case-insensitively, not just the filename.
   *
   * findCaseInsensitive matches the last part and takes the DIRECTORY exactly
   * as written, so `~SS_BBS:screens/flt.txt` went looking for a `screens/`
   * that this board spells `Screens/`. A developer's Mac hides that - its
   * filesystem is case-insensitive itself - and the Linux container does not,
   * so the manager called six live codes dead while the board was displaying
   * that art perfectly well. Reported by the sysop: "the flt and uprough art
   * files do display on the live site so you are wrong".
   *
   * amigafs.resolvePath walks each component the way the LOADER does, so this
   * now answers the same question the board answers.
   */
  return amigafs.resolvePath(boardPath(baseDir, target));
}

/**
 * Every numbered file a `~SR_` base can land on.
 *
 * formatNumberedFilename (SequentialFileManager) builds `NNN.<basename>` in the
 * base's own directory, so `BBS:Screens/reference-board/reference-board.txt` covers
 * `001.reference-board.txt` through `999.reference-board.txt` - a pool the board picks
 * from at random, and art somebody drew.
 */
function numberedPool(baseDir: string, target: string): string[] {
  const full = boardPath(baseDir, target);
  const dir = path.dirname(full);
  const basename = path.basename(full);
  const stem = basename.replace(/\.[^.]*$/, '');

  try {
    // amigafs, so a pool written `screens/logoff` is found in `Screens/logoff`
    // - the same reason resolveScreenReference walks with it.
    return amigafs.readdirSync(dir)
      // `\\.` or the END of the name: this board's flt pool is `001.flt`,
      // `002.flt` with no extension at all, and requiring one after the stem
      // called all 58 references to it dead while the board showed the art.
      .filter(name => new RegExp(`^\\d+\\.${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.|$)`, 'i').test(name))
      .map(name => path.join(dir, name));
  } catch {
    return [];
  }
}

function screenRefExists(baseDir: string, target: string): boolean {
  return !!resolveScreenReference(baseDir, target);
}

/**
 * Whether each reference still points at something, and what the board calls
 * it.
 *
 * Deliberately NOT cached with the rest of a file's facts. These two answers
 * are the only ones that come from OTHER files: install the missing door and
 * the screen's own bytes have not changed, so a cached `resolves: false` would
 * outlive the problem and the health page would go on reporting a door that is
 * now sitting there.
 */
function resolveRefs(baseDir: string, refs: MciReference[]): MciReference[] {
  return refs.map(ref => ({
    ...ref,
    resolves: ref.code === 'CL'
      ? true
      : ref.code === 'CC'
        ? commandExists(baseDir, ref.target)
        // `~SR_` names a BASE, not a file: the board picks at random from
        // `001.logoff.txt`..`999.logoff.txt` beside it, and nothing called
        // plain `logoff` ever exists. Asking whether the base itself is on
        // disk called 12 live references dead.
        : ref.code === 'SR'
          ? numberedPool(baseDir, ref.target).length > 0
            || screenRefExists(baseDir, ref.target)
          : screenRefExists(baseDir, ref.target),
    // "~CC_gwall" is a command name; "Global Wall" is what the sysop calls
    // it. The icon knows, so the manager can say it.
    targetName: ref.code === 'CC' ? commandName(baseDir, ref.target) : undefined,
  }));
}

/**
 * The facts for a file, remembered until the file changes.
 *
 * Every fact here comes from the BYTES - the sha256, the MCI references, the
 * SAUCE record, the missing escape bytes - so the answer is only as old as the
 * file. Keyed on size and mtime: an edit through the manager changes both, and
 * a build that re-reads 1,145 unchanged files to say the same thing again is
 * what a sysop experiences as "why does it take so long".
 *
 * The one thing it does NOT hold settled is whether each MCI reference
 * resolves - see resolveRefs.
 */
const factsCache = new Map<string, { mtimeMs: number; size: number; facts: ScreenFileFacts }>();

export function screenFileFacts(baseDir: string, absPath: string): ScreenFileFacts {
  try {
    const stat = fs.statSync(absPath);
    const cached = factsCache.get(absPath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      // A copy: callers fill in readBy, which belongs to a build and not to
      // the file, and the references are re-resolved because what they point
      // at can appear or vanish without this file being touched.
      return {
        ...cached.facts,
        readBy: [],
        mci: resolveRefs(baseDir, cached.facts.mci),
      };
    }
  } catch { /* a file that will not stat is read below and fails there */ }

  const buf = fs.readFileSync(absPath);
  const name = path.basename(absPath);
  const format = sniffFormat(name, buf);

  // Only a text-shaped screen carries MCI; RIP and PETSCII bytes would produce
  // noise that looks like references.
  const mci = format === 'rip' || format === 'petscii'
    ? []
    : resolveRefs(baseDir, parseMciReferences(buf.toString('latin1')));

  /*
   * Measured on the bytes already in hand, beside the MCI census. Only for a
   * text-shaped screen: RIP and PETSCII carry their own conventions and
   * "strip the escapes" means nothing in them.
   */
  const codesOnly = (format === 'ansi' || format === 'text') && buf.length > 0
    ? isCodesOnly(buf.toString('latin1'))
    : false;

  const facts: ScreenFileFacts = {
    // Readers are filled in by buildScreenIndex, which is the only place that
    // knows which nodes and conferences exist and what each one reads.
    readBy: [],
    sauce: readSauce(buf),
    problems: fileProblems(buf, format),
    generated: classifyGenerated(path.relative(baseDir, absPath), buf, baseDir),
    // latin1: an Amiga high-bit byte is not UTF-8, and a code is ASCII either way.
    mciCodes: countMciCodes(buf.toString('latin1')),
    codesOnly,
    relPath: path.relative(baseDir, absPath),
    bytes: buf.length,
    format,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    mci,
  };

  try {
    const stat = fs.statSync(absPath);
    factsCache.set(absPath, { mtimeMs: stat.mtimeMs, size: stat.size, facts });
  } catch { /* unreadable now; the next call reads it again */ }

  return facts;
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

/**
 * `themeSlug` builds the index AS A CALLER WEARING THAT THEME sees it: every
 * resolution walks the theme's directories before the board's, exactly as the
 * loader does. Without it the index is the board's own - which is `default`.
 * Asked for by the sysop: one selector on the screens page, and the gallery
 * and the tables show what a caller in that theme is actually served.
 */
export function buildScreenIndex(baseDir: string, themeSlug?: string): ScreenIndex {
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
  const conferences: ConferenceFacts[] = conferenceNumbers(baseDir).map(id => {
    const dir = conferenceDir(baseDir, id);

    // NDIRS is the count express.e reads; neither the areas nor the message
    // bases carry names on this board, so the count is the honest answer.
    let fileAreas = 0;
    try {
      fileAreas = parseInt(fs.readFileSync(path.join(dir, 'NDIRS'), 'latin1').trim(), 10) || 0;
    } catch { /* a conference with no NDIRS declares none */ }

    let messageBases = 0;
    try {
      messageBases = fs.existsSync(path.join(dir, 'MsgBase')) ? 1 : 0;
    } catch { /* likewise */ }

    return {
      id,
      name: confConfig?.entries[id - 1]?.name?.trim() || `Conference ${id}`,
      dir: path.relative(baseDir, dir),
      fileAreas,
      messageBases,
    };
  });
  const conferenceNames = new Map(conferences.map(conf => [conf.id, conf.name]));
  // The board names its own screen types; `.GR` means nothing to a designer.
  const typeNames = screenTypeNames(baseDir);

  for (const [screen, dirType] of Object.entries(SCREEN_DIR_MAP)) {
    const fileName = getScreenFileName(screen);
    const stem = variantStem(fileName);
    const resolutions: ScopeResolution[] = [];

    for (const { scope, id } of scopesFor(baseDir, dirType)) {
      const locations = screenSearchLocations(baseDir, screen, {
        nodeId: scope === 'node' ? (id ?? 0) : 1,
        confId: scope === 'conf' ? (id ?? undefined) : undefined,
        themeSlug,
      });
      if (locations.length === 0) continue;

      let found: string | null = null;
      /*
       * The directory the screen was actually found in - NOT locations[0].
       *
       * A screen is searched for in several places and the variants below are
       * listed from one of them. Taking the first meant a screen found in a
       * LATER location had its readers counted in a directory that does not
       * contain it: `LOGON24` resolves to `Screens/Logon24hrs.txt` and its
       * readers were looked for in the board root, so the file came back read
       * by nobody. Reported by the sysop, who knew better: "Logon24hrs.txt is
       * flagged as not used but it's used when a user runs out of time".
       */
      let foundIn = locations[0].dir;
      for (const location of locations) {
        // The same call the loader makes, so the answer is the loader's answer.
        const hit = findSecurityScreen(path.join(location.dir, fileName), 255, '.TXT', false, false);
        if (!hit) continue;
        // findSecurityScreen answers with the extension it BUILT (`.TXT`),
        // which on a case-insensitive filesystem is not the name on disk. The
        // manager shows and edits real filenames, so report the real one.
        found = amigafs.findCaseInsensitive(path.dirname(hit), path.basename(hit)) || hit;
        foundIn = location.dir;
        break;
      }

      const dir = foundIn;
      const ownDir = scope === 'node' ? path.join(baseDir, `Node${id}`) : dir;

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
          screenTypeName: variant.screenType ? typeNames[variant.screenType] : undefined,
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
  //
  // Walked to a fixed point, not one level: an included file can include
  // another (a logon that pulls in a frame that pulls in a logo), and a single
  // pass over a snapshot of the readers left the second hop unread. `walked`
  // stops a file being expanded twice and makes an include cycle finite.
  const walked = new Set<string>();
  let frontier = [...readers.keys()];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const rel of frontier) {
      if (walked.has(rel)) continue;
      walked.add(rel);
      const existing = readers.get(rel);
      if (!existing?.length) continue;
      const facts = factsFor(path.join(baseDir, rel));
      for (const ref of facts.mci) {
        if (ref.code !== 'SS' && ref.code !== 'SR') continue;
        // `~<n>SR_<base>` shows a RANDOM numbered file from the base's directory
        // - `Screens/reference-board/007.reference-board.txt` and its siblings
        // (screen.handler.ts:851, express.e:5533-5554). There is no single file
        // to resolve, so every one of them used to be read by nothing while the
        // board showed them daily.
        const targets = ref.code === 'SR'
          ? numberedPool(baseDir, ref.target)
          : [resolveScreenReference(baseDir, ref.target)].filter((t): t is string => !!t);
        for (const target of targets) {
          // The ON-DISK spelling, not the reference's. `~SS_BBS:screens/logo.txt`
          // names a directory this board spells `Screens/`; on a case-folding
          // filesystem (a developer's Mac) the reference resolves as written,
          // and a reader keyed `screens/logo.txt` never meets the facts keyed
          // `Screens/logo.txt` - so the include was credited to a path nothing
          // else used and the file stayed an orphan. Linux walks the case and
          // never showed it, which is why the test for it only failed here.
          // Both sides through realpath: on a Mac the temp root itself is a
          // symlink (/var -> /private/var), and one side canonicalised alone
          // makes the relative path climb out of the board.
          const targetRel = path.relative(onDiskSpelling(baseDir), onDiskSpelling(target));
          readers.set(targetRel, [...(readers.get(targetRel) ?? []), {
            ...existing[0],
            via: 'include',
          }]);
          if (!walked.has(targetRel)) next.push(targetRel);
        }
      }
    }
    frontier = next;
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

  // A theme's files. In the BOARD's index nothing resolves them, so every one
  // landed in `unused` and the manager called it read by nothing. It is read
  // by whoever wears the theme: tag it, and keep it out of the orphans unless
  // this index IS that theme's - in which case a theme file nothing resolves
  // is exactly the dangling file the tab exists to show.
  const themeOf = (rel: string): string | undefined => {
    for (const theme of readThemeRegistry(baseDir).themes) {
      const root = themeDirectory(baseDir, theme);
      if (!root) continue;
      const themeRel = path.relative(baseDir, root);
      if (rel === themeRel || rel.startsWith(themeRel + path.sep)) return theme.slug;
    }
    return undefined;
  };
  for (const facts of Object.values(files)) {
    const slug = themeOf(facts.relPath);
    if (slug) facts.theme = slug;
  }
  for (let i = unused.length - 1; i >= 0; i--) {
    const slug = unused[i].theme;
    if (slug && slug !== themeSlug) unused.splice(i, 1);
  }

  // A door's own art. Tagged rather than mixed in: nothing here is resolved by
  // the board, so it must not appear beside screens that are.
  for (const { door, dir } of listDoorScreenDirectories(baseDir)) {
    for (const name of listDir(dir)) {
      if (!isScreenFile(name)) continue;
      const facts = factsFor(path.join(dir, name));
      facts.door = door;
      unused.push(facts);
    }
  }

  for (const [rel, list] of readers.entries()) {
    const facts = files[rel] ?? factsFor(path.join(baseDir, rel));
    facts.readBy = list;
    files[rel] = facts;
  }

  const bulletins = listBulletins(baseDir);
  // A bulletin is read by number, not by a screen name, so the catalogue walk
  // never sees one - and it would otherwise be reported as read by nothing.
  for (const bulletin of bulletins) {
    const facts = files[bulletin.file] ?? factsFor(path.join(baseDir, bulletin.file));
    files[bulletin.file] = facts;
  }
  const bulletinFiles = new Set(bulletins.map(b => b.file));

  return {
    screens,
    unused: unused.filter(file => !bulletinFiles.has(file.relPath)),
    files,
    conferences,
    bulletins,
    builtAt: new Date().toISOString(),
  };
}

/** One entry per theme (the board itself is the empty slug), each on its own key. */
const cachedByTheme = new Map<string, { key: string; index: ScreenIndex }>();

/** The index, rebuilt when any screen directory's mtime moves. */
export function getScreenIndex(baseDir: string, themeSlug?: string): ScreenIndex {
  const key = listScreenDirectories(baseDir)
    .map(d => {
      try { return `${d}:${fs.statSync(d).mtimeMs}`; } catch { return `${d}:gone`; }
    })
    .join('|');

  const slot = themeSlug ?? '';
  const cached = cachedByTheme.get(slot);
  if (cached && cached.key === key) return cached.index;
  const index = buildScreenIndex(baseDir, themeSlug);
  cachedByTheme.set(slot, { key, index });

  // A themed view is a VIEW; the live-theme check below is about the board.
  if (themeSlug) return index;

  /*
   * The board just changed, so every LIVE theme is checked against it again.
   *
   * A theme is validated when it is PUBLISHED and was never looked at after
   * that, which the themes plan wrote down as knowingly undone: "a sysop who
   * adds a security variant to the BOARD after a theme has gone live re-opens
   * the shadowing hole ... The spec names the index rebuild as the hook; it is
   * not wired." This is that hook.
   *
   * The cache is set FIRST on purpose: validateTheme asks for the index, and
   * it must find the one just built rather than start another build.
   *
   * require(), not import: theme-validation imports this module, and the cycle
   * is only harmless if it is resolved when called rather than when loaded.
   * Failure here must never cost the caller their screens - an index that
   * built is worth returning whatever the themes say.
   */
  try {
    const { liveThemeRegressions, announceLiveThemeRegressions } = require('./theme-live-check');
    announceLiveThemeRegressions(liveThemeRegressions(baseDir, index.builtAt));
  } catch (error) {
    console.warn(`[Themes] live theme check skipped: ${(error as Error).message}`);
  }

  return index;
}

/** Called by every write route: the next read rebuilds. */
export function invalidateScreenIndex(): void {
  cachedByTheme.clear();
  // factsCache too, and not only because it is stale bytes.
  //
  // A file's facts are keyed on ITS OWN mtime and size, but `resolves` on an
  // MCI reference is a fact about a DIFFERENT file: `~CC_confrequest` resolves
  // when Commands/BBSCmd/CONFREQUEST.info exists. Installing that door does
  // not touch the screen that names it, so the entry stayed valid for ever and
  // the health check went on telling the sysop the door was missing after they
  // had installed it. The same holds for `~SS_`/`~SR_` and their targets.
  factsCache.clear();
}

/**
 * Forget what every file was, not just how the index was assembled.
 *
 * A file's facts are cached on its own size and mtime, which is right for an
 * edit and WRONG for a sysop's flag: marking a screen as art changes what the
 * manager should say about bytes that did not move. Without this the override
 * was written to disk, read back correctly, and never reached the answer -
 * caught by the test that marked a file and asked the index about it.
 */
export function invalidateScreenFacts(): void {
  factsCache.clear();
  cachedByTheme.clear();
}
