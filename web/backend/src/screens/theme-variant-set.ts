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

/**
 * The board file named, and every variant beside it, board-relative.
 *
 * A path the index does not know - somebody's art in a directory no screen
 * resolves from - is its own answer: one file, copied on its own. That is the
 * behaviour the copy route had before this existed, and it is right; the set
 * is only bigger when the board says the file is part of a screen.
 */
export function variantSetFor(index: ScreenIndex, boardRelPath: string): string[] {
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
      if (set.some(rel => path.normalize(rel) === wanted)) return set;
    }
  }

  return [boardRelPath];
}
