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

export async function theCentreColumnDropsItsLabelsAtForty(): Promise<void> {
  const values = {
    score: 1234, speed: 7, timeText: "1'05", chain: 0, stopped: false, incoming: 0,
  };
  const compact = versusCentreLines(versusLayout(40, 25, BOARD_COLS, BOARD_ROWS), values);
  const wide = versusCentreLines(versusLayout(80, 25, BOARD_COLS, BOARD_ROWS), values);

  assert.ok(!compact.join('').includes('POINT'));
  assert.ok(compact.join('').includes('1234'), 'but keeps the number');
  assert.ok(wide.join('').includes('POINT'));
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
