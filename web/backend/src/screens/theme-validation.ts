/**
 * Can this theme be selected without breaking a caller?
 *
 * SP6's validator. A partial theme is allowed by design - decision 4 of
 * `docs/superpowers/specs/2026-09-06-screen-themes-design.md` - so validation
 * is NOT "is every screen present". Every screen a theme does not carry falls
 * through to the board, and that is the feature. What validation asks instead
 * is whether the files the theme DOES carry can be served.
 *
 * Five rules block publication and three are reported and never block. The
 * split is the spec's, and the reason for it is the same each time: a blocking
 * rule names a file a caller would be shown that is not art, or art the board
 * would be unable to draw, or art that silently removes content the board has.
 * An advisory rule names something an artist might have meant.
 *
 * It is a pure function over the index and the registry - no writes, no
 * caching of its own - so it can be run on every save, shown in the admin, and
 * required to pass before a sysop may set STATUS=live, without three copies of
 * the answer.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';

import {
  getScreenIndex,
  screenFileFacts,
  type ScopeResolution,
} from './screen-index.service';
import { getScreenFileName } from './screen-resolution';
import { SCREEN_DIR_MAP, SCREEN_EXTENSIONS, ScreenDirType, THEME_WIDE_DIR, isScreenFile, isThemeWideScreen } from './screen-tables';
import { screenIsProgram, screenProgramSignature } from './screen-blankness';
import { THEME_FILES_DIR, themeDirectory, type ThemeEntry } from './theme-registry';

export type ThemeRule =
  | 'not-a-screen-file'
  | 'file-problem'
  | 'unresolved-reference'
  | 'scope-specific-reference'
  | 'shadows-security-variant'
  | 'runs-different-codes'
  | 'width-without-evidence'
  | 'art-wider-than-the-caller'
  | 'coverage';

export interface ThemeFinding {
  rule: ThemeRule;
  severity: 'blocking' | 'advisory';
  /** The file it is about, relative to the theme's own directory. */
  file?: string;
  /** One sentence a sysop can act on, naming both halves of the problem. */
  message: string;
}

export interface ThemeValidation {
  slug: string;
  blocking: ThemeFinding[];
  advisory: ThemeFinding[];
  /** Whether a sysop may set this theme live. */
  publishable: boolean;
  /** "37 of the board's 44 screens" - a number, never a gate. */
  coverage: { provided: number; total: number };
}

/** The artist's own notes, at the theme root. Not read by the board, so not judged. */
const NOTES_FILE = 'theme.txt';

/** Every file under a theme's directory, relative to it, in a stable order. */
function themeFiles(root: string): string[] {
  const found: string[] = [];

  const walk = (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue;
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) found.push(rel);
    }
  };

  walk(root, '');
  return found;
}

/** Where a theme keeps this scope's screens - the tree is keyed on SCOPE, not on the board's names. */
function scopeDirectory(dirType: ScreenDirType, resolution: ScopeResolution): string | null {
  if (dirType === ScreenDirType.NODE) return 'Node';
  if (dirType === ScreenDirType.GLOBAL) return 'Board';
  if (dirType === ScreenDirType.CONF && resolution.id !== null) return path.join('Conf', String(resolution.id));
  return null;
}

/** The stem a security variant shares with its base screen: LOGON20.TXT -> logon. */
function stemOf(screen: string): string {
  return getScreenFileName(screen).replace(/\.[^.]*$/, '').toLowerCase();
}

/**
 * The security level a variant name declares, or null for the base name.
 *
 * `LOGON20.TXT` is level 20, `LOGON.TXT` is the base, and `Logon24hrs.txt` is
 * neither - the digits have to be the WHOLE of what follows the stem, or the
 * board's own 24-hour logon would read as a level-24 variant of LOGON.
 */
function levelOf(stem: string, fileName: string): number | null | undefined {
  const lower = fileName.toLowerCase();
  if (!lower.startsWith(stem)) return undefined;
  const rest = fileName.slice(stem.length);
  const match = /^(\d*)(\.[^.]*(?:\.[^.]*)?)$/.exec(rest);
  if (!match) return undefined;
  if (!isScreenFile(fileName)) return undefined;
  return match[1] === '' ? null : parseInt(match[1], 10);
}

/**
 * Everything that can be said about ONE file without looking at the board.
 *
 * Rules 1-4 and advisory 7. Rule 5 is deliberately absent: shadowing is a fact
 * about the theme and the board together, so it belongs to the whole-theme
 * walk and to the publish gate, not to a save.
 */
