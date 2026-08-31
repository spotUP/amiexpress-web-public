/**
 * Half-block pixels: two vertical pixels per character cell via the block
 * glyphs. The encoding the Pengo sprites were authored in, promoted from
 * the one-off generator into the engine so the studio's pixel mode edits
 * exactly what renders.
 *
 * The contract that matters is the ROUND TRIP: decompilePixels is the
 * exact inverse of compilePixels for everything compilePixels can emit.
 * A frame containing anything else (letters, shades, arrows) decompiles
 * to null and is edited cell-by-cell instead - lossy conversion is how an
 * editor corrupts art just by opening it, so there is none.
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
    const row: CellRow = [];
    for (let x = 0; x < top.length; x++) {
      const t = top[x];
      const b = bottom[x] ?? null;
      if (t === null && b === null) row.push(null);
      else if (t !== null && b === null) row.push({ char: '▀', fg: t, bg: 0 });
      else if (t === null && b !== null) row.push({ char: '▄', fg: b, bg: 0 });
      else if (t === b) row.push({ char: '█', fg: t as number, bg: t as number });
      else row.push({ char: '▀', fg: t as number, bg: b as number });
    }
    out.push(row);
  }
  return out;
}

/**
 * The inverse - or null when the frame is not pure half-blocks.
 *
 * The ▀-with-bg-0 ambiguity is resolved the way compilePixels writes it:
 * bg 0 under ▀ means TRANSPARENT lower pixel, not black. Black-on-black
 * art therefore uses █ with fg 0, which the compiler emits for t === b.
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
      return null; // anything else is cell-mode-only art
    }
    out.push([...top], [...bottom]);
  }
  return out;
}
