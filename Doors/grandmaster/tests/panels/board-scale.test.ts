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
import { panelsLayout, panelScale, hudLines, CELL_ASPECT } from '../../ui/panels/layout';
import { buildBoard, scaleBuffer, boardSize } from '../../ui/panels/board-view';
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
 * A PETSCII CELL IS SQUARE, and that changes what a tile may be.
 *
 * The first version of this scaling bounded the SCALE and not the SHAPE, which
 * is not the same thing: a scale of 3 is harmless on a terminal whose cells
 * are twice as tall as they are wide, and on a C64 it produced tiles six
 * characters wide and one row tall. A caller photographed the smear.
 *
 * On 40x25 the rows are already spent - twelve playfield rows plus the
 * incoming row - so height cannot grow to match, and the widest a tile may go
 * is the 2x1 it was drawn as. That leaves the board narrower than the screen,
 * which is the honest answer: on a square-celled screen with 25 rows there is
 * no tile that is both square and large.
 */
export async function aPetsciiTileIsNeverStretchedIntoASmear(): Promise<void> {
  const layout = panelsLayout(40, 25, COLS, ROWS, CELL_ASPECT.petscii);

  assert.strictEqual(layout.stacked, true, 'the HUD goes under it');
  assert.strictEqual(layout.scale.y, 1, 'the rows are already spent by the playfield');

  const looksLike = (2 * layout.scale.x * CELL_ASPECT.petscii) / layout.scale.y;
  assert.ok(looksLike <= 2, `a tile ${looksLike}:1 wide is a smear, not a panel`);
  assert.ok(fitsOn(40, 25));
}

/** Give PETSCII the rows and it grows, still without smearing. */
export async function aTallPetsciiScreenGrowsTheBoard(): Promise<void> {
  const layout = panelsLayout(40, 50, COLS, ROWS, CELL_ASPECT.petscii);

  assert.ok(layout.scale.y > 1, 'rows to spare are spent on the board');
  const looksLike = (2 * layout.scale.x * CELL_ASPECT.petscii) / layout.scale.y;
  assert.ok(looksLike <= 2, `${looksLike}:1`);
  assert.ok(fitsOn(40, 50));
}

/** Whatever the screen and whatever its cells, a tile stays a tile. */
export async function noScreenProducesASmear(): Promise<void> {
  for (const aspect of [CELL_ASPECT.terminal, CELL_ASPECT.petscii]) {
    for (let w = 30; w <= 160; w += 7) {
      for (let h = 20; h <= 60; h += 6) {
        const { scale } = panelsLayout(w, h, COLS, ROWS, aspect);
        const looksLike = (2 * scale.x * aspect) / scale.y;
        assert.ok(
          looksLike <= 2,
          `${w}x${h} at cell aspect ${aspect}: tile is ${looksLike}:1`,
        );
      }
    }
  }
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
      scale.x <= scale.y * 2,
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

/**
 * THE C64 TILE IS 2x2, and the incoming row is what pays for it.
 *
 * Twelve panel rows at double height need 24 of a C64's 25 rows; a thirteenth
 * row - the incoming one panel-attack dims under the stack - would need 26.
 * The choice was a 12x24 board a player can read or a 6x13 one with a warning
 * row under it, and the sysop asked for the bigger tile: "can we make the
 * pieces bigger in tetris attack in petscii mode?" (2026-09-06). The border
 * and one of the HUD's two rows go with it.
 *
 * Pinned because it is a TRADE, not an improvement: whoever puts the incoming
 * row back has to take the tile down to 1x1, and should see that here.
 */
export async function theC64TileIsAsBigAsTwentyFiveRowsAllow(): Promise<void> {
  const opts = { variant: 'c64' as const, showIncomingRow: false };
  const { cols, rows } = boardSize(stackOf(), opts);

  assert.strictEqual(cols, 6, 'six panels, one character each');
  assert.strictEqual(rows, 12, 'and no incoming row, which is what buys the height');

  const layout = panelsLayout(40, 25, cols, rows, CELL_ASPECT.petscii);
  assert.deepStrictEqual(layout.scale, { x: 2, y: 2 }, 'a 2x2 tile, square on a square cell');
  assert.strictEqual(layout.board.width, 12);
  assert.strictEqual(layout.board.height, 24);
  assert.strictEqual(layout.border, false, 'there is no room for a frame as well');
  assert.strictEqual(layout.hud.height, 1, 'and the HUD gives up one of its two rows');
  assert.strictEqual(
    layout.board.top + layout.board.height + layout.hud.height, 25,
    'board and HUD fill the screen exactly - a row more would not fit',
  );
}

/** The terminal is untouched: it has rows to spare and keeps its frame. */
export async function aTerminalKeepsItsFrameAndItsIncomingRow(): Promise<void> {
  const { rows } = boardSize(stackOf(), { variant: 'wide', showIncomingRow: true });
  assert.strictEqual(rows, 13, 'the incoming row is drawn on a terminal');

  const layout = panelsLayout(80, 25, 12, rows, CELL_ASPECT.terminal);
  assert.strictEqual(layout.border, true, '80 columns still frames the board');
}

/**
 * The board is the ONLY thing on the screen it opens on.
 *
 * Every other screen in this door clears the previous one first; this one did
 * not, so TETRIS ATTACK painted over whatever the player came from - a
 * TetriNET Stats panel and half a NEXT box, still at the columns an
 * 80-column layout had put them. What that looks like is a broken 40-column
 * layout: "tetris attack looks like it's 80 columns? layout broken"
 * (2026-09-06). The leftovers were another screen's.
 */
export async function theBoardOpensOnACleanScreen(): Promise<void> {
  const { Screen } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
  const { createBox } = require('@amiexpress/bbs-door-sdk/utils/blessed-helpers');
  const { PanelsScreen } = require('../../ui/panels-screen');
  const { loadSpriteSheet } = require('@amiexpress/bbs-door-sdk/engines/graphics/cell-art');
  const path = require('path');

  const screen: any = new Screen({ title: 'clean', width: 40, height: 25, responsive: true });

  // What the player came from: another screen's furniture, at its columns.
  createBox({ parent: screen, top: 17, left: 26, width: 26, height: 4, label: ' Stats ' });
  createBox({ parent: screen, top: 0, left: 26, width: 13, height: 6, label: ' Next ' });
  const before = screen.children.length;
  assert.ok(before >= 2, 'the fixture put something on the screen to leave behind');

  const panels: any = new PanelsScreen({
    screen,
    stack: stackOf(),
    sheet: loadSpriteSheet(path.join(__dirname, '..', '..', 'sprites')),
    sounds: { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} },
    readInput: () => ({}),
    variant: 'c64',
  });
  panels.setupUI();

  const labels = screen.children
    .map((child: any) => String(child.options?.label ?? ''))
    .filter(Boolean);
  assert.ok(
    !labels.some((label: string) => /Stats|Next/.test(label)),
    `another screen's panels are still on the glass: ${labels.join(', ')}`,
  );

  screen.destroy();
}

