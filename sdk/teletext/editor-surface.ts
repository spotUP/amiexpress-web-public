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

/*
 * COLOUR AS AN ARTIST PICKS IT.
 *
 * The admin's .tti editor works like its ANSI editor: pick a foreground and a
 * background, then draw blocks or type. Teletext has no per-cell colour, so
 * the functions below place the spacing attributes themselves, in the free
 * cells LEFT of the run (an attribute takes a cell, and a colour code is
 * set-after). Everything stays pure, and one call is one undo step.
 */

/** The eight teletext colours, by index: the order of the colour codes and of ANSI 30-37. */
export type TeletextColour = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const TELETEXT_COLOUR_NAMES: readonly string[] = [
  'Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White',
];

/** How a cell is drawn: what the row's attributes left of it add up to. */
export interface TeletextAttributes {
  fg: TeletextColour;
  bg: TeletextColour;
  graphics: boolean;
}

/** Shown when a colour change has nowhere to go. */
export const COLOUR_NEEDS_ROOM = 'Colour change needs a free cell to the left';

const BLACK_BACKGROUND = 0x1c;
const NEW_BACKGROUND = 0x1d;

/**
 * The colour, background and mode cell `x` is drawn in. Colour codes are
 * set-after (they reach x only from a column left of it); Black Background
 * and New Background are set-at, and New Background takes the foreground in
 * effect in its own cell - which, scanning left to right, is the current one.
 * Level 2.5's black foregrounds (0x00, 0x10) are ignored, as a Level 1 set does.
 */
export function attributesAt(surface: TeletextSurface, x: number, y: number): TeletextAttributes {
  const found: TeletextAttributes = { fg: 7, bg: 0, graphics: false };
  if (!inside(Math.min(x, FRAME_COLS - 1), y)) return found;
  for (let col = 0; col < Math.min(x, FRAME_COLS); col++) {
    const code = surface.cells[indexOf(col, y)];
    if (code >= 0x01 && code <= 0x07) { found.fg = code as TeletextColour; found.graphics = false; }
    else if (code >= 0x11 && code <= 0x17) { found.fg = (code - 0x10) as TeletextColour; found.graphics = true; }
    else if (code === BLACK_BACKGROUND) found.bg = 0;
    else if (code === NEW_BACKGROUND) found.bg = found.fg;
  }
  return found;
}

/** A cell an attribute may take: a space or another attribute, never a letter or a block. */
function freeCell(code: number): boolean {
  return code <= 0x20;
}

/** A cell that shows something: not a space, not an attribute. */
function contentCell(code: number): boolean {
  return code > 0x20;
}

const colourCode = (colour: TeletextColour, graphics: boolean): number => (graphics ? 0x10 : 0x00) + colour;

/**
 * The attributes that turn `from` into `to`, in the order they go on the row.
 * A background is a colour code for it then New Background, then the
 * foreground's own code: three cells. Black needs only Black Background.
 * Black foreground has no Level 1 code, so it is never asked for here.
 */
export function attributeRun(from: TeletextAttributes, to: TeletextAttributes): number[] {
  const fgCode = colourCode(to.fg, to.graphics);
  if (to.bg !== from.bg) {
    if (to.bg === 0) {
      return from.fg === to.fg && from.graphics === to.graphics ? [BLACK_BACKGROUND] : [BLACK_BACKGROUND, fgCode];
    }
    return [colourCode(to.bg, to.graphics), NEW_BACKGROUND, fgCode];
  }
  if (from.fg !== to.fg || from.graphics !== to.graphics) return [fgCode];
  return [];
}

const sameAttributes = (a: TeletextAttributes, b: TeletextAttributes): boolean =>
  a.fg === b.fg && a.bg === b.bg && a.graphics === b.graphics;

/** Writes `run` into the cells ending just left of `x`, when they are all free. */
function placeRun(cells: Uint8Array, x: number, y: number, run: number[], leftLimit: number): boolean {
  const start = x - run.length;
  if (start < leftLimit) return false;
  for (let col = start; col < x; col++) if (!freeCell(cells[indexOf(col, y)])) return false;
  run.forEach((code, i) => { cells[indexOf(start + i, y)] = code; });
  return true;
}

/**
 * Put the colours the artist picked in front of cell `x` of a copy of
 * `surface`, run `draw` on it, then give the next thing on the row back the
 * colour it had. `null` when the colour change has no free cells to go in.
 *
 * The restore goes in the free cells just before that next letter or block,
 * not straight after `x`, so a stroke dragged on to the right is not walled
 * in by its own restore code. With no free cells there, the restore is
 * skipped and the rest of the row takes the new colour.
 */
