/**
 * Every artist-made screen the board serves opens with a screen wipe.
 *
 * The sysop's ask was "add the wipe command to all artist made screen files".
 * "Artist made" is not a judgement call here: the board already owns exactly
 * one art detector - `isAnsiArtScreen`, the screen-level policy the PETSCII
 * reflow uses to decide it must never smear an 80-column picture into 40
 * columns (utils/ansi-art-detect.util.ts: any absolute cursor motion, or
 * >= MIN_ART_ROWS art rows at more than ART_ROW_SHARE of the non-blank rows).
 * This test reuses it rather than growing a second classifier, so a screen
 * that counts as art for the C64 skip counts as art for the wipe too.
 *
 * WHAT IT PINS. Every art screen under the locations the loader searches
 * (Screens, Conf<n>, Conf<n>'s Screens, Node<n> and Bulletins) must open with a `~W?` code that `parseWipeMCI` accepts - so a NEW art
 * screen dropped in without one fails here, by path, instead of quietly
 * painting instantly while every other screen wipes.
 *
 * WHY THE EXEMPTIONS. A wipe is not free anywhere. `displayScreen` is the
 * ONLY place `~W` is understood (handlers/screen.handler.ts:1951 -
 * `parseWipeMCI` runs on the top-level screen and nothing else strips the
 * code), so a screen that reaches the caller by any other route would print
 * the three characters `~WX` at the user. Each exemption below names that
 * route, and `EXEMPTIONS` is itself asserted: an entry that stops matching
 * any art screen on disk fails, so the table cannot rot into a blanket
 * "skip everything" once the files it describes are gone.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SCREEN_DEBUG = '0';

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { isAnsiArtScreen } from '../../src/utils/ansi-art-detect.util';
import { parseWipeMCI } from '../../src/utils/screen-wipe.util';
import { readAmigaTextFileWithTransforms } from '../../src/utils/amiga-text-decode.util';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const BOARD_DIR = path.join(REPO_ROOT, 'board');

/** The wipe codes `parseWipeMCI` maps to a wipe (screen-wipe.util.ts:1001). */
const WIPE_CODE_RE = /^~W[MHVSCRBNTEX]\r?\n/i;

/**
 * Files the loader can serve as ANSI text. Extensions only: `.seq` is PETSCII
 * (never wipes - wipes are off for a PETSCII session, CONFIGURATION.md s5) and
 * `.rip` goes out raw (express.e:6776-6780), so neither can carry a code.
 * `.gr`/`.bak`/`.old`/`.seq_` are screen-type and backup siblings the loader's
 * variant builders never name.
 */
const SERVABLE_RE = /\.(txt|flt|logoff|reference-board)$/i;
const SIBLING_RE = /\.(txt|TXT)[._][^/]*$|\.(bak|gr|old|back|stray-deleted)$/;

/** Directories with no screen files in them, walked past for speed. */
const SKIP_DIR_RE = /^(MsgBase|Messages|Upload|Files|Hold|SysopStats|node_modules)$/i;

interface Exemption {
  match: RegExp;
  reason: string;
}

/**
 * Art screens that must NOT carry a wipe code, and the route that makes a
 * code wrong there. Ordered by route, not by file.
 */
const EXEMPTIONS: Exemption[] = [
  {
    // `~SS_`/`~SR_` targets are loaded by parseMciCodes and re-parsed as MCI
    // (screen.handler.ts:958-975). That path never calls parseWipeMCI, so a
    // `~WX` in an include is printed to the caller as three characters.
    match: /^(Screens|Conf\d+\/Screens)\/(flt|uprough|_uprough|no_upload|bbb|reference-board|quicknew\d*)\.txt$/,
    reason: '~SS_ include target - the include path never strips ~W',
  },
  {
    // `~5SR_WORK:bbs/Screens/flt/flt` in the nodes' logon10.txt picks one of
    // these at random - an include again, and every one of them is a
    // cursor-positioned ANSImation besides.
    match: /^Screens\/flt\/[^/]+$/,
    reason: '~SR_ numbered include pool - the include path never strips ~W',
  },
  {
    // No `~SR_` on the board resolves here (the only reference-board directive is
    // `~SS_BBS:screens/reference-board.txt`, a different file). Adding a code would
    // arm nothing today and would be an include the day something points at it.
    match: /^Screens\/reference-board\/[^/]+$/,
    reason: 'orphaned numbered art pool - no screen name or ~SR_ resolves to it',
  },
  {
    // A logoff screen is the last thing on the wire before the socket closes;
    // an animation there races the disconnect, and CONFIGURATION.md's worked
    // example routes it through `~3SR_` anyway (an include, see above).
    match: /logoff/i,
    reason: 'logoff screen - shown as the session ends, and reached by ~3SR_',
  },
  {
    // Bulletins/ holds bulletin DATA, not screens: no screen name resolves
    // into it (screen.handler.ts:1108 excludes it from the BULL search on
    // purpose), it is reached only through `~SS_BBS:bulletins/...`, and
    // MultiTop / SAmiLog / NTR-LASTCALLERS rewrite these files wholesale
    // from batch0..batch6 - a code added here is deleted on the next login.
    match: /^Bulletins\//,
    reason: 'bulletin data - include-only, and rewritten by the batch doors',
  },
  {
    match: /^Conf\d+\/Bulletins\//,
    reason: 'conference bulletin data - written by a door, not served by name',
  },
  {
    // Screens/BBSTITLE.txt and its per-node copies (Node<n>/BBSTITLE.txt, the
    // file express.e reads first) open `~SMO1|`. screen.handler.ts:2419 runs
    // the slow-motion frame emitter only `if (slowmoSpeed !== 0 && !hasWipeAnimation)`,
    // so adding a wipe would silently switch off the reveal the screen already has.
    match: /^(Screens|Node\d+)\/BBSTITLE\.txt$/,
    reason: 'already carries ~SMO1| - a wipe would switch its slow-motion reveal off',
  },
  {
    // No screen name resolves to these; they are copies left in the tree.
    match: /^Conf\d+\/(Menu copy|test)\.txt$/,
    reason: 'stray copy - no screen name resolves to it',
  },
];

