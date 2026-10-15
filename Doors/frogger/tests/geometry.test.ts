/**
 * Board geometry for the sprite pass.
 *
 * Frogger's board was 40 columns of 2 characters, every lane exactly one
 * terminal row tall. Animated cell-art sprites need the room Pengo's have:
 * 5 characters wide and 2 rows tall per cell. Thirteen lanes at two rows
 * each would be 26 rows and does not fit, so the two static banks - the
 * start bank and the home row - stay one row tall and the eleven lanes that
 * carry moving things get two:
 *
 *     start bank                    1
 *     5 road + median + 5 water     22
 *     home row                      1
 *                                   --
 *     board                         24   + 1 status line = 25
 *
 * These tests pin that arithmetic. They are about the BOARD, not about any
 * sprite: a sprite that renders wrong is Task 3's problem, but a lane that
 * overlaps its neighbour or a home the frog cannot reach is a geometry
 * fault, and it would otherwise only show up as a visual oddity nobody can
 * trace back to a number.
 */

import assert from 'assert';
import {
  SCREEN_WIDTH, SCREEN_HEIGHT, GAME_AREA_HEIGHT,
  GRID_WIDTH, GRID_HEIGHT, CELL_WIDTH, CELL_HEIGHT,
  LANE_CONFIG, LANE_ROWS, LANE_HEIGHTS,
  HOME_POSITIONS, HOME_WIDTH, HOME_CENTRE_OFFSET,
  OBJECT_WIDTHS,
} from '../game/constants';

/** The board fills the terminal's width exactly, with no partial cell. */
export async function theBoardFillsTheScreenWidth(): Promise<void> {
  assert.strictEqual(GRID_WIDTH * CELL_WIDTH, SCREEN_WIDTH,
    `${GRID_WIDTH} columns of ${CELL_WIDTH} chars must fill ${SCREEN_WIDTH}`);
}

/** A cell is Pengo's cell: 5 wide, 2 tall, so sprite work transfers. */
export async function aCellIsPengoSized(): Promise<void> {
  assert.strictEqual(CELL_WIDTH, 5);
  assert.strictEqual(CELL_HEIGHT, 2);
}

/** Every lane has a height, and only the two static banks are short. */
export async function onlyTheStaticBanksAreOneRowTall(): Promise<void> {
  assert.strictEqual(LANE_CONFIG.length, GRID_HEIGHT);
  for (const lane of LANE_CONFIG) {
    const h = LANE_HEIGHTS[lane.y];
    assert.ok(h === 1 || h === CELL_HEIGHT,
      `lane at y=${lane.y} has height ${h}; expected 1 or ${CELL_HEIGHT}`);
  }
  const short = LANE_CONFIG.filter((l) => LANE_HEIGHTS[l.y] === 1);
  assert.strictEqual(short.length, 2,
    'exactly two lanes are one row tall: the start bank and the home row');
  for (const lane of short) {
    assert.ok(lane.type === 'safe' || lane.type === 'home',
      `a short lane must be scenery, not ${lane.type}`);
  }
}

/** Road and water lanes - the ones that animate - are all two rows. */
export async function everyMovingLaneIsTwoRowsTall(): Promise<void> {
  for (const lane of LANE_CONFIG) {
    if (lane.type !== 'road' && lane.type !== 'water') continue;
    assert.strictEqual(LANE_HEIGHTS[lane.y], CELL_HEIGHT,
      `${lane.type} lane at y=${lane.y} must be ${CELL_HEIGHT} rows tall`);
  }
}

