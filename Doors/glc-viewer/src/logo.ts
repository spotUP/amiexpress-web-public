/**
 * Which drawing goes above the title bar.
 *
 * The sysop, 2026-09-16: "i would love to take control of the logo". So the
 * five lines are a FILE now - one per style, shipped in `art/` and declared
 * as drawable slots in `door.settings.json`, which is what puts them in the
 * ANSI Studio for the artists at level 100.
 *
 * Three places are tried, in this order:
 *
 *  1. THE C64 VARIANT, for a caller on forty columns. The Studio stores those
 *     outside the door - `Screens/doors/GLC/setting:logo3.c64.ans` - because
 *     the drawing is the BOARD'S and has to survive a door re-install
 *     (`web/backend/src/doors/door-art-variants.ts`). A door reads it the same
 *     way the board writes it; nothing here reaches into the backend.
 *  2. THE ART FILE the setting names, for everyone else.
 *  3. THE ORIGINAL, compiled in from `GLCViewer.e`. A board that has never
 *     opened the Studio, and a door folder with no `art/` at all, both draw
 *     exactly what the 68K viewer drew - which is what keeps the parity test
 *     meaningful after this file exists.
 */
import * as fs from 'fs';
import * as path from 'path';

import { LOGO_STYLE_1_3, LOGO_STYLE_2_4 } from './art.generated';

/** A forty-column caller reads the narrow drawing; everyone else the wide one. */
export const NARROW_COLUMNS = 40;

/** The section name the Studio files a setting's variants under. */
export const artSettingSection = (key: string): string => `setting:${key}`;

/** What the original ships for this style, and the last word if nothing else answers. */
export function originalLogo(style: number): readonly string[] {
  return style === 1 || style === 3 ? LOGO_STYLE_1_3 : LOGO_STYLE_2_4;
}

/** Read a drawing, or null when it is not there or cannot be read. */
function readLines(file: string): string[] | null {
  try {
    const text = fs.readFileSync(file, 'latin1');
    // Trailing blank lines are the file's, not the drawing's: an editor that
    // ends with a newline would otherwise push the title bar down a row.
    const lines = text.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}

export interface LogoRequest {
  /** 1-4, already clamped by the caller. */
  style: number;
  /** The door's own directory, for the art file the setting names. */
  doorDir: string;
  /** The board root, for the Studio's variant store. Null when unknown. */
  bbsRoot: string | null;
  /** The caller's width: 40 takes the narrow drawing. */
  columns: number;
  /** The setting values, so `logo3` can name something other than the default. */
  values: Record<string, unknown>;
  /** The command the variants are filed under. */
  command: string;
  /**
   * A teletext caller: forty columns too, but his drawing is a teletext page -
   * double-height rows and mosaic blocks - not the C64's reverse-video one.
   */
  teletext?: boolean;
}

/** The five lines to draw above the title bar. */
export function logoFor(request: LogoRequest): readonly string[] {
  const key = `logo${request.style}`;

  /*
   * A TELETEXT CALLER READS HIS OWN DRAWING FIRST: the Studio's `.ttx`
   * variant, then the door's shipped teletext placeholder. Only where neither
   * exists does he fall to the C64 one below (sysop, 2026-10-06: "fix
   * teletext versions of them").
   */
  if (request.teletext && request.columns <= NARROW_COLUMNS) {
    const drawn = request.bbsRoot
      ? readLines(path.join(
        request.bbsRoot, 'Screens', 'doors',
        request.command.toUpperCase(),
        `${artSettingSection(key).toLowerCase()}.ttx.ans`,
      ))
      : null;
    if (drawn) return drawn;
    const shipped = readLines(path.join(request.doorDir, 'art', `style${request.style}.ttx.ans`));
    if (shipped) return shipped;
  }

  if (request.bbsRoot && request.columns <= NARROW_COLUMNS) {
    const narrow = readLines(path.join(
      request.bbsRoot, 'Screens', 'doors',
      request.command.toUpperCase(),
      `${artSettingSection(key).toLowerCase()}.c64.ans`,
    ));
    if (narrow) return narrow;
  }

  /*
   * A NARROW CALLER IS NEVER GIVEN THE WIDE DRAWING.
   *
   * The sysop's first C64 screenshot (2026-09-16) opened with the 79-column
   * logo wrapped across eight rows of a forty-column screen - unreadable, and
   * it pushed the list off the top. The wide art is not a fallback for a
   * caller who cannot hold it: without a `_c64` variant the narrow screen
   * simply has no logo, and its title bar is the header.
   *
   * The slot is in the Studio either way, so drawing one is a decision an
   * artist makes rather than something the door guesses at.
   */
  if (request.columns <= NARROW_COLUMNS) {
    /*
     * The door ships a placeholder so a C64 screen is not bare while nobody
     * has drawn one: `art/style<N>.c64.ans`, five rows of reverse-video
     * blocks spelling GLC. It is deliberately plain - it is there to be
     * replaced in the Studio, and the variant above wins the moment it is.
     */
    const shipped = readLines(path.join(request.doorDir, 'art', `style${request.style}.c64.ans`));
    return shipped ?? [];
  }

  const named = request.values[key];
  if (typeof named === 'string' && named.length > 0) {
    // Inside the door's own folder, and nowhere else: the value is a setting
    // an admin can type into.
    const resolved = path.resolve(request.doorDir, named);
    if (resolved.startsWith(path.resolve(request.doorDir) + path.sep)) {
      const drawn = readLines(resolved);
      if (drawn) return drawn;
    }
  }

  return originalLogo(request.style);
}