/**
 * A name the admin itself writes when it replaces a file: `.backup`,
 * `.removed-<stamp>`, `.<topic>-backup-<stamp>`. Kept deliberately loose - a
 * sysop's own `logon20.txt.bull6-backup-20260916` is the same thing.
 */
function looksLikeAnOldCopy(name: string): boolean {
  return /\.(bak|old|orig|stale|save|prev)\b|backup|\.removed-\d/i.test(name);
}

/** What each problem means to a caller, in the sysop's terms. */
const PROBLEM_MESSAGE: Record<string, string> = {
  empty: 'is empty - a caller wearing this theme would be shown a blank screen',
  'colour-codes-without-escape':
    'holds colour codes with the escape byte missing, so a caller sees the codes printed instead of the colour. Repair it in the screen editor.',
  'petscii-graphics-bank':
    'is drawn in the C64 graphics bank; this board shows the lowercase one. It is served exactly as drawn - redraw it in the editor to follow the rule.',
  'petscii-non-black-background':
    'asks the C64 for a background colour; this board runs on a black screen. It is served exactly as drawn.',
};

/** Which problems stop a theme going live. The C64 rules report, they do not refuse. */
const PROBLEM_SEVERITY: Record<string, ThemeFinding['severity']> = {
  empty: 'blocking',
  'colour-codes-without-escape': 'blocking',
  'petscii-graphics-bank': 'advisory',
  'petscii-non-black-background': 'advisory',
};

export function fileFindings(baseDir: string, themeRoot: string, rel: string): ThemeFinding[] {
  const findings: ThemeFinding[] = [];
  const name = path.basename(rel);

  /*
   * Rule 1 - a file the board will never serve. ADVISORY, not blocking.
   *
   * It used to stop publication, and on a theme an artist has actually worked
   * in that is almost all of it: `bull20.txt.backup`, `BBSTITLE.txt.blink-backup-20260915`,
   * `Logon100.txt.removed-20260914` - copies the ADMIN ITSELF wrote beside the
   * file it was replacing. Publishing h7 reported 38 problems, 28 of them
   * backups (sysop, 2026-09-18), and the gate is supposed to answer one
   * question: would a caller wearing this theme be served broken art? A file
   * the loader never opens cannot break anything for a caller - it is clutter,
   * and clutter is worth saying, not worth refusing over.
   */
  if (!isScreenFile(name)) {
    findings.push({
      rule: 'not-a-screen-file',
      severity: 'advisory',
      file: rel,
      message: looksLikeAnOldCopy(name)
        ? `${rel} is an old copy kept beside the real file. The board never serves it; delete it when you are done with it.`
        : `${rel} is not a screen file - the board serves ${SCREEN_EXTENSIONS.join(' ')} and nothing else`,
    });
    return findings;
  }

  let facts;
  try {
    facts = screenFileFacts(baseDir, path.join(themeRoot, rel));
  } catch {
    return [{ rule: 'file-problem', severity: 'blocking', file: rel, message: `${rel} could not be read` }];
  }

  /*
   * Rule 2 - a file with a problem, each one worded as itself.
   *
   * This used to be a ternary: `empty`, or ELSE the missing-escape sentence.
   * The C64 rules added two more problem kinds on 2026-09-18, so a PETSCII
   * screen drawn in the graphics bank was reported to the sysop as "holds
   * colour codes with the escape byte missing" - about a `.seq`, which has no
   * escape codes at all - and it blocked his theme.
   *
   * The two C64 rules are ADVISORY here on purpose: a screen that breaks one
   * is served exactly as its artist drew it (`petscii-board-rules.ts`), so it
   * is a thing to know about a theme, not a reason to refuse it.
   */
  for (const problem of facts.problems) {
    findings.push({
      rule: 'file-problem',
      severity: PROBLEM_SEVERITY[problem] ?? 'blocking',
      file: rel,
      message: `${rel} ${PROBLEM_MESSAGE[problem] ?? 'has a problem the board could not describe'}`,
    });
  }

  for (const ref of facts.mci) {
    // Rule 3 - an unresolved reference. A ~CC_ naming a door this board does
    // not have is a menu item that fails only when a caller presses the key,
    // which is exactly the case for an artist who drew their menu on a board
    // that had that door installed.
    if (!ref.resolves && ref.code !== 'CL') {
      findings.push({
        rule: 'unresolved-reference',
        severity: 'blocking',
        file: rel,
        message: ref.code === 'CC'
          ? `${rel} runs ~CC_${ref.target}, and this board has no such command`
          : `${rel} includes ~${ref.code}_${ref.target}, and this board has no such file`,
      });
    }

    // Rule 4 - a scope-specific reference. A theme is board-wide; a file that
    // includes ~SS_BBS:Node1/x.txt gives every node node 1's content.
    if (ref.scopeSpecific) {
      findings.push({
        rule: 'scope-specific-reference',
        severity: 'blocking',
        file: rel,
        message: `${rel} names ${ref.target}, which is one node or one conference. A theme is worn on every node, so every caller would be shown that one.`,
      });
    }
  }

  // Advisory 7 - art declaring a width wider than the screen it is served on.
  if (facts.sauce?.width && facts.sauce.width > 80) {
    findings.push({
      rule: 'art-wider-than-the-caller',
      severity: 'advisory',
      file: rel,
      message: `${rel} declares ${facts.sauce.width} columns in its SAUCE record. The board serves 80, and a C64 caller 40, so it will wrap.`,
    });
  }

  return findings;
}