/** Lanes tile the board: integer rows, no gap, no overlap. */
export async function lanesTileTheBoardWithoutOverlap(): Promise<void> {
  const rows: number[] = [];
  for (const lane of LANE_CONFIG) {
    const top = LANE_ROWS[lane.y];
    const height = LANE_HEIGHTS[lane.y];
    assert.ok(Number.isInteger(top), `lane y=${lane.y} top row ${top} is not an integer`);
    assert.ok(Number.isInteger(height), `lane y=${lane.y} height ${height} is not an integer`);
    for (let r = top; r < top + height; r++) rows.push(r);
  }
  rows.sort((a, b) => a - b);
  assert.strictEqual(rows.length, GAME_AREA_HEIGHT,
    `lanes cover ${rows.length} rows; the board is ${GAME_AREA_HEIGHT}`);
  for (let i = 0; i < rows.length; i++) {
    assert.strictEqual(rows[i], i, `row ${i} is covered ${rows[i] === i ? 'once' : 'wrongly'}`);
  }
}

/**
 * The board, the score line above it and the status line below it are the
 * whole screen.
 *
 * The permanent logo used to sit over the board for the whole session and
 * cost six rows; the arcade shows no logo while you play, and those rows
 * are what the two-row lanes are made of. If the logo ever comes back
 * during play this assertion is what will catch it.
 */
export async function theScoreLineAndBoardFillTheScreen(): Promise<void> {
  const scoreRow = 1;
  assert.strictEqual(scoreRow + GAME_AREA_HEIGHT, SCREEN_HEIGHT,
    `score ${scoreRow} + board ${GAME_AREA_HEIGHT} must equal ${SCREEN_HEIGHT} - ` +
    'a board one row too tall loses its BOTTOM lane, which is where the player starts');
}

/** Five homes, on real columns, evenly spaced, inside the board. */
export async function theFiveHomesSitOnReachableColumns(): Promise<void> {
  assert.strictEqual(HOME_POSITIONS.length, 5);
  for (const x of HOME_POSITIONS) {
    assert.ok(Number.isInteger(x), `home column ${x} is not an integer`);
    assert.ok(x >= 0 && x + HOME_WIDTH <= GRID_WIDTH,
      `home at ${x} (width ${HOME_WIDTH}) falls outside 0..${GRID_WIDTH}`);
  }
  const gaps = HOME_POSITIONS.slice(1).map((x, i) => x - HOME_POSITIONS[i]);
  assert.ok(gaps.every((g) => g === gaps[0]),
    `homes must be evenly spaced; gaps are ${gaps.join(',')}`);
}

/**
 * The frog can land dead centre in a home.
 *
 * FAQ 7: "You must hit exact center or your frog will die." The frog moves
 * in whole cells, so the centre of a home must BE a cell the frog can stand
 * on - otherwise the rule is unsatisfiable and the row becomes impossible.
 */
export async function everyHomeCentreIsAColumnTheFrogCanReach(): Promise<void> {
  for (const x of HOME_POSITIONS) {
    const centre = x + HOME_CENTRE_OFFSET;
    assert.ok(Number.isInteger(centre), `home centre ${centre} is not a whole column`);
    assert.ok(centre >= 0 && centre < GRID_WIDTH,
      `home centre ${centre} is off the board`);
  }
}

/** Nothing is wider than the board it drives across. */
export async function noObjectIsWiderThanTheBoard(): Promise<void> {
  for (const [name, width] of Object.entries(OBJECT_WIDTHS)) {
    assert.ok(Number.isInteger(width), `${name} width ${width} is not an integer`);
    assert.ok(width >= 1, `${name} width ${width} must be at least one cell`);
    assert.ok(width < GRID_WIDTH,
      `${name} is ${width} cells wide on a ${GRID_WIDTH}-cell board`);
  }
}

/** A truck is still bigger than a car, and a long log than a short one. */
export async function relativeSizesSurviveTheRescale(): Promise<void> {
  assert.ok(OBJECT_WIDTHS.truck > OBJECT_WIDTHS.car,
    'a truck must still read as bigger than a car');
  assert.ok(OBJECT_WIDTHS.longLog > OBJECT_WIDTHS.mediumLog,
    'a long log must still be longer than a medium one');
  assert.ok(OBJECT_WIDTHS.mediumLog > OBJECT_WIDTHS.shortLog,
    'a medium log must still be longer than a short one');
}
