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
import { BOARD_WRITTEN_NAME } from './screen-tables';
import {
  QUESTIONNAIRE_SCREEN, isQuestionnaireScript, preferredScript, baudOf,
} from './questionnaire-script';
import { countMciCodes, scanMciCodes, type ScannedMciCode } from './mci-catalog';
import { checkPetsciiBoardRules } from './petscii-board-rules';
import { readScreenFlags } from './screen-flags';
import { parseMciReferences, type MciReference } from './mci-references';
import { screenIsProgram } from './screen-blankness';
import { commandLocationIsLive, loadCommandFromInfo } from '../utils/amiga-command-parser.util';
import { BBSPaths } from '../utils/bbs-paths.util';
import { conferenceDir, conferenceNumbers } from '../conferences/conference-paths';
import { readThemeRegistry, themeDirectory } from './theme-registry';
import { loadConfConfig } from '../services/conf-config.service';
import { screenTypeNames } from './screen-metadata';

export type ScreenFormat = 'ansi' | 'text' | 'rip' | 'petscii' | 'teletext' | 'teletext-native';

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
  via: 'resolved' | 'variant' | 'include' | 'shadowed';
  /**
   * The theme covering this file, when `via` is `shadowed`.
   *
   * Set only in a THEMED index: the theme answers first, so the board's own
   * screen is not what a caller wearing it sees - but it is still what every
   * other caller sees, and calling it read by nothing is how a sysop is told
   * their main menu is dead.
   */
  shadowedBy?: string;
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
   * `petscii-graphics-bank` / `petscii-non-black-background` - a `.seq` that
   *   breaks one of the two rules a C64 board runs (sysop, 2026-09-14). A save
   *   that breaks them is refused; one already on the board is REPORTED here
   *   and served exactly as its artist drew it.
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
   * Does this screen RUN something, as opposed to only showing something?
   *
   * Wider than `codesOnly`, and asked for a different reason. `codesOnly` is
   * "an artist should not open this, there is no art in it". This is "a THEME
   * does not own this": a screen carrying `~SS_`, `~CC_`, `~XI` and friends
   * decides which bulletins a caller sees and which doors run, so the board's
   * copy is what the loader reads whatever theme the caller wears
   * (thoughts/shared/plans/2026-09-14-a-theme-owns-art-not-behaviour-design.md).
   *
   * A conference bulletin is BOTH - 1745 bytes of ANSI logo with one include
   * at the end - which is exactly why the two flags cannot be one.
   */
  program: boolean;

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

export type ScreenProblem =
  | 'empty'
  | 'colour-codes-without-escape'
  | 'petscii-graphics-bank'
  | 'petscii-non-black-background';

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

/**
 * The FILES in a directory.
 *
 * This read the directory itself, once per call, and the index asks it for
 * every search location of every screen: thousands of readdir calls per build
 * against the same hundred-odd directories, 1.5 seconds of a 3 second build
 * (measured, 2026-09-14). amigafs already remembers a directory's listing
 * until the directory changes, so the answer comes from there rather than
 * from a second cache that could disagree with it about what is on disk.
 */
