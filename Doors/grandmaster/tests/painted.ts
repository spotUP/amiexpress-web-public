/**
 * How many cells a painted panel actually FILLS.
 *
 * Two tests counted `█` to answer that, which stopped being the question on
 * 2026-09-14: a solid cell is a background colour now, not a glyph, because
 * `█` is not an Amiga character and the telnet wire turns it into `?` (see
 * ui/block-width.ts). A count of glyphs read every filled cell as empty.
 *
 * The property is "this cell is filled with a colour", and it has two forms
 * on this board - the fill a screen with per-cell background gets, and the
 * ink PETSCII keeps - so the count understands both and no test has to care
 * which screen it is looking at.
 */

/** Blessed's opening/closing tags, the only syntax this has to walk. */
const TAG = /\{(\/?)([a-z0-9-]+)\}/iy;

/**
 * Filled cells in a painted string.
 *
 * A cell is filled when it is drawn as a block glyph, or when it is a space
 * inside an open background colour. A space with no background is the empty
 * well, and is not counted.
 */
export function filledCells(painted: string): number {
  let filled = 0;
  const backgrounds: string[] = [];

  for (let i = 0; i < painted.length; i++) {
    if (painted[i] === '{') {
      TAG.lastIndex = i;
      const tag = TAG.exec(painted);
      if (tag) {
        const [, closing, name] = tag;
        if (name.endsWith('-bg')) {
          if (closing) backgrounds.pop();
          else backgrounds.push(name);
        }
        i = TAG.lastIndex - 1;
        continue;
      }
    }
    const ch = painted[i];
    if (ch === '█') filled += 1;
    else if (ch === ' ' && backgrounds.length > 0) filled += 1;
  }
  return filled;
}
