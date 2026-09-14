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
import { SCREEN_DIR_MAP, SCREEN_EXTENSIONS, ScreenDirType, isScreenFile } from './screen-tables';
import { THEME_FILES_DIR, themeDirectory, type ThemeEntry } from './theme-registry';

export type ThemeRule =
  | 'not-a-screen-file'
  | 'file-problem'
  | 'unresolved-reference'
  | 'scope-specific-reference'
  | 'shadows-security-variant'
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
export function fileFindings(baseDir: string, themeRoot: string, rel: string): ThemeFinding[] {
  const findings: ThemeFinding[] = [];
  const name = path.basename(rel);

  // Rule 1 - a file that is not a screen file. A .png in a theme directory is
  // a mistake, not art the board can serve.
  if (!isScreenFile(name)) {
    findings.push({
      rule: 'not-a-screen-file',
      severity: 'blocking',
      file: rel,
      message: `${rel} is not a screen file - the board serves ${SCREEN_EXTENSIONS.join(' ')} and nothing else`,
    });
    return findings;
  }

  let facts;
  try {
    facts = screenFileFacts(baseDir, path.join(themeRoot, rel));
  } catch {
    return [{ rule: 'file-problem', severity: 'blocking', file: rel, message: `${rel} could not be read` }];
  }

  // Rule 2 - a file with a problem. An empty screen is a blank screen for a
  // caller; a screen with its ESC bytes eaten prints its own colour codes.
  for (const problem of facts.problems) {
    findings.push({
      rule: 'file-problem',
      severity: 'blocking',
      file: rel,
      message: problem === 'empty'
        ? `${rel} is empty - a caller wearing this theme would be shown a blank screen`
        : `${rel} holds colour codes with the escape byte missing, so a caller sees the codes printed instead of the colour. Repair it in the screen editor.`,
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

    for (const resolution of entry.resolutions) {
      const scope = scopeDirectory(entry.dirType, resolution);
      if (!scope) continue;

      /*
       * amigafs remembers the listing until the directory changes. This read
       * the directory itself, once per screen per resolution - 920 readdir
       * calls of the same theme directories per index build on this board
       * (measured, 2026-09-14) - and a second answer to "what files are here"
       * is a second thing to keep in step with the disk.
       */
      const themeNames = amigafs.listFiles(path.join(root, scope));
      const themeLevels = new Map<number | null, string>();
      for (const name of themeNames) {
        const level = levelOf(stem, name);
        if (level === undefined) continue;
        themeLevels.set(level, name);
      }
      if (themeLevels.size === 0) continue;
      themeHasScreen = true;

      const base = themeLevels.get(null);
      if (!base) continue;

      const missing = resolution.variants
        .map(name => ({ name, level: levelOf(stem, name) }))
        .filter((v): v is { name: string; level: number } => typeof v.level === 'number')
        .filter(v => !themeLevels.has(v.level));

      for (const shadowed of missing) {
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
