/**
 * The board renderer.
 *
 * The hazard this file exists for is the coordinate flip: the engine numbers
 * rows from the BOTTOM (row 1 is the lowest in play, row 0 is below the floor)
 * and a cell buffer numbers them from the TOP. Get that backwards and the game
 * renders upside down while every engine test stays green.
 */

import assert from 'assert';
import { join } from 'path';
import { loadSpriteSheet, Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { Stack } from '../../core/panels/stack';
import { GeneratorSource } from '../../core/panels/generator-source';
import { getModern } from '../../core/panels/level-data';
import {
  buildBoard, boardSize, bufferRowFor, animationFor, PANEL_COLS,
} from '../../ui/panels/board-view';

const SHEET: Record<string, Sprite> = loadSpriteSheet(join(__dirname, '..', '..', 'sprites'));

function makeStack(): Stack {
  const stack = new Stack({
    levelData: getModern(1), panelSource: new GeneratorSource(1, true),
  });
  stack.startingState();
  return stack;
}

export async function theBoardIsTwelveCharactersWideAndThirteenTall(): Promise<void> {
  const stack = makeStack();
  const size = boardSize(stack);

  assert.strictEqual(size.cols, stack.width * PANEL_COLS, 'six panels at two characters each');
  assert.strictEqual(size.rows, stack.height + 1, 'twelve rows in play, plus the incoming one');

  const board = buildBoard(stack, SHEET, 0);
  assert.strictEqual(board.length, 13);
  for (const row of board) assert.strictEqual(row.length, 12);
}

/**
 * The flip, stated directly. Engine row 1 is the bottom of the playfield and
 * must land on the LAST buffer row of the playfield; engine row 12 is the top
 * and lands on buffer row 0.
 */
export async function theEngineRowsMapOntoBufferRowsUpsideDown(): Promise<void> {
  const stack = makeStack();
  assert.strictEqual(bufferRowFor(stack, stack.height), 0, 'the top row paints first');
  assert.strictEqual(bufferRowFor(stack, 1), stack.height - 1, 'the bottom row paints last');
  assert.strictEqual(bufferRowFor(stack, 0), stack.height, 'and the incoming row below that');
}

/**
 * The board is drawn the right way up: after startingState the panels sit at
 * the BOTTOM of the screen, not the top.
 */
export async function theStackIsDrawnSittingOnTheFloor(): Promise<void> {
  const stack = makeStack();
  const board = buildBoard(stack, SHEET, 0, { showCursor: false });

  const filled = (y: number) => board[y].some((cell) => cell !== null);

  assert.ok(filled(board.length - 1), 'the incoming row is drawn');
  assert.ok(filled(board.length - 2), 'and the bottom of the playfield is full');
  assert.ok(!filled(0), 'while the top of the playfield is empty at the start');
}

export async function everyPanelOccupiesExactlyTwoColumns(): Promise<void> {
  const stack = makeStack();
  const board = buildBoard(stack, SHEET, 0, { showCursor: false });

  // A panel is blitted as a pair, so a drawn cell always has a drawn partner.
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board[y].length; x += PANEL_COLS) {
      const left = board[y][x];
      const right = board[y][x + 1];
      assert.strictEqual(
        left === null, right === null,
        `half a panel drawn at row ${y}, column ${x}`,
      );
    }
  }
}

/**
 * `matched` covers both halves of a clear: the flash, then the face. Which one
 * is a comparison of the panel's timer against FACE, not a separate state.
 */
export async function aMatchedPanelFlashesThenShowsItsFace(): Promise<void> {
  const stack = makeStack();
  const panel = stack.panels[2][2];
  panel.color = 1;
  panel.match(false, 1, 3);

  assert.strictEqual(animationFor(panel, stack), 'flash', 'flashing first');

  panel.timer = panel.frameTimes.FACE;
  assert.strictEqual(animationFor(panel, stack), 'face', 'then holding the face');
}

export async function panelsNearTheTopDrawThemselvesInDanger(): Promise<void> {
  const stack = makeStack();

  const low = stack.panels[3][2];
  low.color = 1;
  low.state = 'normal';
  assert.strictEqual(animationFor(low, stack), 'normal');

  const high = stack.panels[stack.height][2];
  high.color = 1;
  high.state = 'normal';
  assert.strictEqual(animationFor(high, stack), 'danger', 'the top rows pulse');
}

export async function aPoppedPanelDrawsNothing(): Promise<void> {
  const stack = makeStack();
  const panel = stack.panels[2][2];
  panel.color = 1;
  panel.state = 'popped';
  assert.strictEqual(animationFor(panel, stack), null, 'it is gone; the cell is empty');
}

export async function theCursorIsDrawnOverTheTwoPanelsItHolds(): Promise<void> {
  const stack = makeStack();
  stack.curRow = 3;
  stack.curCol = 2;

  const board = buildBoard(stack, SHEET, 0);
  const y = bufferRowFor(stack, 3);
  const left = (2 - 1) * PANEL_COLS;
  const right = left + PANEL_COLS * 2 - 1;

  assert.strictEqual(board[y][left]?.char, '[', 'a bracket on the left edge');
  assert.strictEqual(board[y][right]?.char, ']', 'and one on the right');
  assert.strictEqual(right - left, 3, 'the cursor spans two panels, four characters');
}

/**
 * The C64 variant must never carry a background: PETSCII has none, so one would
 * be dropped on the way to the glass and the board would stop matching the
 * sheet it was drawn from.
 */
export async function theC64VariantDrawsNoBackgrounds(): Promise<void> {
  const stack = makeStack();
  const board = buildBoard(stack, SHEET, 0, { variant: 'c64', showCursor: false });

  for (const row of board) {
    for (const cell of row) {
      if (cell) assert.strictEqual(cell.bg, 0, `C64 board painted background ${cell.bg}`);
    }
  }
}

/** Animation is clocked by the game tick, so the same frame always draws alike. */
export async function theSameTickAlwaysDrawsTheSameBoard(): Promise<void> {
  const stack = makeStack();
  const first = buildBoard(stack, SHEET, 42);
  const second = buildBoard(stack, SHEET, 42);
  assert.deepStrictEqual(first, second);
}
