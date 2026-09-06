/**
 * The board grows into the screen it is given.
 *
 * A panel is 2x1 characters at its smallest, which reads square on a terminal
 * whose cells are twice as tall as they are wide. That is right on an 80x25
 * screen and wrong on a phone: the playfield was twelve columns of forty and
 * the rest was black ("the playfield should use the full phone width").
 *
 * On a C64 it is wrong for a second reason - a PETSCII cell IS square, so a
 * 2x1 panel is a 2:1 rectangle. Square tiles there would mean a 6-column
 * board, because twelve playfield rows plus the incoming row already spend all
 * 25 of the screen's rows and 2x2 tiles need 26. Asked to choose, the sysop
 * took the wide tile that fills the screen over the square one in a corner of
 * it, and these pin that choice.
 */

import assert from 'assert';
import { panelsLayout, panelScale } from '../../ui/panels/layout';
import { buildBoard, scaleBuffer } from '../../ui/panels/board-view';
import { Stack } from '../../core/panels/stack';
import { GeneratorSource } from '../../core/panels/generator-source';
import { getClassicEndless } from '../../core/panels/level-data';

const COLS = 12;
const ROWS = 13;

function stackOf(): Stack {
  const stack = new Stack({
    levelData: getClassicEndless('normal'),
    panelSource: new GeneratorSource(99, true),
  });
  stack.startingState();
  return stack;
}

/** Nothing may be drawn outside the screen it was laid out for. */
function fitsOn(width: number, height: number): boolean {
  const layout = panelsLayout(width, height, COLS, ROWS);
  const boardFits = layout.board.left + layout.board.width <= width
    && layout.board.top + layout.board.height <= height;
  const hudFits = layout.hud.left + layout.hud.width <= width
    && layout.hud.top + layout.hud.height <= height;
  return boardFits && hudFits;
}

/** The classic screen is untouched: a merge or a resize must not restyle it. */
export async function theEightyColumnBoardIsUnchanged(): Promise<void> {
  const layout = panelsLayout(80, 25, COLS, ROWS);

  assert.deepStrictEqual(layout.scale, { x: 1, y: 1 });
  assert.strictEqual(layout.board.width, 12);
  assert.strictEqual(layout.board.height, 13);
  assert.strictEqual(layout.stacked, false, 'the HUD sits beside it, as it always has');
}

/**
 * A C64 fills its width. The tile stretches rather than staying square,
 * because square would mean a six-column board on a screen with 25 rows.
 */
export async function theC64BoardFillsTheScreen(): Promise<void> {
  const layout = panelsLayout(40, 25, COLS, ROWS);

  assert.strictEqual(layout.stacked, true, 'the HUD goes under it');
  assert.ok(layout.board.width >= 30, `only ${layout.board.width} of 40 columns used`);
  assert.strictEqual(layout.scale.y, 1, 'the rows are already spent by the playfield');
  assert.ok(fitsOn(40, 25));
}

/** A phone held upright gives the board the width AND the height. */
export async function aPortraitPhoneGrowsTheBoardBothWays(): Promise<void> {
  const layout = panelsLayout(40, 50, COLS, ROWS);

  assert.strictEqual(layout.stacked, true);
  assert.ok(layout.scale.x > 1 && layout.scale.y > 1, `got ${layout.scale.x}x${layout.scale.y}`);
  assert.ok(layout.board.width >= 30, 'most of the width is playfield');
  assert.ok(fitsOn(40, 50));
}

/**
 * A tile keeps its shape wherever the HUD sits beside the board.
 *
 * Scaling the axes independently is how an 80-column terminal briefly got 4x1
 * tiles - eight characters wide, one row tall, which is not a panel but a
 * dash.
 */
export async function aTileKeepsItsShapeWhenTheHudIsBesideIt(): Promise<void> {
  for (const [w, h] of [[132, 43], [80, 50], [100, 30]] as Array<[number, number]>) {
    const layout = panelsLayout(w, h, COLS, ROWS);
    if (layout.stacked) continue;
    assert.strictEqual(
      layout.scale.x, layout.scale.y,
      `${w}x${h}: ${layout.scale.x}x${layout.scale.y} is not the shape the panel was drawn`,
    );
  }
}

/** Whatever the screen, nothing is drawn off the edge of it. */
export async function everyScreenSizeFitsWhatItDraws(): Promise<void> {
  for (let w = 30; w <= 160; w += 7) {
    for (let h = 20; h <= 60; h += 6) {
      assert.ok(fitsOn(w, h), `${w}x${h} draws outside itself`);
    }
  }
}

/** The stretch is bounded, so a wide screen cannot make a tile a smear. */
export async function theStretchIsBounded(): Promise<void> {
  for (let w = 30; w <= 200; w += 5) {
    const scale = panelScale(w, 60, COLS, ROWS, true);
    assert.ok(
      scale.x <= scale.y + 2,
      `${w} columns gave ${scale.x}x${scale.y}, which is a dash rather than a tile`,
    );
  }
}

/** Enlarging repeats whole cells: a flat tile scaled is the same tile. */
export async function scalingRepeatsCellsExactly(): Promise<void> {
  const buffer = [[{ char: 'a', fg: 1, bg: 2 }, null]];
  const scaled = scaleBuffer(buffer, { x: 3, y: 2 });

  assert.strictEqual(scaled.length, 2, 'two rows');
  assert.strictEqual(scaled[0].length, 6, 'six columns');
  for (const row of scaled) {
    assert.deepStrictEqual(row.slice(0, 3).map(c => c?.char), ['a', 'a', 'a']);
    assert.deepStrictEqual(row.slice(3), [null, null, null]);
  }
  // And a copy, never the same object twice - a shared cell would let one
  // repaint bleed across the tile.
  assert.notStrictEqual(scaled[0][0], scaled[1][0]);
}

export async function scalingByOneChangesNothing(): Promise<void> {
  const buffer = [[{ char: 'a', fg: 1, bg: 2 }]];
  assert.strictEqual(scaleBuffer(buffer, { x: 1, y: 1 }), buffer);
}

/** The drawn board really is the scaled size, and the cursor scales with it. */
export async function theDrawnBoardIsTheScaledSize(): Promise<void> {
  const stack = stackOf();
  const sheet = require('@amiexpress/bbs-door-sdk/engines/graphics/cell-art')
    .loadSpriteSheet(require('path').join(__dirname, '..', '..', 'sprites'));

  const board = buildBoard(stack, sheet, 0, { scale: { x: 3, y: 2 } });
  assert.strictEqual(board.length, ROWS * 2);
  assert.strictEqual(board[0].length, COLS * 3);

  // One cursor, drawn once per row of the taller tile - not repeated per cell.
  const brackets = board.flat().filter(c => c?.char === '[' || c?.char === ']');
  assert.strictEqual(brackets.length, 2 * 2, 'two brackets, two rows tall');
}