function inColour(
  surface: TeletextSurface,
  x: number,
  y: number,
  to: TeletextAttributes,
  draw: (cells: Uint8Array) => void,
): TeletextSurface | null {
  const next = cloneSurface(surface);
  if (!placeRun(next.cells, x, y, attributeRun(attributesAt(surface, x, y), to), 0)) return null;
  draw(next.cells);

  let following = x + 1;
  while (following < FRAME_COLS && !contentCell(next.cells[indexOf(following, y)])) following++;
  if (following < FRAME_COLS) {
    const was = attributesAt(surface, following, y);
    const now = attributesAt(next, following, y);
    if (!sameAttributes(was, now)) placeRun(next.cells, following, y, attributeRun(now, was), x + 1);
  }
  return next;
}

export interface ColouredEdit {
  surface: TeletextSurface;
  /** The colour change needed a free cell left of the run and had none; nothing was drawn. */
  blocked: boolean;
}

/**
 * Make cell `x` of `cells` a space by sliding the attributes from the start
 * of its run up to `x` one cell left, onto the space before that run. Every code keeps its order
 * and stays left of what it colours, so the row keeps its look; the run
 * moves on ahead of a stroke instead of standing in it. `false` when there
 * is no space to slide onto.
 */
function slideAttributesLeft(cells: Uint8Array, x: number, y: number): boolean {
  let start = x;
  while (start > 0 && cells[indexOf(start - 1, y)] < SPACE) start--;
  if (start === 0 || cells[indexOf(start - 1, y)] !== SPACE) return false;
  for (let col = start; col <= x; col++) cells[indexOf(col - 1, y)] = cells[indexOf(col, y)];
  cells[indexOf(x, y)] = SPACE;
  return true;
}

/**
 * Draw Blocks: set one sixel in the picked foreground on the picked
 * background, placing the graphics colour code (and the background codes)
 * left of the cell when the row does not already draw that cell so. A cell
 * holding an attribute first slides its run left onto free spaces; with no
 * room it is not drawn on. `fg` 0 (black) has no Level 1 code and draws
 * nothing.
 */
export function paintMosaic(
  surface: TeletextSurface,
  px: number,
  py: number,
  fg: TeletextColour,
  bg: TeletextColour,
): ColouredEdit {
  if (px < 0 || py < 0 || px >= SIXEL_COLS || py >= SIXEL_ROWS || fg === 0) return { surface, blocked: false };
  const x = px >> 1;
  const y = Math.floor(py / 3);
  let from = surface;
  if (surface.cells[indexOf(x, y)] < SPACE) {
    from = cloneSurface(surface);
    if (!slideAttributesLeft(from.cells, x, y)) return { surface, blocked: false };
  }
  const next = inColour(from, x, y, { fg, bg, graphics: true }, (cells) => {
    const drawn = plotMosaic({ cells, meta: surface.meta }, px, py, true);
    cells.set(drawn.cells);
  });
  return next ? { surface: next, blocked: false } : { surface, blocked: true };
}

/**
 * Text: type one character in the picked colours, placing the alpha colour
 * code (and background codes) left of it when needed. The cursor moves on
 * only when the character went down.
 */
export function typeCharColoured(
  surface: TeletextSurface,
  x: number,
  y: number,
  code: number,
  fg: TeletextColour,
  bg: TeletextColour,
): ColouredEdit & { cursor: { x: number; y: number } } {
  if (!inside(x, y) || fg === 0) return { surface, blocked: false, cursor: { x, y } };
  const next = inColour(surface, x, y, { fg, bg, graphics: false }, (cells) => {
    cells[indexOf(x, y)] = code & 0x7f;
  });
  if (!next) return { surface, blocked: true, cursor: { x, y } };
  return { surface: next, blocked: false, cursor: typeChar(surface, x, y, code).cursor };
}

/**
 * Erase: clear the sixel under the pointer in a block, or blank a letter.
 * Attributes stay; they are changed through the named control codes.
 */
export function eraseAt(surface: TeletextSurface, px: number, py: number): TeletextSurface {
  if (px < 0 || py < 0 || px >= SIXEL_COLS || py >= SIXEL_ROWS) return surface;
  const x = px >> 1;
  const y = Math.floor(py / 3);
  if (graphicsAt(surface, x, y)) return plotMosaic(surface, px, py, false);
  return contentCell(surface.cells[indexOf(x, y)]) ? put(surface, x, y, SPACE) : surface;
}