function listDir(dir: string): string[] {
  return amigafs.listFiles(dir);
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
 *
 * `Utils/` IS SCANNED TOO, for the same reason and with the same rules. The
 * classic Amiga utilities keep their templates there rather than under
 * `Doors/` - SAmiLog's `samilog.header.txt` is the logo at the top of the Last
 * Callers bulletin, and the sysop could not reach it from the screen manager
 * because of where it happens to live. Its height decides how many callers fit
 * on that screen (SamiLogService's `fitRows`), so editing it is how the sysop
 * buys the fit; a file that changes what a caller sees and cannot be edited is
 * the wrong half of a feature. Measured before widening: `Utils/` holds four
 * art files in total, all four SAmiLog's.
 */
const SCREEN_ART_ROOTS = ['Doors', 'Utils'];

export function listDoorScreenDirectories(baseDir: string): { door: string; dir: string }[] {
  const out: { door: string; dir: string }[] = [];

  for (const root of SCREEN_ART_ROOTS) {
  const doorsRoot = path.join(baseDir, root);

  let doors: fs.Dirent[];
  try {
    doors = fs.readdirSync(doorsRoot, { withFileTypes: true });
  } catch {
    continue;
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

  // A theme's Files/ mirror nests (Files/Screens/logoff/): one level never
  // reaches it, so a theme file there was invisible to the index - the
  // studio offered its slot as undrawn and opened a blank canvas over art,
  // and uploads into it never surfaced. Walk it deep; it is sysop-curated
  // art, not a dependency tree.
  const addTreeDeep = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    dirs.add(dir);
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        if (fs.statSync(full).isDirectory()) addTreeDeep(full);
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
    addTreeDeep(path.join(root, 'Files'));
  }

  return [...dirs].filter(d => fs.existsSync(d));
}

/** The format, sniffed from the bytes rather than trusted from the extension. */
function sniffFormat(name: string, buf: Buffer): ScreenFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith('.rip') || buf.subarray(0, 2).toString('latin1') === '!|') return 'rip';
  if (lower.endsWith('.seq')) return 'petscii';
  // WEB_: .tti is native packet-level teletext (edit.tf / wxTED / Marco
  // family) - listed, never parsed as text. .ttx is this board's ANSI
  // teletext (the TDAText face does the work), drawn like ANSI.
  if (lower.endsWith('.tti')) return 'teletext-native';
  if (lower.endsWith('.ttx')) return 'teletext';
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
 *
 * `AchieveTop.txt` is here by NAME, against this module's usual rule, because
 * the name IS the evidence: achievements/bulletin.ts owns it and rewrites it
 * every fifteen minutes, and unlike `bull6.txt` beside `bull9.txt` there is no
 * hand-drawn file it could be confused with. Content would not do - a sysop
 * who fills the `AchieveTop.Header` slot replaces the strap a marker would
 * look for. Its `.Header` and `.Tailer` are art and must not match.
 * Left unmarked, seeding a theme copied the bulletin into it, and a theme copy
 * WINS the global screen walk - so the leaderboards froze at the moment the
 * theme was made (measured on the live board, 2026-09-08).
 *
 * `bull9.txt` is here because the door that writes it changed hands: the
 * classic `Request v2.1` door wrote it, our own REQUESTS door writes it now,
 * and in between it sat frozen for five days looking exactly like art. Its
 * content is the sysop's own, unmarked, so only the name can catch it.
 *
 * `quicknew.txt` is here for the same reason, found by auditing the whole
 * class after that bug rather than waiting for it to bite twice: the batch
 * jobs redirect a door's stdout over it every run (see command.handler's
 * EXEC_QUICKNEW comment), and a theme seeded today would serve last week's
 * new-files list for ever. Content cannot catch it - the file is whatever
 * door the sysop pointed the batch at.
 */
const RUNTIME_NAME = BOARD_WRITTEN_NAME;   // the one copy, in screen-tables

/**
 * Signatures of the tools that WRITE screens on this board.
 *
 * Bulletins 1 to 6 are rewritten every boot - five by MultiTop-II, whose own
 * header is in the art, and one by a last-callers generator. A designer
 * opening the gallery should see art, not output.
 *
 * Content, not names: `bull6.txt` looks exactly like a hand-drawn bulletin
 * from the outside, and the file names carry no hint at all. `bull9.txt` is
 * the case that proves the limit of that - the REQUESTS door writes it
 * between the sysop's own header and tail art, so there is no marker to find
 * and it is caught by NAME in RUNTIME_NAME above.
 */
const RUNTIME_CONTENT: { marker: RegExp; tool: string }[] = [
  { marker: /MultiTop/i, tool: 'MultiTop-II' },
  { marker: /l\s*AST\s*c\s*ALLERS|LAST CALLERS/i, tool: 'a last-callers generator' },
  // S-AmiLog's record table (SamiLogService.generateRecordStats). Unlike its
  // weekly sibling it signs nothing - the "Last Callers" marker above catches
  // that one - and the batch writes it to a path the SYSOP names, so there is
  // no filename to match on either. This header IS the signature.
  { marker: /^\s*Area\s+Record\s+Date\s*$/m, tool: 'S-AmiLog record stats' },
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
export function isCodesOnly(text: string, scanned?: ScannedMciCode[]): boolean {
  /*
   * One pass, keeping what lies BETWEEN the codes.
   *
   * This removed the codes one at a time, back to front, and each removal
   * copied the whole remaining string: a screen that is mostly MCI - the
   * board has several with hundreds of codes - cost time in the square of its
   * length, and it was 564 ms of a 2.2 second index build (measured,
   * 2026-09-14). The kept segments are the same characters in the same order.
   */
  const codes = (scanned ?? scanMciCodes(text)).slice().sort((a, b) => a.at - b.at);
  const kept: string[] = [];
  let cursor = 0;
  for (const code of codes) {
    // A code inside one already removed contributes nothing, which is what
    // back-to-front removal did with it too.
    if (code.at < cursor) continue;
    kept.push(text.slice(cursor, code.at));
    cursor = code.at + code.text.length;
  }
  kept.push(text.slice(cursor));

  return kept.join('')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/[\s\x00-\x1f\x7f]/g, '')
    .length === 0;
}

function fileProblems(buf: Buffer, text: string, format: ScreenFormat): ScreenProblem[] {
  const problems: ScreenProblem[] = [];
  if (buf.length === 0) problems.push('empty');

  // Only for text-shaped screens: RIP, PETSCII and native teletext
  // carry their own byte conventions and `[` means nothing special in them.
  if (format !== 'rip' && format !== 'petscii' && format !== 'teletext-native') {
    const hasEscape = text.includes('\x1b');
    const hasBareCsi = /\[[0-9][0-9;]*m/.test(text);
    if (!hasEscape && hasBareCsi) problems.push('colour-codes-without-escape');
  }

  /*
   * THE TWO C64 RULES, for the files they are about.
   *
   * Reported, never corrected: a screen already on the board that draws in the
   * graphics bank goes on reaching callers exactly as its artist saved it. The
   * refusal that stops a NEW one arriving lives on the write endpoints
   * (`petscii-board-rules.ts`); this is how a sysop finds the ones that were
   * there before the rules were.
   */
  if (format === 'petscii' && buf.length > 0) {
    for (const violation of checkPetsciiBoardRules(buf)) {
      problems.push(violation.rule === 'graphics-bank'
        ? 'petscii-graphics-bank'
        : 'petscii-non-black-background');
    }
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
  /*
   * ONE stat, reused as the cache key below.
   *
   * This used to stat once here to check the cache and again after reading to
   * store it - two syscalls per file, 1,861 of one build on this board.
   *
   * Reusing the FIRST is also the safer of the two. A file changed while it
   * was being read would, with a post-read stat, be stored as "new mtime,
   * old bytes", and the next caller would match that key and be served the
   * stale content for ever. Stored against the pre-read stat it comes out as
   * "old mtime, new bytes": the next caller sees the mtime move and reads
   * again, which is the failure worth having.
   */
  let seen: { mtimeMs: number; size: number } | null = null;
  try {
    const stat = fs.statSync(absPath);
    seen = { mtimeMs: stat.mtimeMs, size: stat.size };
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

  /*
   * The bytes as text, and the MCI scan of them, ONCE.
   *
   * Four questions below each decoded the whole buffer again and two of them
   * walked it looking for codes. latin1: an Amiga high-bit byte is not UTF-8,
   * and a code is ASCII either way.
   */
  const text = buf.toString('latin1');
  const scanned = scanMciCodes(text);

  // Only a text-shaped screen carries MCI; RIP, PETSCII and native
  // teletext bytes would produce noise that looks like references.
  const mci = format === 'rip' || format === 'petscii' || format === 'teletext-native'
    ? []
    : resolveRefs(baseDir, parseMciReferences(text));

  /*
   * Measured on the bytes already in hand, beside the MCI census. Only for a
   * text-shaped screen: RIP and PETSCII carry their own conventions and
   * "strip the escapes" means nothing in them.
   */
  const codesOnly = (format === 'ansi' || format === 'text' || format === 'teletext') && buf.length > 0
    ? isCodesOnly(text, scanned)
    : false;

  /*
   * One predicate, shared with the loader and the theme seeder - the answer
   * has to be the same in all three or a screen the admin calls board-owned
   * is one a theme still overrides.
   */
  const program = screenIsProgram(buf);

  const facts: ScreenFileFacts = {
    // Readers are filled in by buildScreenIndex, which is the only place that
    // knows which nodes and conferences exist and what each one reads.
    readBy: [],
    sauce: readSauce(buf),
    problems: fileProblems(buf, text, format),
    generated: classifyGenerated(path.relative(baseDir, absPath), buf, baseDir),
    mciCodes: countMciCodes(text, scanned),
    codesOnly,
    program,
    relPath: path.relative(baseDir, absPath),
    bytes: buf.length,
    format,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    mci,
  };

  // The stat taken before the read - see the note at the top of this function.
  if (seen) factsCache.set(absPath, { mtimeMs: seen.mtimeMs, size: seen.size, facts });

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
  /** Filled after the catalogue walk; the questionnaire is found by its own rule. */
  const questionnaireResolutions: ScopeResolution[] = [];

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
      /*
       * Screen files that exist but have nothing in them, in search order.
       *
       * The loader skips them while it has anywhere else to look and keeps
       * the first as a last resort (screens/screen-blankness.ts). This walk has
       * to do the same or the manager credits a screen to a placeholder the
       * board never serves.
       */
      const hollow: string[] = [];
      const hollowIn = new Map<string, string>();
      for (const location of locations) {
        // The same call the loader makes, so the answer is the loader's answer.
        const before = hollow.length;
        const hit = findSecurityScreen(path.join(location.dir, fileName), 255, '.TXT', false, false, false, false, { hollow });
        for (let i = before; i < hollow.length; i++) hollowIn.set(hollow[i], location.dir);
        if (!hit) continue;
        // findSecurityScreen answers with the extension it BUILT (`.TXT`),
        // which on a case-insensitive filesystem is not the name on disk. The
        // manager shows and edits real filenames, so report the real one.
        found = amigafs.findCaseInsensitive(path.dirname(hit), path.basename(hit)) || hit;
        foundIn = location.dir;
        break;
      }
      if (!found && hollow.length > 0) {
        // Every location was hollow: the loader serves the first one, so this
        // credits the same file.
        found = amigafs.findCaseInsensitive(path.dirname(hollow[0]), path.basename(hollow[0])) || hollow[0];
        foundIn = hollowIn.get(hollow[0]) ?? foundIn;
      }

      const dir = foundIn;
      const ownDir = scope === 'node' ? path.join(baseDir, `Node${id}`) : dir;

      // Everything this screen can serve, and to whom. The loader picks ONE
      // file per caller; all of them are read by the board.
      const variantsIn = (from: string) => {
        const found: { name: string; securityLevel?: number; screenType?: string }[] = [];
        for (const name of listDir(from)) {
          if (!isScreenFile(name)) continue;
          const variant = variantOf(fileName, name);
          if (!variant) continue;
          found.push({ name, ...variant });
        }
        return found;
      };

      const variants: string[] = variantsIn(dir).map(v => v.name);

      /*
       * EVERY search location, not only the one that answers a sysop.
       *
       * `screenSearchLocations` gives a conference screen `Conf<n>` and then
       * `Conf<n>/Screens`, and a global screen the board root and then
       * `Screens/` - and `findSecurityScreen` runs per CALLER, walking that
       * caller's level down in fives inside one directory before the loader
       * moves to the next. So a directory holding only `bull20.txt` answers
       * nobody below level 20, and the `BULL.TXT` in the next directory is
       * what those callers are shown.
       *
       * Claiming variants from the resolved directory alone declared all of
       * them dead: on this board that was every conference's `Screens/`
       * directory, offered to artists as files nothing reads. The sysop:
       * "either the claim is wrong and they are used or they should not be
       * included in the gallery".
       *
       * `floor` is the lowest level the directories already walked answer for,
       * which is exactly the level below which the loader falls through. A
       * directory with an UNNUMBERED file answers every caller, so nothing
       * after it is reachable and the walk stops there.
       */
      const servesRange = (level: number | undefined, next: number | undefined, ceiling: number) => {
        const top = next ?? ceiling;
        if (level === undefined) return Number.isFinite(top) ? `below ${top}` : undefined;
        return Number.isFinite(top) ? `${level}-${top - 1}` : `${level} and above`;
      };

      /*
       * A THEME does not delete the board's screen, it covers it.
       *
       * In a themed index the theme's directories are walked first and answer
       * first, so the walk below used to stop there and the board's own
       * `Conf1/MENU250.TXT` was claimed by nobody - reported to the sysop as
       * "No screen on this board reads this file", about the main menu every
       * caller not wearing the theme is served. Measured on the live board:
       * selecting a theme moved 100 files from read to unread.
       *
       * So the walk carries on into the board's directories after a theme has
       * answered, and what it finds there is `shadowed`: read, by every caller
       * who is not wearing this theme.
       */
      let shadowedBy: string | undefined;
      let floor = Number.POSITIVE_INFINITY;
      for (const location of locations) {
        const matched = variantsIn(location.dir);
        if (matched.length === 0) continue;

        // express.e walks DOWN in fives, so a variant covers everything from
        // its own level up to just below the next one.
        const levels = [...new Set(matched.map(m => m.securityLevel).filter((l): l is number => l !== undefined))]
          .sort((a, b) => a - b);

        for (const variant of matched) {
          const rel = path.relative(baseDir, path.join(location.dir, variant.name));
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
            serves: servesRange(level, next, shadowedBy ? Number.POSITIVE_INFINITY : floor),
            via: shadowedBy
              ? 'shadowed'
              : found && path.relative(baseDir, found) === rel ? 'resolved' : 'variant',
            ...(shadowedBy ? { shadowedBy } : {}),
          }]);
        }

        // Under a theme the board's own levels start again from the top: the
        // theme's floor bounds nothing a caller without the theme sees.
        if (!shadowedBy) floor = Math.min(floor, ...matched.map(m => m.securityLevel ?? 0));
        if (matched.some(m => m.securityLevel === undefined)) {
          // A theme that answers everybody stops nothing: the board's own copy
          // underneath is still what every other caller is served. Mark what
          // follows as shadowed and keep walking; the board's directories stop
          // the walk for real.
          if (!location.themed) break;
          shadowedBy = shadowedBy ?? themeSlug;
          floor = Number.POSITIVE_INFINITY;
        }
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

  /*
   * THE QUESTIONNAIRE, which is a screen the catalogue walk cannot find.
   *
   * `Node<n>/script<baud>` has no screen EXTENSION, so `findSecurityScreen`
   * (which builds `<name>.TXT` and walks levels in fives) never reaches one,
   * and `variantOf` would read the baud as a security level - 2400 is not a
   * level this board can have. The bulletins a few lines below are here for
   * the same reason: read by number rather than by name, and otherwise
   * reported as read by nothing.
   *
   * It IS a screen - a text in a node directory, fanned out to every node,
   * shown to a caller, carrying the `~CC_` codes the board runs - so it is
   * listed as one, with the bauds as its variants. A bare trailing `~` marks
   * a question, which is the one thing about the file that is not
   * screen-shaped.
   */
  for (const { scope, id } of scopesFor(baseDir, ScreenDirType.NODE)) {
    if (scope !== 'node' || id === null) continue;
    const dirRel = `Node${id}`;
    const names = listDir(path.join(baseDir, dirRel)).filter(isQuestionnaireScript);
    if (names.length === 0) continue;

    const run = preferredScript(names);
    const file = run ? path.join(dirRel, run) : null;

    questionnaireResolutions.push({
      scope: 'node',
      id,
      dir: dirRel,
      dirIsShared: false,
      file,
      variants: names.slice().sort((a, b) => a.localeCompare(b)),
    });

    // Every copy is read by the board: the caller's own baud picks one, and
    // which one that is depends on the caller, not on the file.
    for (const name of names) {
      const rel = path.join(dirRel, name);
      readers.set(rel, [...(readers.get(rel) ?? []), {
        screen: QUESTIONNAIRE_SCREEN,
        scope: 'node',
        id,
        // NOT securityLevel: the digits are a modem speed.
        serves: `${baudOf(name)} baud`,
        via: name === run ? 'resolved' : 'variant',
      }]);
      factsFor(path.join(baseDir, rel));
    }
  }

  if (questionnaireResolutions.length > 0) {
    const hashes = new Map<string, string[]>();
    for (const res of questionnaireResolutions) {
      if (!res.file) continue;
      const facts = factsFor(path.join(baseDir, res.file));
      hashes.set(facts.sha256, [...(hashes.get(facts.sha256) ?? []), res.file]);
    }
    screens.push({
      screen: QUESTIONNAIRE_SCREEN,
      dirType: ScreenDirType.NODE,
      resolutions: questionnaireResolutions,
      missingScopes: questionnaireResolutions.filter(r => !r.file).length,
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
          // EVERY reader of the including file, not its first. `Logon100.txt`
          // and `logon20.txt` both include the same art; crediting the first
          // reader of each gave the art two readers that both said "20-99",
          // and a shared node screen with sixty readers credited the include
          // to one node. Keyed so a file reached by two routes is not listed
          // twice for the same caller.
          const already = readers.get(targetRel) ?? [];
          const key = (r: ScreenReader) => `${r.screen}|${r.scope}|${r.id ?? ''}|${r.serves ?? ''}|${r.screenType ?? ''}`;
          const seen = new Set(already.map(key));
          const added: ScreenReader[] = [];
          for (const parent of existing) {
            const reader: ScreenReader = { ...parent, via: 'include' };
            if (seen.has(key(reader))) continue;
            seen.add(key(reader));
            added.push(reader);
          }
          if (added.length > 0) readers.set(targetRel, [...already, ...added]);
          if (!walked.has(targetRel)) next.push(targetRel);
        }
      }
    }
    frontier = next;
  }

  /*
   * THE ART A GENERATED SCREEN SPLICES IN.
   *
   * `Screens/AchieveTop.txt` is written by the board every fifteen minutes and
   * is therefore nobody's to draw - but it is drawn AROUND two files that are:
   * `AchieveTop.Header` above the leaderboards and `.Tailer` below them
   * (`achievements/bulletin.ts`), the same slot shape `Conf<n>/Conftop.Header`
   * has. Nothing in the catalogue names them, so the index called them read by
   * nothing and the studio hid them - which is why the sysop could not restyle
   * his own achievements bulletin.
   *
   * They are credited to the screen they belong to, keyed off the file the
   * board generates: `<X>.Header` beside a `<X>.txt` that some screen reads is
   * read by that screen, once removed.
   */
  for (const [rel, itsReaders] of [...readers.entries()]) {
    const dir = path.dirname(rel);
    const stem = path.basename(rel).replace(/\.[^.]+$/, '');
    for (const suffix of ['.Header', '.Tailer']) {
      const artRel = path.join(dir, `${stem}${suffix}`);
      if (readers.has(artRel)) continue;
      /*
       * Through the LISTING, not a raw `fs.existsSync`.
       *
       * This ran once per reader per suffix - 1,442 syscalls of one build,
       * the single biggest source in it (measured 2026-09-14) - and every one
       * asked the disk about a directory the snapshot had already listed.
       * `findCaseInsensitive` answers from that listing.
       *
       * It is also the more correct question. A raw existsSync is
       * case-SENSITIVE on the live board's Linux volume, so a sysop whose
       * file is `BBSTITLE.header` had it missed; an Amiga volume does not
       * distinguish them, and nothing else in this index does either.
       */
      if (!amigafs.findCaseInsensitive(path.join(baseDir, dir), `${stem}${suffix}`)) continue;
      readers.set(artRel, itsReaders.map(r => ({ ...r, via: 'include' as const })));
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
/**
 * The directories a SLOT's answer actually depends on.
 *
 * The key used to be every screen directory on the board, so one save
 * invalidated every slot: writing into one artist's theme threw away the
 * board's index and every other theme's with it, and each then rebuilt
 * separately - ~340ms apiece, synchronously, on the thread that also answers
 * telnet. That is what the sysop met as "it seems stuck" while saving.
 *
 * A theme's index reads the board and its OWN directory - the board's
 * fallback is what a theme not covering a screen falls through to. It never
 * reads another theme. And the BOARD's own walk never enters a theme
 * directory at all, which is why a theme's file shows as read by nothing in
 * the board index.
 *
 * So: the board slot watches the board, and a theme slot watches the board
 * plus itself. Neither watches a stranger.
 */
function keyDirectories(baseDir: string, themeSlug?: string): string[] {
  const all = listScreenDirectories(baseDir);
  const themes = readThemeRegistry(baseDir).themes;

  const mine = themeSlug
    ? themes.filter(t => t.slug === themeSlug).map(t => themeDirectory(baseDir, t))[0] ?? null
    : null;

  const otherThemeRoots = themes
    .map(theme => themeDirectory(baseDir, theme))
    .filter((root): root is string => !!root && root !== mine);

  return all.filter(dir => !otherThemeRoots.some(root => dir === root || dir.startsWith(`${root}${path.sep}`)));
}

export function getScreenIndex(baseDir: string, themeSlug?: string): ScreenIndex {
  const key = keyDirectories(baseDir, themeSlug)
    .map(d => {
      try { return `${d}:${fs.statSync(d).mtimeMs}`; } catch { return `${d}:gone`; }
    })
    .join('|');

  const slot = themeSlug ?? '';
  const cached = cachedByTheme.get(slot);
  if (cached && cached.key === key) return cached.index;
  /*
   * One snapshot of the board for the whole build: the directory listings
   * are validated once each rather than on every one of the thousands of
   * name lookups the level walk makes. It is also the more consistent
   * answer - a build sees the board as it was when it started, rather than
   * half a directory that was written while it ran.
   */
  const index = amigafs.withStableListings(() => buildScreenIndex(baseDir, themeSlug));
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
    // Same snapshot as the build it is checking: the question "does this theme
    // shadow the board" is only answerable against ONE state of the disk.
    amigafs.withStableListings(() =>
      announceLiveThemeRegressions(liveThemeRegressions(baseDir, index.builtAt)));
  } catch (error) {
    console.warn(`[Themes] live theme check skipped: ${(error as Error).message}`);
  }

  return index;
}

/** Called by every write route: the next read rebuilds. */
export function invalidateScreenIndex(): void {
  cachedByTheme.clear();
  /*
   * The FILE facts are kept, and that is the difference between a write the
   * sysop waits for and one they do not.
   *
   * This used to clear them too, for a real reason: `resolves` on an MCI
   * reference is a fact about a DIFFERENT file - `~CC_confrequest` resolves
   * when Commands/BBSCmd/CONFREQUEST.info exists - and installing that door
   * does not touch the screen that names it, so a settled answer would go on
   * telling the sysop the door was missing after they had installed it.
   *
   * `screenFileFacts` re-resolves the references on every cache hit, so that
   * is already true without throwing the bytes away. Clearing as well meant
   * uploading ONE screen re-read and re-scanned all 1,423 files on the board
   * before the manager could answer - 1.25 seconds, and the sysop reported it
   * as "very slow to update the dialog" (2026-09-14).
   *
   * What genuinely does need the bytes forgotten is a fact that changes
   * without the file changing: the sysop's own `art` flag. That is what
   * `invalidateScreenFacts` is for, and the flags route calls it.
   */
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

/**
 * Build the index once, at boot, while the board is idle.
 *
 * `buildScreenIndex` is SYNCHRONOUS and costs seconds on a real board - 70+
 * node directories, and the level walk asks for thousands of names. Left
 * lazy, that cost lands on whoever asks for it first, which is the admin's
 * Screens page; and because the build holds the event loop for its whole
 * duration, a caller logging in at that moment waits for it too. Nothing in
 * the build is per-caller, so paying it while no one is on costs nobody
 * anything.
 *
 * Two deliberate delays, both about not making it worse than the lazy build:
 *
 * - The first attempt waits, rather than running inside the `listen`
 *   callback, so the container answers `/health` before the loop goes away
 *   for the length of a build. The deploy's boot smoke curls exactly that.
 * - If a caller IS on the board, the warm defers instead of stalling them -
 *   it is an optimisation, and an optimisation that freezes a live session
 *   has lost its own argument. It simply tries again later.
 *
 * A failure is never fatal: an index that will not build is the next reader's
 * problem to report, and the board serves screens either way.
 */
export function warmScreenIndex(
  baseDir: string,
  opts: { isBusy?: () => boolean; delayMs?: number; retryMs?: number } = {},
): void {
  const delayMs = opts.delayMs ?? 15_000;
  const retryMs = opts.retryMs ?? 15_000;
  const isBusy = opts.isBusy ?? (() => false);

  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(fn, ms);
    // Never hold the process open for a warm-up.
    if (typeof (timer as any).unref === 'function') (timer as any).unref();
  };

  const attempt = () => {
    if (isBusy()) {
      later(attempt, retryMs);
      return;
    }
    const started = Date.now();
    try {
      getScreenIndex(baseDir);
      console.log(`[SCREENS] index warmed in ${Date.now() - started}ms - the first reader will not wait for it`);
    } catch (error) {
      console.warn(`[SCREENS] index warm skipped: ${(error as Error).message}`);
    }
  };

  later(attempt, delayMs);
}
