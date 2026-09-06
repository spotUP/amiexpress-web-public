/**
 * The panel board as cells: pure in (stack, sheet, tick).
 *
 * The same shape Pengo's and Frogger's renderers take, for the same reason:
 * what a thing looks like is decided by which sprite was blitted, so the class
 * of bug where a panel is coloured by whatever glyph happened to match cannot
 * happen here.
 *
 * TWO COORDINATE SYSTEMS MEET IN THIS FILE, and getting them confused is the
 * one real hazard. The engine numbers rows from the BOTTOM - row 1 is the
 * lowest row in play, row 0 is the dimmed row still below the floor. A cell
 * buffer numbers rows from the TOP, because that is the order they are painted
 * in. `bufferRowFor` is the only place that conversion is allowed to happen.
 *
 * The dimmed row is drawn, one row below the playfield, because it is a real
 * part of the game: it is what you are reading when you decide whether to raise.
 */

import {
  CellBuffer, Cell, Sprite, createBuffer, blitSprite,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import type { Panel } from '../../core/panels/panel';
import type { Stack } from '../../core/panels/stack';

/** Characters per panel. Fixed by the sprite sheets. */
export const PANEL_COLS = 2;

/** Which sheet to draw from. */
export type BoardVariant = 'wide' | 'c64';

/**
 * The empty well: blank.
 *
 * It is PAINTED blank rather than left unpainted, which is not the same thing.
 * An unpainted cell is a hole in the buffer, and a hole leaves whatever was
 * there last time - so a stack that falls leaves its own ghost behind. A blank
 * cell erases.
 *
 * A dot grid was tried here and rejected on sight: the board is meant to be
 * empty space, and a texture in it competes with the panels rather than
 * containing them. What contains them is the frame the screen draws.
 */
const WELL_CHAR = ' ';
/** The cursor is always the brightest thing on the board. */
const CURSOR_INK = 15;
const WIDE_WELL_INK = 8;
const C64_WELL_INK = 11;

/**
 * Sprite name by engine colour index. Colour 0 is empty and 9 is garbage;
 * neither is drawn from this table.
 */
const SPRITE_BY_COLOR: Readonly<Record<number, string>> = {
  1: 'heart',
  2: 'circle',
  3: 'triangle',
  4: 'star',
  5: 'diamond',
  6: 'inverse',
  7: 'square',
  8: 'shock',
};

/** The two rows near the top that pulse to warn the player. */
const DANGER_ROWS = 2;

/** Characters and rows per panel; 1x1 is the classic 2x1-character panel. */
export interface BoardScale {
  x: number;
  y: number;
}

export interface BoardViewOptions {
  /**
   * Grow every panel by this many characters and rows.
   *
   * The board is built at its natural size and then ENLARGED, rather than
   * every sprite being redrawn at every size: a panel is a solid tile, so a
   * bigger one is the same cells repeated, and the sprite sheet stays one
   * sheet. See panelScale in ./layout for what decides the number.
   */
  scale?: BoardScale;
  variant?: BoardVariant;
  /** Draw the cursor over the board. Off for an opponent's board. */
  showCursor?: boolean;
  /** Draw the dimmed incoming row beneath the playfield. */
  showIncomingRow?: boolean;
}

/** Buffer row for an engine row. Engine counts up from the floor; buffers down. */
export function bufferRowFor(stack: Stack, row: number): number {
  return stack.height - row;
}

/**
 * The engine row a buffer row shows: the inverse of bufferRowFor.
 *
 * It lives here, beside the mapping it inverts, because a caller that works it
 * out again gets it backwards - which is exactly what the mouse click handler
 * did, reading a click as `y + 1` and asking to swap the empty rows above the
 * stack instead of the ones under the pointer.
 */
export function engineRowFor(stack: Stack, bufferRow: number): number {
  return stack.height - bufferRow;
}

/** Board size in characters, including the dimmed row when it is shown. */
export function boardSize(
  stack: Stack, options: BoardViewOptions = {},
): { cols: number; rows: number } {
  const showIncoming = options.showIncomingRow !== false;
  return {
    cols: stack.width * PANEL_COLS,
    rows: stack.height + (showIncoming ? 1 : 0),
  };
}

/**
 * Which animation a panel should be drawn in.
 *
 * Mostly the panel's own state name, because the sheets are keyed by it. The
 * two that need deciding:
 *
 *  - `matched` covers both the flash and the face that follows it. The timer
 *    counts down through FLASH then FACE, so which half we are in is a
 *    comparison against FACE rather than a separate state.
 *  - a settled panel near the top draws itself as `danger`, which is a display
 *    concern the engine has no opinion about.
 */
export function animationFor(panel: Panel, stack: Stack): string | null {
  switch (panel.state) {
    case 'matched':
      return panel.timer > panel.frameTimes.FACE ? 'flash' : 'face';
    case 'popping':
      return 'popping';
    // A popped panel is gone; the cell it left is empty until something falls.
    case 'popped':
    case 'dead':
      return null;
    case 'dimmed':
      return 'dimmed';
    case 'swapping':
      return 'swapping';
    case 'falling':
      return 'falling';
    case 'hovering':
      return 'hovering';
    case 'landing':
      return 'landing';
    case 'normal':
    default:
      return panel.row > stack.height - DANGER_ROWS ? 'danger' : 'normal';
  }
}

/**
 * The empty playfield: a faint grid the stack sits in.
 *
 * A dot rather than a coloured ground, for two reasons. PETSCII has no
 * per-cell background at all, so a colour here would be dropped on a C64 and
 * the two screens would disagree about what the board is; and a dim dot reads
 * as a container on both without competing with the panels, which are solid
 * blocks.
 */
function paintWell(
  board: CellBuffer, cols: number, rows: number, variant: BoardVariant,
): void {
  const ink = variant === 'c64' ? C64_WELL_INK : WIDE_WELL_INK;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      board[y][x] = { char: WELL_CHAR, fg: ink, bg: 0 };
    }
  }
}

