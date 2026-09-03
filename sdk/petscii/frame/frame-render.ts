/**
 * FrameDiffRenderer: a 40x25 target frame -> the minimal ANSI that makes
 * AnsiToPetsciiTransducer paint it. The run walk itself is the SDK's shared
 * differ (`sdk/common/run-diff.ts`): cursor-address each run of changed
 * cells, set colour/reverse only when they change inside the run, print the
 * characters. This module is the C64 half of it - what a cell's attribute
 * state is, which cells may not be painted, and what frames the render.
 * The transducer dedups every colour/reverse byte against its KERNAL oracle,
 * so repeating an SGR at the start of a run costs nothing on the wire while
 * keeping every run self-contained.
 *
 * First frame (no previous, or a size change): clear + home + every
 * non-blank cell. Bold and background are never emitted - the C64 has
 * neither; foreground goes out as truecolor from the VIC palette entry so
 * nearestVicForRgb() lands on the same index (the round-trip test pins it).
 * Cell.bg therefore never reaches the wire: this renderer never emits a
 * background SGR at all - background policy lives with the machine /
 * transducer, not here.
 *
 * The bottom-right cell is never painted: a print there scrolls the KERNAL
 * screen (the transducer's fillRow has the same cap). Every render ends
 * with SGR 0 and a CUP to the frame's cursor.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
import { renderRunDiff } from '../../common/run-diff';
import { C64_PALETTE_COLODORE, vicToSgrForeground } from '../c64-palette';
import { Cell, Cursor, Frame, isBlank, sameCell } from './types';

const TARGET_COLS = 40;
const TARGET_ROWS = 25;

/** 1-based CUP for a cursor, clamped into the target grid. */
export function cupTo(cursor: Readonly<Cursor>, cols = TARGET_COLS, rows = TARGET_ROWS): string {
  const x = Math.max(0, Math.min(cols - 1, cursor.x));
  const y = Math.max(0, Math.min(rows - 1, cursor.y));
  return `\x1b[${y + 1};${x + 1}H`;
}

/** Reverse-video state + truecolor foreground for one cell. Bold and background are deliberately absent. */
function sgrFor(c: Readonly<Cell>, palette: readonly string[]): string {
  return (c.rvs ? '\x1b[7m' : '\x1b[27m') + vicToSgrForeground(c.fg, palette);
}

export function renderDiff(
  prev: Frame | null,
  next: Frame,
  cols = TARGET_COLS,
  rows = TARGET_ROWS,
  palette: readonly string[] = C64_PALETTE_COLODORE,
): string {
  if (next.cols !== cols || next.rows !== rows) {
    throw new RangeError(`renderDiff: frame is ${next.cols}x${next.rows}, target is ${cols}x${rows}`);
  }
  const full = prev === null || prev.cols !== cols || prev.rows !== rows;
  const runs = renderRunDiff<Readonly<Cell>>({
    cols,
    rows,
    cell: (x, y) => next.cells[y][x],
    // A first paint is "every non-blank cell", which is not a comparison
    // against a blank frame: a space carrying a colour is blank here.
    changed: (x, y) => (full ? !isBlank(next.cells[y][x]) : !sameCell((prev as Frame).cells[y][x], next.cells[y][x])),
    sgr: (c) => sgrFor(c, palette),
    glyph: (c) => c.ch,
    // The cell that scrolls the C64.
    skipCell: (x, y) => x === cols - 1 && y === rows - 1,
  });
  return (full ? '\x1b[2J\x1b[H' : '') + runs + '\x1b[0m' + cupTo(next.cursor, cols, rows);
}

/** Full paint of `frame` (no previous frame): clear, home, every non-blank cell. */
export function renderFrame(frame: Frame, cols = TARGET_COLS, rows = TARGET_ROWS, palette: readonly string[] = C64_PALETTE_COLODORE): string {
  return renderDiff(null, frame, cols, rows, palette);
}
