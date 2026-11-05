/**
 * Two boards side by side.
 *
 * The surprising part, and the reason this door can offer versus play on a
 * C64 at all: TWO live playfields plus a centre column fit inside forty
 * columns. Nothing else on this board could manage that; a panel game can only
 * because a panel is two characters wide.
 */

import assert from 'assert';
import { versusLayout, versusCentreLines, dangerBarRows } from '../../ui/panels/versus-layout';

const BOARD_COLS = 12;
const BOARD_ROWS = 13;

const printable = (s: string): number => s
  .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  .replace(/\{\/?[a-z-]+\}/gi, '')
  .length;

export async function twoBoardsAndACentreColumnFitFortyColumns(): Promise<void> {
  const layout = versusLayout(40, 25, BOARD_COLS, BOARD_ROWS);

  assert.strictEqual(layout.compact, true);
  assert.strictEqual(layout.cramped, false, 'both boards fit without folding anything');
  assert.ok(layout.opponent.left + layout.opponent.width <= 40, 'the right board fits');
  assert.ok(layout.player.top + layout.player.height <= 25, 'and so does the height');
  assert.ok(
    layout.player.left + layout.player.width <= layout.centre.left,
    'the boards never overlap the centre column',
  );
  assert.ok(layout.centre.left + layout.centre.width <= layout.opponent.left);
}

export async function theBoardsAreCentredAtEightyColumns(): Promise<void> {
  const layout = versusLayout(80, 25, BOARD_COLS, BOARD_ROWS);
  assert.strictEqual(layout.compact, false);
  assert.ok(layout.player.left > 0, 'centred rather than hard left');
  assert.ok(layout.opponent.left + layout.opponent.width <= 80);
}

/**
 * The centre column spells its labels out wherever there is ROOM for them.
 *
 * It used to drop them on any 40-column screen, tier by tier - so a C64
 * versus match showed two small boards and a strip of initials with the rest
 * of the screen black: "this is also weirdly minumal why?????" (2026-09-06).
 * A C64 board is six panels; two of those at 2x2 is twenty-four columns, and
 * fourteen more fit beside them.
 */
export async function theCentreColumnSpellsOutWhereItFits(): Promise<void> {
  const values = {
    score: 1234, speed: 7, timeText: "1'05", chain: 0, stopped: false, incoming: 0,
  };

  // A C64 board, scaled: 6 panels x 2 = 12 characters each.
  const c64 = versusLayout(40, 25, 12, 24);
  assert.strictEqual(c64.spelledOut, true, 'fourteen columns fit beside two 12-wide boards');
  assert.ok(versusCentreLines(c64, values).join('').includes('POINT'));

  // A board so wide there is no room left: initials, and the number survives.
  const cramped = versusLayout(40, 25, 16, 24);
  assert.strictEqual(cramped.spelledOut, false);
  const lines = versusCentreLines(cramped, values).join('');
  assert.ok(!lines.includes('POINT'));
  assert.ok(lines.includes('1234'), 'but keeps the number');

  assert.ok(versusCentreLines(versusLayout(80, 25, BOARD_COLS, BOARD_ROWS), values)
    .join('').includes('POINT'));
}

export async function everyCentreLineFitsItsColumn(): Promise<void> {
  for (const width of [40, 80, 132]) {
    const layout = versusLayout(width, 25, BOARD_COLS, BOARD_ROWS);
    const lines = versusCentreLines(layout, {
      score: 99999, speed: 99, timeText: "9'59", chain: 13, stopped: true, incoming: 99,
    });
    for (const line of lines) {
      assert.ok(
        printable(line) <= layout.centre.width,
        `at ${width}: "${line}" overruns the ${layout.centre.width}-column centre`,
      );
    }
  }
}

