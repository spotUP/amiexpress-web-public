/**
 * Half-block pixels: two vertical pixels per character cell via the block
 * glyphs. The encoding the Pengo sprites were authored in, promoted from
 * the one-off generator into the engine so the studio's pixel mode edits
 * exactly what renders.
 *
 * The contract that matters is the ROUND TRIP: decompilePixels is the
 * exact inverse of compilePixels for everything compilePixels can emit.
 * A frame containing anything that is not a block glyph (letters, shades,
 * arrows) decompiles to null and is edited cell-by-cell instead - lossy
 * conversion is how an editor corrupts art just by opening it, so there
 * is none. A frame using the block glyphs in a non-canonical way (say,
 * {char:'▄', fg:5, bg:5} instead of the canonical {char:'█', fg:5, bg:5})
 * is NOT rejected: decompilePixels still reads the correct pixels out of
 * it, and the next compilePixels re-encodes them canonically - same
 * pixels, same visual, just not necessarily the same bytes it started as.
 */

import { Cell, CellBuffer, CellRow } from './cells';

/** Colours 0-15, or null for a transparent pixel. Height is always even. */
export type PixelGrid = Array<Array<number | null>>;

/** Two pixel rows -> one cell row: ▀ top, ▄ bottom, █ both, null neither. */
export function compilePixels(pixels: PixelGrid): CellBuffer {
  if (pixels.length % 2 !== 0) {
    throw new Error(`pixel grid needs an even row count, got ${pixels.length}`);
  }
  const out: CellBuffer = [];
  for (let y = 0; y < pixels.length; y += 2) {
    const top = pixels[y];
    const bottom = pixels[y + 1];
    if (bottom.length !== top.length) {
      throw new Error(
        `pixel grid rows ${y}/${y + 1} are ragged: top has ${top.length} pixels, bottom has ${bottom.length}`
      );
    }
    const row: CellRow = [];
    for (let x = 0; x < top.length; x++) {
      const t = top[x];
      const b = bottom[x] ?? null;
      if (t === null && b === null) row.push(null);
      else if (t !== null && b === null) row.push({ char: '▀', fg: t, bg: 0 });
      else if (t === null && b !== null) row.push({ char: '▄', fg: b, bg: 0 });
      else if (t === b) row.push({ char: '█', fg: t as number, bg: t as number });
      // A BLACK bottom pixel must not collide with a TRANSPARENT one -
      // both would be {▀, fg, bg:0}. The lower-half glyph with swapped
      // roles paints identically (top = bg colour, bottom = fg black) and
      // decompiles distinctly. Review-caught before the pixel editor
      // could silently drop painted black on every save/reload.
      else if (b === 0) row.push({ char: '▄', fg: 0, bg: t as number });
      else row.push({ char: '▀', fg: t as number, bg: b as number });
    }
    out.push(row);
  }
  return out;
}

/**
 * The inverse - or null when the frame is not pure half-blocks.
 *
 * Transparency vs black: bg 0 under ▀ or ▄ means TRANSPARENT other half.
 * An explicit black half-pixel is encoded with the OTHER half-block glyph
 * and swapped roles ({▄, fg:0, bg:colour} for black-under-colour), so
 * every pixel grid round-trips exactly - including painted black.
 */
export function decompilePixels(frame: CellBuffer): PixelGrid | null {
  const top: Array<number | null> = [];
  const bottom: Array<number | null> = [];
  const out: PixelGrid = [];

  for (const row of frame) {
    top.length = 0;
    bottom.length = 0;
    for (const cell of row) {
      if (cell === null) { top.push(null); bottom.push(null); continue; }
      const { char, fg, bg } = cell as Cell;
      if (char === '█' && fg === bg) { top.push(fg); bottom.push(fg); continue; }
      if (char === '▀' && bg === 0) { top.push(fg); bottom.push(null); continue; }
      if (char === '▄' && bg === 0) { top.push(null); bottom.push(fg); continue; }
      if (char === '▀') { top.push(fg); bottom.push(bg); continue; }
      if (char === '▄') { top.push(bg); bottom.push(fg); continue; }
      return null; // anything else is cell-mode-only art
    }
    out.push([...top], [...bottom]);
  }
  return out;
}
