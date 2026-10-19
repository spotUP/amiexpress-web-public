/**
 * Cell grids to bytes: Amiga ANSI rows (latin1), PETSCII rows (.seq bytes),
 * and the blessed tag text the live video relay speaks.
 */

import { vicColorToPetscii } from '../../petscii/ansi-to-petscii';
import { asciiToPetsciiByte } from '../../petscii/ascii-to-petscii';
import { AMIGA16_NAMES } from './color';
import type { AnsiCellGrid } from './convert';

/**
 * Amiga ANSI rows as latin1 strings. Colour is written the way art programs
 * write it (and the board's readers parse it): `ESC[0;1;3Fm` with the bold
 * bit for a bright foreground, then `;4B` for the background (0-7). Each row
 * is self-contained: it opens by setting its colours and ends with `ESC[0m`.
 */
export function cellsToAnsiRows(cells: AnsiCellGrid): string[] {
  return cells.map((row) => {
    let out = '';
    let last = '';
    for (const cell of row) {
      const sgr = `\x1b[0;${cell.fg >= 8 ? '1;' : ''}${30 + (cell.fg & 7)};${40 + (cell.bg & 7)}m`;
      if (sgr !== last) {
        out += sgr;
        last = sgr;
      }
      out += cell.char;
    }
    return out + '\x1b[0m';
  });
}

/**
 * PETSCII rows: a colour control byte whenever the foreground changes, then
 * the character's PETSCII byte. The C64 has one background, so a cell's bg
 * is not written (the converter makes it black for the c64 palette). Cell
 * foregrounds are VIC colour numbers. Rows carry no carriage return.
 */
export function cellsToPetsciiRows(cells: AnsiCellGrid): Uint8Array[] {
  return cells.map((row) => {
    const bytes: number[] = [];
    let last = -1;
    for (const cell of row) {
      if (cell.fg !== last) {
        bytes.push(vicColorToPetscii(cell.fg));
        last = cell.fg;
      }
      bytes.push(asciiToPetsciiByte(cell.char.charCodeAt(0), 1).byte);
    }
    return Uint8Array.from(bytes);
  });
}

/**
 * Blessed tag text ({red-fg}{blue-bg}x{/}), rows joined by newlines. This is
 * what `video:frame` carries. Tags are only written when the colours change;
 * `background: false` writes foreground tags alone.
 */
export function cellsToBlessedTags(cells: AnsiCellGrid, opts: { background?: boolean } = {}): string {
  const background = opts.background ?? true;
  return cells
    .map((row) => {
      let out = '';
      let lastFg = -1;
      let lastBg = -1;
      for (const cell of row) {
        const bg = background ? cell.bg : -1;
        if (cell.fg !== lastFg || bg !== lastBg) {
          if (lastFg >= 0) out += '{/}';
          out += `{${AMIGA16_NAMES[cell.fg]}-fg}`;
          if (background) out += `{${AMIGA16_NAMES[cell.bg]}-bg}`;
          lastFg = cell.fg;
          lastBg = bg;
        }
        out += cell.char;
      }
      return lastFg >= 0 ? out + '{/}' : out;
    })
    .join('\n');
}
