/**
 * What happens to a FILE_ID.DIZ that will not fit a 40-column screen.
 *
 * This is the SINGLE-record path only: a list row has no room for a DIZ and
 * never reaches here. The ladder, in order (the C64 file-view design, "The DIZ
 * fallback ladder"):
 *
 *   1. SQUEEZE   runs of 2+ spaces collapse to one, ONLY on prose
 *   2. REFLOW    prose still over 40 is word-wrapped
 *   3. CROP      art keeps its left edge and loses its right
 *
 * HOW OFTEN RUNG 1 FIRES, honestly: measured over every real FILE_ID.DIZ in
 * this tree, ZERO times. Every row too wide for 40 classifies as art, and
 * every row that classifies as prose already fits - `MultiRelayChat`'s widest
 * prose row is 38 columns, `BBSLink`'s is 32. The rung exists because the
 * DESCRIPTION TEXT of a record is prose that a door has padded, and that does
 * reach this path; the DIZ case is covered for the board that has one.
 *
 * WHY THE PROSE GATE IS LOAD-BEARING, and not a nicety: the same transform on
 * an art row makes it "fit" by destroying the picture -
 *   "|NEW    ____________   ____________  BRINGS|"   44 columns, art
 *   "|NEW ____________ ____________ BRINGS|"         37 columns, ruined
 * so squeezing is offered ONLY where the classifier says the row is a
 * sentence.
 */
import { looksLikeAsciiArt } from './ascii-art.util';

/**
 * What a caller sees instead of art he has asked not to be shown.
 *
 * Uppercase ASCII, the same shape as the board's existing
 * `[80-COLUMN ANSI SCREEN - SKIPPED]`, because BBS output on this board uses
 * ASCII tokens and never icons.
 */
export const DIZ_ART_SKIPPED_NOTICE = '[ART - SKIPPED]';

/** The tooltype name, so the parser and the docs cannot drift apart. */
export const DIZ_ART_SKIP_TOOLTYPE = 'DIZ_ART_SKIP';

interface DizArtSkipShape {
  toolTypes?: Record<string, string>;
  doorInfo?: { toolTypes?: Record<string, string> };
}

/**
 * Has this command asked for art to be skipped rather than cropped?
 *
 * ABSENT MEANS OFF, and that is not a style choice: a tooltype boolean cannot
 * default to true on this board, because every `.info` that predates the
 * tooltype would read as having opted in. So the tooltype states the
 * RESTRICTION - `DIZ_ART_SKIP=YES` - and every existing registration keeps
 * today's behaviour, which is decision 15: art wider than 40 loses its right
 * edge and that is accepted.
 */
export function dizArtSkipEnabled(door: DizArtSkipShape | undefined | null): boolean {
  if (!door) return false;
  const raw =
    door.toolTypes?.[DIZ_ART_SKIP_TOOLTYPE] ??
    door.doorInfo?.toolTypes?.[DIZ_ART_SKIP_TOOLTYPE];
  if (raw === undefined || raw === null) return false;
  const value = String(raw).trim().toUpperCase();
  return value === 'YES' || value === 'TRUE' || value === '1' || value === 'ON';
}

/**
 * Collapse runs of two or more spaces to one - the squeeze rung.
 *
 * Leading indent is KEPT: it is the only thing holding a centred or indented
 * line in place, and collapsing it moves text a door deliberately positioned.
 * Only runs INSIDE the line are squeezed.
 */
export function squeezeProse(line: string): string {
  const indent = line.match(/^ */)?.[0] ?? '';
  return indent + line.slice(indent.length).replace(/ {2,}/g, ' ').replace(/ +$/, '');
}

/**
 * The squeeze, applied only where it is safe to apply it.
 *
 * @returns the row unchanged when it is art, or when it already fits.
 */
export function squeezeIfProse(line: string, columns: number): string {
  if (line.length <= columns) return line;
  if (looksLikeAsciiArt(line)) return line;
  return squeezeProse(line);
}

/**
 * The DIZ block a 40-column caller sees.
 *
 * @param lines   the DIZ as written
 * @param columns the caller's width
 * @param skipArt `DIZ_ART_SKIP=YES` - show a token instead of cropping art
 */
export function dizBlockFor(
  lines: readonly string[],
  columns: number,
  skipArt: boolean,
): string[] {
  if (skipArt && lines.some((line) => line.length > columns && looksLikeAsciiArt(line))) {
    // ONE line replaces the block: a sysop who sets this would rather see
    // nothing than half a picture.
    return [DIZ_ART_SKIPPED_NOTICE];
  }

  const out: string[] = [];
  for (const line of lines) {
    // 1. SQUEEZE - prose only, and only when it does not already fit.
    const squeezed = squeezeIfProse(line, columns);
    if (squeezed.length <= columns) {
      out.push(squeezed);
      continue;
    }

    if (looksLikeAsciiArt(squeezed)) {
      // 3. CROP - art keeps its LEFT edge and loses its right. The sysop's own
      // ruling: "i guess we will have to live with them being cut off on the
      // right side". Wrapping it instead would put the tail of row 1 on top of
      // row 2 and destroy the picture twice over.
      out.push(squeezed.slice(0, columns));
      continue;
    }

    // 2. REFLOW - prose that is still too wide is WORD-wrapped, so a sentence
    // stays readable rather than being cut mid-word.
    out.push(...wrapWords(squeezed, columns));
  }
  return out;
}

/** Word-wrap, breaking a word only when it cannot fit a row on its own. */
function wrapWords(line: string, columns: number): string[] {
  const rows: string[] = [];
  let current = '';
  for (const word of line.split(/\s+/).filter(Boolean)) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= columns) {
      current += ' ' + word;
    } else {
      rows.push(current);
      current = word;
    }
    while (current.length > columns) {
      rows.push(current.slice(0, columns));
      current = current.slice(columns);
    }
  }
  if (current) rows.push(current);
  return rows;
}