/** The sprite for a panel, or null if there is nothing to draw. */
function spriteFor(
  panel: Panel, sheet: Record<string, Sprite>, variant: BoardVariant,
): Sprite | null {
  if (panel.color === 0) return null;
  // Garbage is not a per-cell sprite: a block is drawn as one piece, because
  // that is what it is - panels of one block share a garbageId and an extent.
  if (panel.isGarbage || panel.color === 9) return null;

  const base = SPRITE_BY_COLOR[panel.color];
  if (!base) return null;
  const name = variant === 'c64' ? `panel-${base}-c64` : `panel-${base}`;
  return sheet[name] ?? null;
}

/**
 * Repeat every cell `scale.x` across and `scale.y` down.
 *
 * Nearest-neighbour on CELLS, which is exact rather than approximate: a panel
 * is a flat colour, so a tile twice the size is the same cell four times and
 * nothing is interpolated or lost.
 */
export function scaleBuffer(buffer: CellBuffer, scale: BoardScale): CellBuffer {
  if (scale.x <= 1 && scale.y <= 1) return buffer;

  const out: CellBuffer = [];
  for (const row of buffer) {
    const wide: Array<Cell | null> = [];
    for (const cell of row) {
      for (let i = 0; i < scale.x; i++) wide.push(cell ? { ...cell } : null);
    }
    for (let i = 0; i < scale.y; i++) out.push(wide.map(c => (c ? { ...c } : null)));
  }
  return out;
}

/**
 * The board, drawn.
 *
 * `tick` is the game's own frame counter, never wall clock - frameAt is a pure
 * function of it, so the same frame always draws the same thing and a test can
 * assert on it.
 */
export function buildBoard(
  stack: Stack,
  sheet: Record<string, Sprite>,
  tick: number,
  options: BoardViewOptions = {},
): CellBuffer {
  const variant = options.variant ?? 'wide';
  const showIncoming = options.showIncomingRow !== false;
  const { cols, rows } = boardSize(stack, options);
  const board = createBuffer(cols, rows);

  // THE WELL IS DRAWN FIRST, and it is drawn even where there is no panel.
  //
  // An empty cell used to paint nothing at all, so the terminal's own black
  // showed through and the gaps in a ragged stack read as holes punched in
  // space rather than as the empty board they are - which is exactly what a
  // caller saw: "why do we have black holes in the playfield".
  //
  // A panel game is mostly EMPTY board; the stack only fills the bottom third
  // for most of a game, so the empty cell is the one the player looks at
  // longest and it has to say "board".
  paintWell(board, cols, rows, variant);

  const lowestRow = showIncoming ? 0 : 1;
  for (let row = lowestRow; row <= stack.height; row++) {
    const rowPanels = stack.panels[row];
    if (!rowPanels) continue;

    for (let col = 1; col <= stack.width; col++) {
      const panel = rowPanels[col];
      if (!panel) continue;

      const sprite = spriteFor(panel, sheet, variant);
      if (!sprite) continue;

      // Row 0 always draws dimmed, whatever state it claims: it is below the
      // floor and not in play, and the engine leaves its state alone.
      const animation = row === 0 ? 'dimmed' : animationFor(panel, stack);
      if (!animation || !sprite.animations[animation]) continue;

      blitSprite(board, sprite, animation, tick, col - 1, bufferRowFor(stack, row));
    }
  }

  // The cursor is drawn AFTER the enlargement, at the enlarged size. Scaling
  // it with everything else would repeat the brackets - "[[" and "]]" at 2x -
  // instead of drawing one cursor around a bigger pair of panels.
  const scaled = scaleBuffer(board, options.scale ?? { x: 1, y: 1 });
  if (options.showCursor !== false) {
    drawCursor(scaled, stack, options.scale ?? { x: 1, y: 1 });
  }

  return scaled;
}

/**
 * The cursor, drawn over the two panels it holds.
 *
 * Brackets on the outer edges rather than a filled box: the panels underneath
 * have to stay readable, since choosing a swap means reading what is under the
 * cursor. Each cell keeps its own colours; only the glyph changes.
 */
export function drawCursor(
  board: CellBuffer, stack: Stack, scale: BoardScale = { x: 1, y: 1 },
): void {
  const top = bufferRowFor(stack, stack.curRow) * scale.y;
  if (top < 0 || top >= board.length) return;

  const left = (stack.curCol - 1) * PANEL_COLS * scale.x;
  const right = left + PANEL_COLS * 2 * scale.x - 1;

  // A taller tile gets a taller cursor, so the pair it holds stays framed.
  for (let row = top; row < Math.min(board.length, top + scale.y); row++) {
    markCursorCell(board, row, left, '[');
    markCursorCell(board, row, right, ']');
  }
}

function markCursorCell(board: CellBuffer, y: number, x: number, char: string): void {
  const row = board[y];
  if (!row || x < 0 || x >= row.length) return;

  const existing: Cell | null = row[x];
  // The cursor keeps the PANEL's ground, so it reads as a bracket around what
  // is under it - but never the ground's ink. Over empty board that ink is the
  // well's dim grey, and a cursor the same grey as the dots behind it is a
  // cursor the player cannot find.
  row[x] = { char, fg: CURSOR_INK, bg: existing ? existing.bg : 0 };
}