/**
 * Validate one theme.
 *
 * The `default` theme has no directory - it IS the board's own screens - so it
 * carries no files to judge and is always publishable.
 */
export function validateTheme(baseDir: string, theme: ThemeEntry): ThemeValidation {
  const root = themeDirectory(baseDir, theme);
  const blocking: ThemeFinding[] = [];
  const advisory: ThemeFinding[] = [];
  const total = Object.keys(SCREEN_DIR_MAP).length;

  if (!root || !fs.existsSync(root)) {
    return { slug: theme.slug, blocking, advisory, publishable: true, coverage: { provided: 0, total } };
  }

  const files = themeFiles(root);

  /* ------------------------------------------------------------------ *
   * Rules 1-4 and 7: one pass over the files the theme actually carries.
   * ------------------------------------------------------------------ */
  let hasNarrowArt = false;

  for (const rel of files) {
    if (rel.toLowerCase() === NOTES_FILE) continue;

    const lower = path.basename(rel).toLowerCase();
    if (lower.endsWith('.seq') || lower.includes('_c64')) hasNarrowArt = true;

    for (const finding of fileFindings(baseDir, root, rel)) {
      (finding.severity === 'blocking' ? blocking : advisory).push(finding);
    }
  }

  /* ------------------------------------------------------------------ *
   * Rule 5 - a base file that shadows the board's security variants.
   *
   * The security walk completes INSIDE the theme directory before the board's
   * is tried, so a theme with LOGON.txt and no Logon100.txt serves its base
   * file to level-100 callers and the board's sysop-only logon is never shown.
   * That is Risk 1 of the spec, turned into a blocked activation.
   * ------------------------------------------------------------------ */
  let provided = 0;

  for (const entry of getScreenIndex(baseDir).screens) {
    const stem = stemOf(entry.screen);
    let themeHasScreen = false;

    /*
     * ONE PROBLEM IS ONE FINDING, however many scopes it resolves through.
     *
     * `entry.resolutions` carries one resolution per NODE directory, and this
     * board has seventy-one of them - while the theme has a single `Node/`
     * scope that every one of those resolves into. So a theme with one
     * `Node/LOGON.seq` shadowing the board's `logon10` and `logon20` reported
     * the same problems seventy-one times each, and the admin's Themes page
     * told the sysop the board default had "219 issues to fix" when it had
     * nine (2026-09-24). A number nobody can act on is worse than no number:
     * it is why the page was ignored.
     *
     * Keyed on what the finding is ABOUT - the theme file and the board file
     * it would hide - rather than on the message, so a reworded message
     * cannot quietly split one problem back into seventy-one.
     */
    const reported = new Set<string>();

    for (const resolution of entry.resolutions) {
      const ownScope = scopeDirectory(entry.dirType, resolution);
      if (!ownScope) continue;

      /*
       * amigafs remembers the listing until the directory changes. This read
       * the directory itself, once per screen per resolution - 920 readdir
       * calls of the same theme directories per index build on this board
       * (measured, 2026-09-14) - and a second answer to "what files are here"
       * is a second thing to keep in step with the disk.
       */
      const levelsIn = (scopeDir: string): Map<number | null, string> => {
        const levels = new Map<number | null, string>();
        for (const name of amigafs.listFiles(path.join(root, scopeDir))) {
          const level = levelOf(stem, name);
          if (level === undefined) continue;
          levels.set(level, name);
        }
        return levels;
      };

      /*
       * THE DIRECTORY THE LOADER ANSWERS FROM, in its order: the conference's
       * own theme directory, then - for a screen the theme draws once for
       * every conference - the theme's every-conference directory
       * (screen-resolution.ts, THEME_WIDE_SCREENS).
       */
      let scope = ownScope;
      let themeLevels = levelsIn(ownScope);
      const wideScope = entry.dirType === ScreenDirType.CONF && isThemeWideScreen(entry.screen);
      if (themeLevels.size === 0 && wideScope) {
        scope = THEME_WIDE_DIR;
        themeLevels = levelsIn(THEME_WIDE_DIR);
      }
      if (themeLevels.size === 0) continue;
      themeHasScreen = true;
      /** The theme's ONE main menu answering this conference. */
      const servesEveryLevel = wideScope && scope === THEME_WIDE_DIR;

      /*
       * Rule 9 - THE LOADER WILL SKIP THIS SCREEN, and nothing said so.
       *
       * A theme owns art, not behaviour: `loadScreenFile` compares the codes
       * in the theme's copy with the codes in the board's, and where they
       * differ it serves the BOARD's file and writes a line to a debug log
       * nobody reads. So `h7` published clean, was worn, and four of its
       * screens went on showing the board's art - "i switched to h7's theme
       * on the live bbs, most screens show old ones" (sysop, 2026-09-18).
       *
       * Measured on that theme: `Conf<n>/bull20.txt` includes bull9 where the
       * board runs `~CC_ctop` and `~XISUBSCAN`; `logon20.txt` has lost the
       * board's `~5SR_` flash pool; `awaitscreen.txt` has lost `~CC_TELNET-FRONT`;
       * `Logoff.txt` picks from 2 logoff screens where the board picks from 3.
       *
       * Advisory, and now genuinely only worth knowing: since 2026-09-18 the
       * loader draws the THEME's art with the BOARD's codes around it rather
       * than refusing the file, so nothing is lost - but an artist who wrote
       * `~XISUBSCAN` into his bulletin should be told it will not run.
       *
       * The comparison is `screenProgramSignature`, the function the LOADER
       * uses. Two ways of asking would drift, and the drift would be a gate
       * that promises art the board then refuses.
       */
      // A scope that resolves to nothing has no board copy to differ from.
      const boardRel = resolution.file;
      for (const [, name] of boardRel ? themeLevels : []) {
        const boardFile = path.join(baseDir, boardRel as string);
        const themeFile = path.join(root, scope, name);
        let boardBytes: Buffer;
        let themeBytes: Buffer;
        try {
          boardBytes = fs.readFileSync(boardFile);
          themeBytes = fs.readFileSync(themeFile);
        } catch { continue; }

        if (!screenIsProgram(boardBytes)) continue;
        if (screenProgramSignature(boardBytes) === screenProgramSignature(themeBytes)) continue;

        const codesKey = `codes|${path.join(scope, name)}|${boardRel}`;
        if (reported.has(codesKey)) continue;
        reported.add(codesKey);
        advisory.push({
          rule: 'runs-different-codes',
          severity: 'advisory',
          file: path.join(scope, name),
          message: `${path.join(scope, name)} runs different codes from the board's ${boardRel}. Your ART is drawn; the board's codes run around it, and this file's own are ignored - a theme owns art rather than behaviour.`,
        });
      }

      const base = themeLevels.get(null);
      if (!base) continue;

      /*
       * A VARIANT THAT IS A PROGRAM CANNOT BE LOST.
       *
       * This rule was written when the theme's base file REPLACED the board's
       * security variant. It does not any more, and `loadScreenFile` was
       * driven to check rather than reasoned about (2026-09-24). Where the
       * board's variant is a PROGRAM the loader keeps it either way:
       *
       *   a TEXT theme file is spliced - the board's codes run around the
       *   theme's art, and a level-20 caller receives `~CC_gl ~SP` followed
       *   by that art;
       *   a `.seq` or `.rip` theme file is not spliced at all, and the
       *   board's own file is served instead (screen.handler.ts:1880,
       *   "Text screens only").
       *
       * So a program variant costs the caller nothing and is not a finding.
       * An ART variant is: this board's `MENU250.TXT` is 3122 bytes of
       * drawing that lists the sysop's own commands - ACCESS, CALLERSLOG,
       * EDITING, FILEFLAG - and a theme's plain `Menu.txt` really does take
       * that list away from a level-250 caller.
       *
       * Three of the board default's nine findings were program variants:
       * `logon10.txt` is one `~SS_`, `logon20.txt` three codes and no pixels.
       */
      const boardDir = boardRel ? path.dirname(path.join(baseDir, boardRel)) : null;
      const missing = resolution.variants
        .map(name => ({ name, level: levelOf(stem, name) }))
        .filter((v): v is { name: string; level: number } => typeof v.level === 'number')
        .filter(v => !themeLevels.has(v.level))
        .filter(v => {
          if (!boardDir) return true;
          try {
            return !screenIsProgram(fs.readFileSync(path.join(boardDir, v.name)));
          } catch {
            return true;   // unreadable: report it rather than hide it
          }
        });

      for (const shadowed of missing) {
        const shadowKey = `shadow|${path.join(scope, base)}|${shadowed.name}`;
        if (reported.has(shadowKey)) continue;
        reported.add(shadowKey);
        /*
         * THE THEME'S ONE MAIN MENU IS SHOWN TO EVERY LEVEL ON PURPOSE.
         *
         * The sysop's ruling (2026-10-02): one main menu per theme, served to
         * every conference and every level. Covering the board's MENU250 is
         * then what the theme is FOR, not a slip - so it is said, and it does
         * not hold the theme back. An artist who wants the sysop's own list
         * kept draws it beside the menu.
         */
        if (servesEveryLevel) {
          advisory.push({
            rule: 'shadows-security-variant',
            severity: 'advisory',
            file: path.join(scope, base),
            message: `${theme.title}'s ${path.join(scope, base)} is the main menu for every conference and every level, so level-${shadowed.level} callers see it instead of the board's ${shadowed.name}. Draw ${path.join(scope, shadowed.name)} in the theme if they should keep a menu of their own.`,
          });
          continue;
        }
        blocking.push({
          rule: 'shadows-security-variant',
          severity: 'blocking',
          file: path.join(scope, base),
          message: `${theme.title}'s ${path.join(scope, base)} would be shown to level-${shadowed.level} callers instead of the board's ${shadowed.name}. Draw ${path.join(scope, shadowed.name)} in the theme, or delete the theme's ${base}.`,
        });
      }
    }

    if (themeHasScreen) provided++;
  }

  /* ------------------------------------------------------------------ *
   * Advisory 6 - a declared width with no evidence.
   * ------------------------------------------------------------------ */
  if (theme.widths.includes(40) && !hasNarrowArt) {
    advisory.push({
      rule: 'width-without-evidence',
      severity: 'advisory',
      message: `${theme.title} says it supports 40 columns, but it carries no .seq and no _C64 file. A C64 caller would see the board's own art everywhere.`,
    });
  }

  /* ------------------------------------------------------------------ *
   * Advisory 8 - coverage. A number, not a gate.
   * ------------------------------------------------------------------ */
  advisory.push({
    rule: 'coverage',
    severity: 'advisory',
    message: `${provided} of the board's ${total} screens; ${total - provided} fall through to the board's own art.`,
  });

  return {
    slug: theme.slug,
    blocking,
    advisory,
    publishable: blocking.length === 0,
    coverage: { provided, total },
  };
}

