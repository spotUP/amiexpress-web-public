/**
 * A native .tti teletext page, as something an artist can change.
 *
 * The counterpart of `petscii/editor-surface.ts`, and deliberately the same
 * shape of thing: the surface IS the edit.tf frame (`TtiFrame` from
 * `edittf-frame.ts`), so `frameToTti` already saves one and `ttiToFrame`
 * already loads one. Anything else would need an adapter in both directions.
 *
 * The frame is 25 rows x 40 columns of 7-bit teletext codes, row-major. A
 * code below 0x20 is a SPACING ATTRIBUTE: it occupies a cell (shown as a
 * space) and changes how the rest of the row is drawn. That is why there is
 * no per-cell colour here - colour is a control code the artist places.
 *
 * EVERY OPERATION HERE IS PURE. It returns a NEW surface with cloned `cells`
 * and leaves the one it was given untouched, so the editor's undo is a stack
 * of snapshots. A snapshot is 1,000 bytes.
 *
 * No React, no DOM, no canvas. The chrome lives in `web/config-app`.
 */
import { FRAME_COLS, FRAME_ROWS, type TtiFrame } from './edittf-frame';

/** The page being edited. An edit.tf frame, for the reason in the header. */
export type TeletextSurface = TtiFrame;

/** A rectangle lifted off the page, and stampable back onto it. */
export interface TeletextRegion {
  cols: number;
  rows: number;
  cells: Uint8Array;
}

/**
 * The Level 1 spacing attributes, by name (ETSI EN 300 706 s.12.2).
 * 0x00 and 0x10 are left out: they are Level 2.5 black foregrounds, which a
 * Level 1 set shows as nothing.
 */
export const TELETEXT_CODES = {
  alphaRed: 0x01,
  alphaGreen: 0x02,
  alphaYellow: 0x03,
  alphaBlue: 0x04,
  alphaMagenta: 0x05,
  alphaCyan: 0x06,
  alphaWhite: 0x07,
  flash: 0x08,
  steady: 0x09,
  normalHeight: 0x0c,
  doubleHeight: 0x0d,
  graphicsRed: 0x11,
  graphicsGreen: 0x12,
  graphicsYellow: 0x13,
  graphicsBlue: 0x14,
  graphicsMagenta: 0x15,
  graphicsCyan: 0x16,
  graphicsWhite: 0x17,
  conceal: 0x18,
  contiguous: 0x19,
  separated: 0x1a,
  blackBackground: 0x1c,
  newBackground: 0x1d,
  hold: 0x1e,
  release: 0x1f,
} as const;

export type TeletextCodeName = keyof typeof TELETEXT_CODES;

/** The sixel grid: each cell is 2 wide and 3 tall. */
export const SIXEL_COLS = FRAME_COLS * 2;
export const SIXEL_ROWS = FRAME_ROWS * 3;

const SPACE = 0x20;
/** Bit 32 (0x20) is not a sixel; it is what makes the code a mosaic at all. */
const MOSAIC_BASE = 0x20;
/** Sixel bit by [row within the cell][column within the cell]. Bit 32 is skipped. */
const SIXEL_BITS: readonly (readonly [number, number])[] = [
  [0x01, 0x02],
  [0x04, 0x08],
  [0x10, 0x40],
];

/** A blank page: all spaces, no records. `frameToTti` writes the records it is given. */
export function blankSurface(): TeletextSurface {
  return {
    cells: new Uint8Array(FRAME_ROWS * FRAME_COLS).fill(SPACE),
    meta: { head: [], tail: [], eol: '\n' },
  };
}

export function cloneSurface(surface: TeletextSurface): TeletextSurface {
  return {
    cells: Uint8Array.from(surface.cells),
    meta: { head: [...surface.meta.head], tail: [...surface.meta.tail], eol: surface.meta.eol },
  };
}

function inside(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < FRAME_COLS && y < FRAME_ROWS;
}

const indexOf = (x: number, y: number): number => y * FRAME_COLS + x;

/** One cell set to one 7-bit code. */
function put(surface: TeletextSurface, x: number, y: number, code: number): TeletextSurface {
  if (!inside(x, y)) return surface;
  const next = cloneSurface(surface);
  next.cells[indexOf(x, y)] = code & 0x7f;
  return next;
}

/**
 * Type one character at the cursor, and say where the cursor goes.
 *
 * `code` is the 7-bit teletext code (0x20-0x7F); the national sub-set the
 * page declares decides which glyph it shows. Past the last column the
 * cursor wraps; in the very last cell it STAYS, as in the PETSCII editor.
 */
export function typeChar(
  surface: TeletextSurface,
  x: number,
  y: number,
  code: number,
): { surface: TeletextSurface; cursor: { x: number; y: number } } {
  if (!inside(x, y)) return { surface, cursor: { x, y } };
  const drawn = put(surface, x, y, code);
  if (x < FRAME_COLS - 1) return { surface: drawn, cursor: { x: x + 1, y } };
  if (y < FRAME_ROWS - 1) return { surface: drawn, cursor: { x: 0, y: y + 1 } };
  return { surface: drawn, cursor: { x, y } };
}

