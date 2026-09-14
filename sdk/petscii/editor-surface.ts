/**
 * A PETSCII screen, as something an artist can change.
 *
 * The studio can edit ANSI (`ScreenEditor`) and RIP (`RipScreenEditor`);
 * PETSCII was a picture with no way in. This is the model the editor draws
 * on, and it is deliberately NOT a new shape: the surface IS a
 * `PetsciiMachineState`, so `writeSeq` already saves one and
 * `PetsciiMachine.feed` already produces one. An editor model that was
 * anything else would need an adapter in both directions, and an adapter is
 * where a round trip goes wrong.
 *
 * EVERY OPERATION HERE IS PURE. It returns a NEW surface with cloned
 * `screen`/`colorRam` and leaves the one it was given untouched, which is
 * what lets the editor's undo be a stack of snapshots instead of a byte log.
 * A 40x25 snapshot is 2,000 bytes; a hundred of them is 200 KB, which is not
 * a budget worth managing.
 *
 * No React, no DOM, no canvas. The chrome lives in `web/config-app`.
 */
import { PetsciiMachine, type PetsciiMachineState } from './petscii-machine';
import { printablePetsciiToScreenCode } from './screen-codes';

/** The screen being edited. A machine state, for the reason in the header. */
export type PetsciiSurface = PetsciiMachineState;

/** What the artist has selected: a glyph, a colour, and whether it is reversed. */
export interface PetsciiBrush {
  /** Screen code 0x00-0x7F. The reverse bit is `reverse`, never folded in here. */
  screenCode: number;
  /** VIC colour index 0-15. */
  color: number;
  reverse: boolean;
}

/** A rectangle lifted off the screen, and stampable back onto it. */
export interface PetsciiRegion {
  cols: number;
  rows: number;
  screen: Uint8Array;
  colorRam: Uint8Array;
}

/** Screen code 32 is the space in both banks. */
const SPACE = 0x20;
const REVERSE_BIT = 0x80;

/**
 * A blank screen, with the C64's own power-on state.
 *
 * Built from a real `PetsciiMachine` rather than from literals here: the
 * power-on pen is 14 and not white, the bank is 0, and duplicating those
 * would be a second source of truth about what a blank screen is.
 */
export function blankSurface(cols?: number, rows?: number): PetsciiSurface {
  return new PetsciiMachine(cols !== undefined || rows !== undefined ? { cols, rows } : {}).state;
}

export function cloneSurface(surface: PetsciiSurface): PetsciiSurface {
  return {
    ...surface,
    screen: Uint8Array.from(surface.screen),
    colorRam: Uint8Array.from(surface.colorRam),
  };
}

/** A `.seq` read back into a surface, through the machine that has always read one. */
export function surfaceFromBytes(bytes: Uint8Array): PetsciiSurface {
  const machine = new PetsciiMachine();
  machine.feed(bytes);
  return machine.state;
}

function inside(surface: PetsciiSurface, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < surface.cols && y < surface.rows;
}

const indexOf = (surface: PetsciiSurface, x: number, y: number): number => y * surface.cols + x;

/** The cell byte a brush puts down: its glyph, with the reverse bit set from the brush. */
const brushCode = (brush: PetsciiBrush): number =>
  (brush.screenCode & 0x7f) | (brush.reverse ? REVERSE_BIT : 0);

/** Petmate's Draw: the glyph AND the colour. */
export function stamp(surface: PetsciiSurface, x: number, y: number, brush: PetsciiBrush): PetsciiSurface {
  if (!inside(surface, x, y)) return surface;
  const next = cloneSurface(surface);
  const index = indexOf(surface, x, y);
  next.screen[index] = brushCode(brush);
  next.colorRam[index] = brush.color & 0x0f;
  return next;
}

/** Petmate's character-only draw: the glyph, over whatever colour was there. */
export function stampChar(surface: PetsciiSurface, x: number, y: number, brush: PetsciiBrush): PetsciiSurface {
  if (!inside(surface, x, y)) return surface;
  const next = cloneSurface(surface);
  next.screen[indexOf(surface, x, y)] = brushCode(brush);
  return next;
}

