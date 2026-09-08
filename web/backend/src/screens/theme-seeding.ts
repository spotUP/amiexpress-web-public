/**
 * A new theme starts as a copy of the board's own screens.
 *
 * Creating one used to make three empty directories, and the copy route's own
 * comment said what that cost: "without this a new theme is a set of empty
 * directories with nothing to open". An artist had to copy every screen in by
 * hand before there was anything to redraw. The sysop asked for the obvious
 * thing: "all new themes should be a copy of the default theme" - `default`
 * being the board itself, which is the ABSENCE of a theme, so the copy comes
 * from what the board resolves today.
 *
 * THE VARIANTS COME TOO, and that is not a nicety. The security walk finishes
 * inside the theme directory before the board's is tried, so a theme holding
 * `BULL.TXT` and not `BULL255.TXT` shadows the board's sysop bulletin - which
 * `theme-validation`'s rule 5 refuses to publish. Seeding the base file alone
 * would hand every new theme a blocking finding on the day it was made.
 *
 * What is NOT copied: files the board writes for itself and leftovers
 * (`generated`), because a theme is art, and an artist opening a `.bak` is an
 * artist editing something the next write overwrites.
 */
import * as fs from 'fs';
import * as path from 'path';

import { getScreenIndex } from './screen-index.service';
import { themeTargetFor, themeTargetForBoardFile } from './theme-target-path';
import { variantSetFor, type ScreenScope } from './theme-variant-set';
import { themeDirectory } from './theme-registry';
import type { ThemeEntry } from './theme-registry';

/** What one "redraw this" did: the files that landed, and the artist's own. */
export interface ThemeCopyResult {
  copied: Array<{ from: string; to: string; target: string }>;
  /** Already the artist's - never overwritten. */
  kept: Array<{ target: string }>;
}

export interface ThemeSeedResult {
  /** Files written into the theme. */
  copied: number;
  /** Distinct screens the theme now carries. */
  screens: number;
  /**
   * A board file whose theme path was already taken by a different one.
   *
   * Every node's copy of a screen collapses to one `Node/<file>`, so 41 nodes
   * carrying identical art produce one write and forty skips. A skip whose
   * bytes DIFFER from the file that won is worth a sysop's attention, and is
   * the only kind reported.
   */
  conflicts: Array<{ path: string; keptFromPath: string; target: string }>;
}

/**
 * Copy the board's screens into a theme.
 *
 * Never overwrites: a file the theme already has is the artist's, and this
 * runs at creation when there are none. Returns what it did rather than
 * throwing on a single unreadable file - one bad screen must not cost the
 * artist the other thirty.
 */
export function seedThemeFromBoard(bbsRoot: string, theme: ThemeEntry): ThemeSeedResult {
  const result: ThemeSeedResult = { copied: 0, screens: 0, conflicts: [] };
  const themeRoot = themeDirectory(bbsRoot, theme);
  if (!themeRoot) return result;

  const index = getScreenIndex(bbsRoot);
  /** target -> the board path that won it, so a conflict can name both sides. */
  const written = new Map<string, string>();
  const screensSeeded = new Set<string>();

  for (const entry of index.screens) {
    for (const resolution of entry.resolutions) {
      if (!resolution.file) continue;
      const dir = path.dirname(resolution.file);

      // The resolved file AND every variant beside it - one rule, shared with
      // the copy route an artist presses "redraw this" on.
      const names = variantSetFor(index, resolution.file).map(rel => path.basename(rel));

      for (const name of names) {
        const relative = path.join(dir, name);
        const facts = index.files[relative];
        // A leftover or a file the board rewrites for itself is not art.
        if (facts?.generated) continue;

        // The scope the INDEX resolved this screen at, not a guess from the
        // directory name: this board's nodes share `Screens/Node/`, which the
        // name rule reads as ordinary files and mirrors under `Files/`,
        // writing every node screen twice.
        const target = themeTargetFor(relative, scopeOf(resolution));
        if (!target) continue;

        const source = path.join(bbsRoot, relative);
        const destination = path.join(themeRoot, target);

        const winner = written.get(target);
        if (winner !== undefined) {
          // Same bytes is the ordinary case - forty nodes, one screen.
          const same = index.files[relative]?.sha256 !== undefined
            && index.files[winner]?.sha256 === index.files[relative]?.sha256;
          if (!same) result.conflicts.push({ path: relative, keptFromPath: winner, target });
          continue;
        }
        if (fs.existsSync(destination)) continue;

        try {
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.copyFileSync(source, destination);
        } catch {
          continue; // unreadable or vanished; the rest of the theme still lands
        }
        written.set(target, relative);
        screensSeeded.add(entry.screen);
        result.copied++;
      }
    }
  }

  result.screens = screensSeeded.size;
  return result;
}

/** The scope one resolution was measured at, as the theme tree names it. */
function scopeOf(resolution: { scope: 'node' | 'conf' | 'board'; id: number | null }): ScreenScope {
  if (resolution.scope === 'node') return { kind: 'node' };
  if (resolution.scope === 'conf') return { kind: 'conf', id: resolution.id ?? 1 };
  return { kind: 'board' };
}

/**
 * Redraw ONE board screen inside a theme: the file, and its variants with it.
 *
 * "Redraw this" means the screen, not one of its three files. A theme that
 * takes `BULL.TXT` and leaves `BULL255.TXT` behind covers the sysop's
 * bulletin with everybody's, and a theme that takes the `.TXT` and leaves the
 * `.SEQ` serves a C64 caller the board's art under the theme's name. Both are
 * the shadowing `theme-validation` rule 5 refuses to publish.
 *
 * Never overwrites: what the artist has already drawn is theirs, and is
 * reported back rather than replaced.
 */
export function copyScreenIntoTheme(
  bbsRoot: string,
  theme: ThemeEntry,
  boardRelPath: string,
): ThemeCopyResult {
  const result: ThemeCopyResult = { copied: [], kept: [] };
  const themeRoot = themeDirectory(bbsRoot, theme);
  if (!themeRoot) return result;

  const index = getScreenIndex(bbsRoot);

  for (const relative of variantSetFor(index, boardRelPath)) {
    // A leftover or a file the board rewrites for itself is not art - the same
    // rule the seeder applies. The file actually asked for is exempt: an
    // artist who opens something and presses redraw meant that file.
    if (relative !== boardRelPath && index.files[relative]?.generated) continue;

    const target = themeTargetForBoardFile(index, relative);
    if (!target) continue;

    const source = path.join(bbsRoot, relative);
    const destination = path.join(themeRoot, target);
    if (fs.existsSync(destination)) {
      result.kept.push({ target });
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      // Bytes, never text: a screen carries Amiga high-bit art and a UTF-8
      // round trip turns each of those into three replacement bytes.
      fs.copyFileSync(source, destination);
    } catch {
      continue; // one unreadable variant must not cost the artist the screen
    }
    result.copied.push({ from: relative, to: path.join(theme.dir, target), target });
  }

  return result;
}