/** Place a spacing attribute at `x,y`. It takes a cell, like any character. */
export function setCode(surface: TeletextSurface, x: number, y: number, name: TeletextCodeName): TeletextSurface {
  return put(surface, x, y, TELETEXT_CODES[name]);
}

/**
 * Whether the cell at `x,y` is drawn in graphics (mosaic) mode.
 *
 * Every row starts in alphanumerics. A graphics colour code switches the
 * row to mosaics and an alpha colour code switches it back; both are
 * "set-after", so a code in column x affects x+1 on, never x itself. Hence
 * the scan stops LEFT of x.
 */
export function graphicsAt(surface: TeletextSurface, x: number, y: number): boolean {
  if (!inside(x, y)) return false;
  let graphics = false;
  for (let col = 0; col < x; col++) {
    const code = surface.cells[indexOf(col, y)];
    if (code >= 0x01 && code <= 0x07) graphics = false;
    else if (code >= 0x11 && code <= 0x17) graphics = true;
  }
  return graphics;
}

/**
 * Set or clear one sixel on the 80x75 grid.
 *
 * Only a cell the row's attributes put in graphics mode can show a sixel,
 * and only a character cell can hold one: plotting anywhere else would
 * either draw a letter or overwrite the attribute that colours the row, so
 * it is a no-op. A cell that held a letter (or a blast-through capital)
 * starts from the empty mosaic.
 */
export function plotMosaic(surface: TeletextSurface, px: number, py: number, on: boolean): TeletextSurface {
  if (px < 0 || py < 0 || px >= SIXEL_COLS || py >= SIXEL_ROWS) return surface;
  const x = px >> 1;
  const y = Math.floor(py / 3);
  if (!graphicsAt(surface, x, y)) return surface;

  const current = surface.cells[indexOf(x, y)];
  if (current < 0x20) return surface;
  const isMosaic = (current >= 0x20 && current <= 0x3f) || current >= 0x60;
  const base = isMosaic ? current : MOSAIC_BASE;
  const bit = SIXEL_BITS[py % 3][px & 1];
  const code = (on ? base | bit : base & ~bit) | MOSAIC_BASE;
  return code === current ? surface : put(surface, x, y, code);
}

/**
 * Push a blank row in at `y`, moving the rest down. The page is a fixed
 * 25 rows, so the bottom row falls off; undo puts it back.
 */
export function insertLine(surface: TeletextSurface, y: number): TeletextSurface {
  if (y < 0 || y >= FRAME_ROWS) return surface;
  const next = cloneSurface(surface);
  next.cells.set(surface.cells.subarray(y * FRAME_COLS, (FRAME_ROWS - 1) * FRAME_COLS), (y + 1) * FRAME_COLS);
  next.cells.fill(SPACE, y * FRAME_COLS, (y + 1) * FRAME_COLS);
  return next;
}

/** Take row `y` out, pulling the rest up and blanking the last row. */
export function removeLine(surface: TeletextSurface, y: number): TeletextSurface {
  if (y < 0 || y >= FRAME_ROWS) return surface;
  const next = cloneSurface(surface);
  next.cells.set(surface.cells.subarray((y + 1) * FRAME_COLS), y * FRAME_COLS);
  next.cells.fill(SPACE, (FRAME_ROWS - 1) * FRAME_COLS);
  return next;
}

/** Blank every cell. The records (`meta`) are the page's, not the art's, and stay. */
export function clearSurface(surface: TeletextSurface): TeletextSurface {
  const next = cloneSurface(surface);
  next.cells.fill(SPACE);
  return next;
}

/** The rectangle between two dragged corners, in either order. */
export function liftRegion(
  surface: TeletextSurface,
  a: { x: number; y: number },
  b: { x: number; y: number },
): TeletextRegion {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const x1 = Math.min(FRAME_COLS - 1, Math.max(a.x, b.x));
  const y1 = Math.min(FRAME_ROWS - 1, Math.max(a.y, b.y));
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;

  const cells = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    cells.set(surface.cells.subarray(indexOf(x0, y0 + row), indexOf(x0, y0 + row) + cols), row * cols);
  }
  return { cols, rows, cells };
}

/**
 * Stamp a lifted region with its top-left at `x,y`. Anything past the right
 * or bottom edge is CLIPPED, never wrapped.
 */
export function stampRegion(
  surface: TeletextSurface,
  x: number,
  y: number,
  region: TeletextRegion,
): TeletextSurface {
  const next = cloneSurface(surface);
  for (let row = 0; row < region.rows; row++) {
    for (let col = 0; col < region.cols; col++) {
      if (!inside(x + col, y + row)) continue;
      next.cells[indexOf(x + col, y + row)] = region.cells[row * region.cols + col];
    }
  }
  return next;
}