/**
 * The compact HUD is ONE LINE, and it says more than the score.
 *
 * It returned seven lines to be stacked in a column - the shape of a HUD that
 * sits BESIDE the board, not under it. With two rows a player saw two of
 * them; once the C64 board took the height it needed there was one row, and
 * the screen showed a lone `P0`: "size is good but... no hud?" (2026-09-06).
 */
export async function theCompactHudFitsItsOneRow(): Promise<void> {
  const layout = panelsLayout(40, 25, 6, 12, CELL_ASPECT.petscii);
  assert.strictEqual(layout.hud.height, 1, 'the C64 HUD has exactly one row');

  const quiet = hudLines(layout, {
    score: 0, speed: 1, timeText: "0'00", chain: 0, stopped: false,
  });
  assert.strictEqual(quiet.length, 1, 'one row means one line');
  assert.match(quiet[0], /P0/, 'the score is on it');
  assert.match(quiet[0], /L1/, 'and the level');
  assert.match(quiet[0], /0'00/, 'and the clock');

  // What a player reads mid-game comes first: the chain and the stop clock
  // decide the next swap.
  const busy = hudLines(layout, {
    score: 12480, speed: 7, timeText: "3'42", chain: 5, stopped: true,
  });
  assert.strictEqual(busy.length, 1);
  assert.ok(busy[0].indexOf('x5') < busy[0].indexOf('P12480'), 'the chain leads');
  assert.ok(busy[0].includes('STOP'));

  for (const line of [...quiet, ...busy]) {
    assert.ok(
      line.replace(/\{[^}]*\}/g, '').length <= layout.hud.width,
      `the HUD line does not fit its box: "${line}"`,
    );
  }
}

/** A number is never cut in half; a whole field goes instead. */
export async function theCompactHudDropsFieldsRatherThanDigits(): Promise<void> {
  const layout = panelsLayout(40, 25, 6, 12, CELL_ASPECT.petscii);
  const [line] = hudLines(layout, {
    score: 999999999, speed: 99, timeText: "99'59", chain: 9, stopped: true,
    movesLeft: 99, canUndo: true,
  });

  assert.ok(line.length <= layout.hud.width, 'it fits');
  assert.ok(
    !/P9999999[^9]|P99999999$/.test(line) || line.includes('P999999999'),
    `the score was sliced mid-number: "${line}"`,
  );
}