/** Petmate's colorize: the colour, under whatever glyph was there. */
export function colorize(surface: PetsciiSurface, x: number, y: number, color: number): PetsciiSurface {
  if (!inside(surface, x, y)) return surface;
  const next = cloneSurface(surface);
  next.colorRam[indexOf(surface, x, y)] = color & 0x0f;
  return next;
}

/**
 * Push a blank line in at row `y`, moving the rest down.
 *
 * A PETSCII screen is a FIXED 40x25 - that is the VIC's text screen, not a
 * preference - so this cannot make the picture taller. The bottom row falls
 * off, which is the row furthest from where the artist is working, and the
 * editor's undo is a stack of whole surfaces so one step puts it back.
 *
 * The blank is a space in the CURRENT colour rather than colour 0: a row
 * filled with black on a black screen is invisible, and an artist who adds a
 * line then types on it expects to see what they type.
 */
export function insertLine(surface: PetsciiSurface, y: number, color = 1): PetsciiSurface {
  if (y < 0 || y >= surface.rows) return surface;
  const next = cloneSurface(surface);
  const { cols, rows } = surface;

  for (let row = rows - 1; row > y; row--) {
    next.screen.set(surface.screen.subarray((row - 1) * cols, row * cols), row * cols);
    next.colorRam.set(surface.colorRam.subarray((row - 1) * cols, row * cols), row * cols);
  }
  next.screen.fill(0x20, y * cols, (y + 1) * cols);
  next.colorRam.fill(color & 0x0f, y * cols, (y + 1) * cols);
  return next;
}

/**
 * Take row `y` out, pulling the rest up and blanking the last row.
 *
 * The screen keeps its height for the same reason `insertLine` does not grow
 * it: 40x25 is the hardware, and a picture 24 rows tall is a 25-row screen
 * with a blank one at the bottom.
 */
export function removeLine(surface: PetsciiSurface, y: number, color = 1): PetsciiSurface {
  if (y < 0 || y >= surface.rows) return surface;
  const next = cloneSurface(surface);
  const { cols, rows } = surface;

  for (let row = y; row < rows - 1; row++) {
    next.screen.set(surface.screen.subarray((row + 1) * cols, (row + 2) * cols), row * cols);
    next.colorRam.set(surface.colorRam.subarray((row + 1) * cols, (row + 2) * cols), row * cols);
  }
  next.screen.fill(0x20, (rows - 1) * cols, rows * cols);
  next.colorRam.fill(color & 0x0f, (rows - 1) * cols, rows * cols);
  return next;
}

/**
 * Flood fill from a cell.
 *
 * "The same cell" is the PAIR - the screen code INCLUDING its reverse bit,
 * and the colour. A black space and a white space look identical on a black
 * screen and are not the same cell, and an artist who fills one does not
 * expect the other to go. An explicit stack rather than recursion: 1,000
 * cells is fine either way, but a stack has no depth to reason about.
 */
export function floodFill(surface: PetsciiSurface, x: number, y: number, brush: PetsciiBrush): PetsciiSurface {
  if (!inside(surface, x, y)) return surface;

  const start = indexOf(surface, x, y);
  const wantCode = surface.screen[start];
  const wantColor = surface.colorRam[start] & 0x0f;
  const code = brushCode(brush);
  const color = brush.color & 0x0f;
  // Filling a cell with what it already holds spreads nothing and would
  // otherwise never terminate, because every filled cell still matches.
  if (wantCode === code && wantColor === color) return surface;

  const next = cloneSurface(surface);
  const stack: number[] = [start];
  while (stack.length > 0) {
    const index = stack.pop() as number;
    if (next.screen[index] !== wantCode || (next.colorRam[index] & 0x0f) !== wantColor) continue;
    next.screen[index] = code;
    next.colorRam[index] = color;

    const cx = index % surface.cols;
    const cy = Math.floor(index / surface.cols);
    if (cx > 0) stack.push(index - 1);
    if (cx < surface.cols - 1) stack.push(index + 1);
    if (cy > 0) stack.push(index - surface.cols);
    if (cy < surface.rows - 1) stack.push(index + surface.cols);
  }
  return next;
}