/**
 * Where a screen can live: `Screens/`, `Bulletins/`, any `ConfN`/`NodeN`, and
 * every theme the board offers (`Themes/<name>/`; a theme renamed
 * `*.removed-<date>` is retired and not served).
 *
 * A door showing one of these files (the XIM JH_SF path) does not print the
 * code - parseMciCodes drops it (jh-sf-sync-fastpath.test.ts) - so screens a
 * door can show are held to the rule too ("many screens are missing the
 * random wipe mci ... upload has none", sysop 2026-09-29).
 */
const SCREEN_ROOT_RE = /^(Screens|Bulletins|Conf\d+|Node\d+|Themes\/(?![^/]*\.removed-)[^/]+)\//;

/**
 * Every ANSI text screen the board SHIPS, repo-relative, sorted.
 *
 * Asked of git, not of the disk. This checkout is the live board: doors write
 * into `NodeN/`, a test run leaves a directory behind, the sysop's admin
 * uploads land next to the tracked art - and every one of those would enter
 * the set and be held to a rule the artist never saw. What the board ships is
 * what is committed, so `git ls-files` is the enumeration (RULES.md, "The
 * board is not a fixture"). A tracked path that is not on disk right now is
 * dropped: `git ls-files` still lists a file deleted in the working tree.
 */
function servableScreens(): string[] {
  // Run from board/ so git lists board-relative paths (Screens/..., Node1/...).
  const listed = execFileSync('git', ['ls-files', '-z'], {
    cwd: BOARD_DIR,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString('utf8')
    .split('\0')
    .filter((rel) => rel.length > 0);
  return listed
    .filter((rel) => SCREEN_ROOT_RE.test(rel))
    .filter((rel) => !rel.split('/').some((seg) => SKIP_DIR_RE.test(seg)))
    .filter((rel) => SERVABLE_RE.test(rel) && !SIBLING_RE.test(rel))
    .filter((rel) => fs.existsSync(path.join(BOARD_DIR, rel)))
    .sort();
}

interface Screen {
  rel: string;
  text: string;
  art: boolean;
  exemption: Exemption | undefined;
}

let screens: Screen[];

beforeAll(() => {
  screens = servableScreens().map((rel) => {
    const text = readAmigaTextFileWithTransforms(path.join(BOARD_DIR, rel)).text;
    return {
      rel,
      text,
      art: isAnsiArtScreen(text),
      exemption: EXEMPTIONS.find((e) => e.match.test(rel)),
    };
  });
});

describe('the board still has art screens to check', () => {
  it('the detector finds art in the screen locations', () => {
    // Guards every assertion below: an enumeration that stops finding files,
    // or a detector that stops calling anything art, would otherwise make
    // this whole file pass by describing nothing.
    const art = screens.filter((s) => s.art);
    expect(`screens=${screens.length > 100} art=${art.length > 100}`).toBe('screens=true art=true');
  });
});

describe('every artist-made screen the board serves opens with a wipe', () => {
  it('each art screen carries a ~W code on its first line', () => {
    const missing = screens
      .filter((s) => s.art && !s.exemption && !WIPE_CODE_RE.test(s.text))
      .map((s) => s.rel);
    // Named by path: a new artist screen without a code fails here saying which.
    expect(missing).toEqual([]);
  });

  it('each of those codes is one parseWipeMCI accepts', () => {
    const bad = screens
      .filter((s) => s.art && !s.exemption)
      .filter((s) => parseWipeMCI(s.text).wipeType === null)
      .map((s) => s.rel);
    expect(bad).toEqual([]);
  });

  it('the wipe line is the only thing the code costs the screen', () => {
    // express.e:6800-6806 - MCI substitution is on only while the FIRST line
    // starts with `~`, and screen.handler.ts:1974 hands `parseWipeMCI`'s
    // output to that check. So the code must occupy its own line and take
    // nothing else with it: everything from the second line on, including the
    // line the MCI gate now reads, has to survive byte for byte.
    const mangled = screens
      .filter((s) => s.art && !s.exemption)
      .filter((s) => {
        const code = (s.text.match(WIPE_CODE_RE) || [''])[0];
        return parseWipeMCI(s.text).content !== s.text.slice(code.length);
      })
      .map((s) => s.rel);
    expect(mangled).toEqual([]);
  });

  it('no screen smuggles a wipe code into its body', () => {
    // `parseWipeMCI`'s regex is not anchored (screen-wipe.util.ts:1001): a
    // `~WB` written as art halfway down a file would arm a wipe the author
    // never asked for AND be cut out of the text. Every wipe this board
    // serves is the first line of its file - art or not, exempt or not.
    const stray = screens
      .filter((s) => parseWipeMCI(s.text).wipeType !== null && !WIPE_CODE_RE.test(s.text))
      .map((s) => s.rel);
    expect(stray).toEqual([]);
  });
});

describe('the exemption table describes screens that are still there', () => {
  it('every exemption matches at least one art screen on disk', () => {
    const dead = EXEMPTIONS.filter(
      (e) => !screens.some((s) => s.art && e.match.test(s.rel))
    ).map((e) => e.reason);
    expect(dead).toEqual([]);
  });
});
