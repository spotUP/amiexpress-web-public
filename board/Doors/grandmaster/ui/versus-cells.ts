/**
 * What one cell of a versus board is made of.
 *
 * Pulled out of versus-screen.ts, which crossed the 2000-line ceiling: these
 * are pure glyph decisions with one input the screen owns - whether a cell can
 * carry a BACKGROUND colour. PETSCII cannot, so anything that put its ink in
 * `{black-fg}` and its colour behind it rendered black on black.
 */

import { cellsCanCarryBackground } from './block-width';
import { HARD_BLOCK_ITEM } from '../core/items';

/** Preview colours, one table for the next queue and the hold box alike. */
export const PREVIEW_COLORS: Record<string, string> = {
  I: 'cyan', O: 'yellow', T: 'magenta',
  S: 'green', Z: 'red', J: 'blue', L: 'white',
};

/** Background colour used to render a TGM item cell, keyed by piece type. */
const ITEM_CELL_COLORS: Record<string, string> = {
  I: 'cyan', O: 'yellow', T: 'magenta', S: 'green', Z: 'red', J: 'blue', L: 'white',
};

/** A locked or falling block, in its piece's colour. */
export function blockChar(type: string): string {
  const colour = PREVIEW_COLORS[type] ?? 'gray';
  return `{${colour}-fg}██{/${colour}-fg}`;
}

/**
 * A TGM item cell (see core/items.ts) - inverse-video diamonds, so a piece
 * carrying an item is distinct from a normal locked one. A hard block (item
 * 25's target cell) gets its own grey marker: it can never be collected.
 *
 * On a screen with no per-cell background the colour goes in the INK instead,
 * or every item cell is black on black and reads as a hole in the stack.
 */
export function itemCellChar(item: number, color: string | null, screen: unknown): string {
  const flat = !cellsCanCarryBackground(screen);

  if (item === HARD_BLOCK_ITEM) {
    return flat
      ? '{white-fg}##{/white-fg}'
      : '{white-bg}{black-fg}##{/black-fg}{/white-bg}';
  }
  const bg = ITEM_CELL_COLORS[color ?? ''] ?? 'gray';
  // PETSCII HAS NO DIAMOND. U+25C6 is not in the character ROM and reaches
  // the glass as '?', which is what a caller saw when an item piece landed:
  // "one block turned into ???". A shaded block is a glyph it does have
  // ($66) and still reads as "not an ordinary block".
  return flat
    ? `{${bg}-fg}▒▒{/${bg}-fg}`
    : `{${bg}-bg}{black-fg}◆◆{/black-fg}{/${bg}-bg}`;
}