/**
 * Type one PETSCII byte at the cursor, and say where the cursor goes.
 *
 * The byte is converted with the shared table, never with a second one. Past
 * the last column the cursor wraps to the next row; in the very last cell it
 * STAYS - a C64 would scroll there, and an editor that scrolled would push
 * the artist's own top row off the screen.
 */
export function typeChar(
  surface: PetsciiSurface,
  x: number,
  y: number,
  petscii: number,
  color: number,
  reverse: boolean,
): { surface: PetsciiSurface; cursor: { x: number; y: number } } {
  if (!inside(surface, x, y)) return { surface, cursor: { x, y } };

  const drawn = stamp(surface, x, y, {
    screenCode: printablePetsciiToScreenCode(petscii),
    color,
    reverse,
  });

  if (x < surface.cols - 1) return { surface: drawn, cursor: { x: x + 1, y } };
  if (y < surface.rows - 1) return { surface: drawn, cursor: { x: 0, y: y + 1 } };
  return { surface: drawn, cursor: { x, y } };
}

/** The rectangle between two dragged corners, in either order. */
export function liftRegion(
  surface: PetsciiSurface,
  a: { x: number; y: number },
  b: { x: number; y: number },
): PetsciiRegion {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const x1 = Math.min(surface.cols - 1, Math.max(a.x, b.x));
  const y1 = Math.min(surface.rows - 1, Math.max(a.y, b.y));
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;

  const screen = new Uint8Array(cols * rows);
  const colorRam = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const from = indexOf(surface, x0 + col, y0 + row);
      screen[row * cols + col] = surface.screen[from];
      colorRam[row * cols + col] = surface.colorRam[from];
    }
  }
  return { cols, rows, screen, colorRam };
}

/**
 * Stamp a lifted region with its top-left at `x,y`.
 *
 * Anything past the right or bottom edge is CLIPPED, never wrapped: a brush
 * dragged off the edge should lose what went over, not reappear on the next
 * row.
 */
export function stampRegion(
  surface: PetsciiSurface,
  x: number,
  y: number,
  region: PetsciiRegion,
): PetsciiSurface {
  const next = cloneSurface(surface);
  for (let row = 0; row < region.rows; row++) {
    for (let col = 0; col < region.cols; col++) {
      const tx = x + col;
      const ty = y + row;
      if (!inside(surface, tx, ty)) continue;
      const to = indexOf(surface, tx, ty);
      next.screen[to] = region.screen[row * region.cols + col];
      next.colorRam[to] = region.colorRam[row * region.cols + col];
    }
  }
  return next;
}

/**
 * The screen's background, and its border with it.
 *
 * A C64 ties them - CCGMS's `$02 <colour>` sets both, which is what the
 * machine reads and what `writeSeq` writes - so the model ties them too
 * rather than offering a border that no file could carry.
 */
export function setBackground(surface: PetsciiSurface, color: number): PetsciiSurface {
  const next = cloneSurface(surface);
  next.background = color & 0x0f;
  next.border = color & 0x0f;
  return next;
}

/** The charset bank the screen asks for. The art is screen codes, so nothing moves. */
export function setCharsetBank(surface: PetsciiSurface, bank: 0 | 1): PetsciiSurface {
  const next = cloneSurface(surface);
  next.charsetBank = bank;
  return next;
}

/** Blank every cell. The background and the bank are the screen's, not the art's, and stay. */
export function clearSurface(surface: PetsciiSurface): PetsciiSurface {
  const next = cloneSurface(surface);
  next.screen.fill(SPACE);
  next.colorRam.fill(surface.pen & 0x0f);
  return next;
}