/*
 * THE ANSI EDITOR'S SHAPE TOOLS, ON THE SIXEL GRID.
 *
 * Line, Box, Filled Box and Fill draw blocks exactly as Draw Blocks does -
 * every sixel through `paintMosaic`, so the colour codes are placed the same
 * way - on the 80x75 grid of sixels instead of the 40x25 grid of cells.
 */

/** A sixel on the 80x75 grid. */
export interface Sixel {
  px: number;
  py: number;
}

/** The sixels of a straight line between two, both ends included (Bresenham). */
export function sixelLine(a: Sixel, b: Sixel): Sixel[] {
  const points: Sixel[] = [];
  const dx = Math.abs(b.px - a.px);
  const dy = -Math.abs(b.py - a.py);
  const sx = a.px < b.px ? 1 : -1;
  const sy = a.py < b.py ? 1 : -1;
  let err = dx + dy;
  let { px, py } = a;
  for (;;) {
    points.push({ px, py });
    if (px === b.px && py === b.py) return points;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; px += sx; }
    if (e2 <= dx) { err += dx; py += sy; }
  }
}

/** The sixels of the rectangle between two dragged corners: its edge, or all of it. */
export function sixelBox(a: Sixel, b: Sixel, filled: boolean): Sixel[] {
  const x0 = Math.min(a.px, b.px);
  const x1 = Math.max(a.px, b.px);
  const y0 = Math.min(a.py, b.py);
  const y1 = Math.max(a.py, b.py);
  const points: Sixel[] = [];
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      if (filled || py === y0 || py === y1 || px === x0 || px === x1) points.push({ px, py });
    }
  }
  return points;
}

/**
 * Draw every sixel in `points`, left to right within a row so a colour code
 * lands before the blocks it colours. `blocked` when any sixel had no room
 * for its colour change; the rest are still drawn.
 */
export function paintSixels(
  surface: TeletextSurface,
  points: readonly Sixel[],
  fg: TeletextColour,
  bg: TeletextColour,
): ColouredEdit {
  const ordered = [...points].sort((p, q) => p.py - q.py || p.px - q.px);
  let next = surface;
  let blocked = false;
  for (const point of ordered) {
    const edit = paintMosaic(next, point.px, point.py, fg, bg);
    next = edit.surface;
    blocked ||= edit.blocked;
  }
  return { surface: next, blocked };
}

/** Whether a sixel is lit on the page: its cell is a block in graphics mode with that bit set. */
function sixelLit(surface: TeletextSurface, px: number, py: number): boolean {
  const x = px >> 1;
  const y = Math.floor(py / 3);
  const code = surface.cells[indexOf(x, y)];
  if (code <= 0x20) return code < 0x20; // an attribute cell walls a fill in; a space is empty
  if ((code >= 0x40 && code <= 0x5f) || !graphicsAt(surface, x, y)) return true; // a letter
  return (code & SIXEL_BITS[py % 3][px & 1]) !== 0;
}

/** Fill: every unlit sixel joined to the one clicked (up, down, left, right), drawn in the picked colours. */
export function fillSixels(
  surface: TeletextSurface,
  start: Sixel,
  fg: TeletextColour,
  bg: TeletextColour,
): ColouredEdit {
  const { px, py } = start;
  if (px < 0 || py < 0 || px >= SIXEL_COLS || py >= SIXEL_ROWS || sixelLit(surface, px, py)) {
    return { surface, blocked: false };
  }
  const seen = new Uint8Array(SIXEL_COLS * SIXEL_ROWS);
  const points: Sixel[] = [];
  const queue: Sixel[] = [start];
  seen[py * SIXEL_COLS + px] = 1;
  while (queue.length > 0) {
    const point = queue.pop() as Sixel;
    points.push(point);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = point.px + ox;
      const ny = point.py + oy;
      if (nx < 0 || ny < 0 || nx >= SIXEL_COLS || ny >= SIXEL_ROWS || seen[ny * SIXEL_COLS + nx]) continue;
      seen[ny * SIXEL_COLS + nx] = 1;
      if (!sixelLit(surface, nx, ny)) queue.push({ px: nx, py: ny });
    }
  }
  return paintSixels(surface, points, fg, bg);
}

/** Pick: the colours of the cell under the pointer, as the artist would pick them. */
export function pickColours(surface: TeletextSurface, x: number, y: number): { fg: TeletextColour; bg: TeletextColour } {
  const { fg, bg } = attributesAt(surface, x, y);
  return { fg, bg };
}