/** Incoming garbage is shown, because seeing it coming is the whole game. */
export async function incomingGarbageIsShownWhenThereIsAny(): Promise<void> {
  const layout = versusLayout(80, 25, BOARD_COLS, BOARD_ROWS);
  const quiet = versusCentreLines(layout, {
    score: 0, speed: 1, timeText: "0'00", chain: 0, stopped: false, incoming: 0,
  }).join('');
  const underAttack = versusCentreLines(layout, {
    score: 0, speed: 1, timeText: "0'00", chain: 0, stopped: false, incoming: 3,
  }).join('');

  assert.ok(!quiet.includes('INCOMING'));
  assert.ok(underAttack.includes('INCOMING'));
}

/**
 * A boardless opponent's bar grows UPWARD from the bottom of its slot, like a
 * stack filling - not downward like a progress meter.
 */
export async function theDangerBarGrowsUpwardFromTheBottom(): Promise<void> {
  const layout = versusLayout(80, 25, BOARD_COLS, BOARD_ROWS);

  const empty = dangerBarRows(layout, 0);
  assert.strictEqual(empty.length, BOARD_ROWS);
  assert.ok(empty.every((row) => row.trim() === ''), 'nothing at zero');

  const half = dangerBarRows(layout, 0.5);
  const filledRows = half.filter((row) => row.includes('█'));
  assert.ok(filledRows.length > 0 && filledRows.length < BOARD_ROWS, 'partially full');
  assert.ok(half[half.length - 1].includes('█'), 'the BOTTOM row is filled first');
  assert.ok(!half[0].includes('█'), 'and the top row last');

  const full = dangerBarRows(layout, 1);
  assert.ok(full.every((row) => row.includes('█')), 'entirely full at one');
}

export async function theDangerBarNeverOverflowsItsSlot(): Promise<void> {
  const layout = versusLayout(40, 25, BOARD_COLS, BOARD_ROWS);
  // A very buried opponent: the percentage is deliberately uncapped upstream.
  for (const rows of [dangerBarRows(layout, 5), dangerBarRows(layout, -1)]) {
    assert.strictEqual(rows.length, BOARD_ROWS);
    for (const row of rows) {
      assert.ok(printable(row) <= layout.opponent.width);
    }
  }
}

/**
 * A C64 versus match uses the screen it has.
 *
 * The view never scaled: two 6-column boards and an 8-column strip of
 * initials, half the screen black - "this is also weirdly minumal why?????
 * rework all views give them proper huds again" (2026-09-06). Two boards at
 * 2x2 are twelve characters each, and fourteen more fit between them for a
 * HUD that spells its labels out.
 */
export async function aC64VersusMatchFillsTheScreen(): Promise<void> {
  const { versusScale, CENTRE_WIDE } = require('../../ui/panels/versus-layout');
  const { CELL_ASPECT } = require('../../ui/panels/layout');

  const scale = versusScale(40, 25, 6, 12, CELL_ASPECT.petscii, CENTRE_WIDE);
  assert.deepStrictEqual(scale, { x: 2, y: 2 }, 'a 2x2 tile, square on a square cell');

  const layout = versusLayout(40, 25, 6 * scale.x, 12 * scale.y);
  assert.strictEqual(layout.player.width, 12);
  assert.strictEqual(layout.opponent.width, 12);
  assert.strictEqual(layout.player.height, 24, 'and the full height of the field');
  assert.strictEqual(layout.spelledOut, true, 'with room for a HUD that says POINT');
  assert.ok(
    layout.opponent.left + layout.opponent.width <= 40,
    `the second board runs off the screen: ${layout.opponent.left} + ${layout.opponent.width}`,
  );
}

/** And 80 columns keeps the board it has always drawn. */
export async function eightyColumnVersusIsUnchanged(): Promise<void> {
  const { versusScale, CENTRE_WIDE } = require('../../ui/panels/versus-layout');
  const { CELL_ASPECT } = require('../../ui/panels/layout');

  const scale = versusScale(80, 25, 12, 13, CELL_ASPECT.terminal, CENTRE_WIDE);
  assert.deepStrictEqual(scale, { x: 1, y: 1 }, '80x25 has no rows to spare, so nothing grows');
}