/**
 * The findings for ONE file inside a theme, for the moment it is saved.
 *
 * The screen editor writes a file and wants to say what is wrong with THAT
 * file, without walking the theme or building the index. Only the per-file
 * rules can be answered here - shadowing is a fact about the theme and the
 * board together, so it belongs to `validateTheme` and to the publish gate.
 */
export function validateThemeFile(baseDir: string, theme: ThemeEntry, relativeToTheme: string): ThemeFinding[] {
  const root = themeDirectory(baseDir, theme);
  if (!root) return [];

  const rel = relativeToTheme.split(path.sep).join('/');
  if (rel.toLowerCase() === NOTES_FILE) return [];
  if (!fs.existsSync(path.join(root, rel))) return [];

  return fileFindings(baseDir, root, rel);
}

/** Where a board-relative path sits inside a theme, or null when it is not in one. */
export function themeOfPath(baseDir: string, relativePath: string, themes: ThemeEntry[]): { theme: ThemeEntry; inTheme: string } | null {
  const target = path.resolve(baseDir, relativePath);
  for (const theme of themes) {
    const root = themeDirectory(baseDir, theme);
    if (!root) continue;
    const rel = path.relative(path.resolve(root), target);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    return { theme, inTheme: rel.split(path.sep).join('/') };
  }
  return null;
}

/** Named so a caller can say where a theme's path-shaped art goes. */
export const THEME_MIRROR_DIR = THEME_FILES_DIR;
