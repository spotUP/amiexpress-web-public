/**
 * A screen is not one file.
 *
 * `BULL.TXT` is the bulletin most callers see, `BULL255.TXT` is the one the
 * sysop sees, and `BULL.SEQ` is what a C64 is served. The loader picks ONE of
 * them per caller, and the screen index already knows the whole set:
 * `resolution.variants` holds every name in the directory the screen resolved
 * from that `variantOf` matched - security levels AND the `.seq` / `.rip` /
 * `.GR` twins beside it.
 *
 * Two callers need that same set, and they used to disagree: the SEEDER that
 * fills a new theme copied the variants, and the COPY route an artist presses
 * "redraw this" on copied one file. A theme holding `BULL.TXT` and not
 * `BULL255.TXT` shadows the board's sysop bulletin, which `theme-validation`'s
 * rule 5 refuses to publish - so redrawing one screen by hand quietly made the
 * theme unpublishable, and the artist was told why only at the publish gate.
 */
import * as path from 'path';

import type { ScreenIndex } from './screen-index.service';
import { isThemeWideScreen } from './screen-tables';

/**
 * The board file named, and every variant beside it, board-relative.
 *
 * A path the index does not know - somebody's art in a directory no screen
 * resolves from - is its own answer: one file, copied on its own. That is the
 * behaviour the copy route had before this existed, and it is right; the set
 * is only bigger when the board says the file is part of a screen.
 */
export function variantSetFor(index: ScreenIndex, boardRelPath: string): string[] {
  return matchIn(index, boardRelPath)?.set ?? [boardRelPath];
}

/**
 * The SCOPE the loader reads a board file as, when it reads it as a screen.
 *
 * The theme tree is keyed on scope, and the only authority on a board's scopes
 * is the board: a node's screen directory is whatever its SCREENS tooltype
 * says (215 nodes on this board share `Screens/Node/`) and a conference's is
 * what LOCATION.n names. Reading the scope off the DIRECTORY NAME - `Node<n>`,
 * `Conf<n>` - gets the shared node directory wrong, and every theme seeded
 * from this board carries the proof: `Node/BBSTITLE.txt` (which the loader
 * reads) and a second copy at `Files/Screens/Node/BBSTITLE.txt` (which it does
 * not).
 *
 * `undefined` means no screen resolves from this file - pool art like
 * `Screens/flt.txt`, which LOGON pulls in by PATH. Those belong under the
 * theme's `Files/` mirror, which is the tree that arm of the loader reads.
 */
export function screenScopeOf(index: ScreenIndex, boardRelPath: string): ScreenScope | undefined {
  return matchIn(index, boardRelPath)?.scope;
}

/**
 * Where the board reads a screen from: the scopes a theme mirrors.
 *
 * `conferences` is a theme's own: the one copy of a THEME_WIDE_SCREENS screen
 * that serves every conference (`Themes/<slug>/Conf/<file>`).
 */
export type ScreenScope =
  | { kind: 'node' }
  | { kind: 'conf'; id: number }
  | { kind: 'conferences' }
  | { kind: 'board' };

/**
 * The scope a theme keeps one resolution of `screen` in.
 *
 * One rule for the seeder and the copy route: a conference screen lands in
 * that conference's directory, except a screen a theme draws ONCE for every
 * conference, which lands in the theme's every-conference directory.
 */
export function themeScopeOf(
  screen: string,
  resolution: { scope: 'node' | 'conf' | 'board'; id: number | null },
): ScreenScope {
  if (resolution.scope === 'node') return { kind: 'node' };
  if (resolution.scope === 'conf') {
    return isThemeWideScreen(screen) ? { kind: 'conferences' } : { kind: 'conf', id: resolution.id ?? 1 };
  }
  return { kind: 'board' };
}

/** The one walk both questions are answered by. */
function matchIn(
  index: ScreenIndex,
  boardRelPath: string,
): { set: string[]; scope: ScreenScope } | undefined {
  const wanted = path.normalize(boardRelPath);

  for (const entry of index.screens) {
    for (const resolution of entry.resolutions) {
      if (!resolution.file) continue;
      const dir = path.dirname(resolution.file);
      const names = resolution.variants?.length
        ? resolution.variants
        : [path.basename(resolution.file)];
      const set = names.map(name => path.join(dir, name));

      // The file asked for has to BE one of them - a screen resolving in the
      // same directory does not make every neighbour part of this screen.
      if (!set.some(rel => path.normalize(rel) === wanted)) continue;

      return { set, scope: themeScopeOf(entry.screen, resolution) };
    }
  }

  return undefined;
}
