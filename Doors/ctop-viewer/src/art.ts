/**
 * The sysop's own drawing above and below the table.
 *
 * Conftop-II splices in `Conf<n>/Conftop.header` and `Conf<n>/Conftop.tailer`
 * verbatim, falling back to a copy in the door's own directory
 * (ctop.e:902-929). A C64 caller gets the narrow copy where the sysop drew
 * one, under the board's ONE width-variant rule - `Conftop.header_C64`, the
 * same `_C64` suffix the show-file service resolves screens with.
 *
 * The file is read as latin-1 and its lines go out as they are. Amiga art is
 * bytes, not text: decoding it as UTF-8 turns every high-bit glyph into a
 * replacement character, which is the shape that has damaged art in this tree
 * before.
 */
import * as fs from 'fs';
import * as path from 'path';

import { narrowVariants } from '@amiexpress/bbs-door-sdk/utils/narrow-art';

export interface CtopArt {
  header: string[];
  tailer: string[];
}

export const NO_ART: CtopArt = { header: [], tailer: [] };

function readLines(file: string): string[] | null {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) return null;
    return fs.readFileSync(file, 'latin1').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  } catch {
    return null;
  }
}

/**
 * One drawing, narrow copy first when the caller's screen is narrow.
 *
 * `dirs` are searched in order, as the door searches them: the conference
 * first, then the door's own directory.
 */
export function loadArtFile(dirs: readonly string[], name: string, narrow: boolean): string[] {
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    const spellings = narrow ? [...narrowVariants(candidate), candidate] : [candidate];
    for (const file of spellings) {
      const lines = readLines(file);
      if (lines) return lines;
    }
  }
  return [];
}

/** Both drawings. */
export function loadCtopArt(dirs: readonly string[], narrow: boolean): CtopArt {
  return {
    header: loadArtFile(dirs, 'Conftop.header', narrow),
    tailer: loadArtFile(dirs, 'Conftop.tailer', narrow),
  };
}
