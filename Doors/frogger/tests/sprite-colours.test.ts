/**
 * Nothing in a road sprite may be drawn in the road's own colour.
 *
 * The sysop, 2026-09-15: "frogger has sprites with black pixels that are not
 * visible on black backgrounds. the cars wheels etc."
 *
 * Every vehicle is drawn as half-blocks - the body is the background of a
 * `▀`/`▄` cell and the wheels are the FOREGROUND of the other half. Those
 * wheels were colour 0, which is exactly the colour of the road behind them,
 * so each wheel read as a hole punched through the car rather than a wheel.
 * They are blue now.
 *
 * The rule is stated as a property rather than as four expected values,
 * because the next sprite someone draws by hand will reach for black again.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

/** ANSI black: the road, the night sky, and the terminal's own ground. */
const BLACK = 0;

/** The sprites that appear over the ROAD, where the background is black. */
const ROAD_SPRITES = ['car', 'car-red', 'racecar', 'truck'];

/**
 * Everything the player has to SEE, wherever it sits.
 *
 * `home` is deliberately absent: an empty goal bay is three solid black cells
 * and is supposed to be, which is why the rule below is about cells that are
 * invisible rather than about the colour black.
 */
const MUST_BE_SEEN = [
  ...ROAD_SPRITES,
  'frog', 'frog-sit', 'lady-frog', 'fly',
  'snake', 'crocodile', 'turtle',
  'log-short', 'log-medium', 'log-long',
];

type Cell = [string, number, number] | null;

function cellsOf(name: string): Cell[] {
  const path = join(__dirname, '..', 'sprites', `${name}.sprite.json`);
  const sprite = JSON.parse(readFileSync(path, 'utf8'));
  const cells: Cell[] = [];
  for (const animation of Object.values(sprite.animations) as Array<{ frames: Cell[][][] }>) {
    for (const frame of animation.frames) {
      for (const row of frame) {
        for (const cell of row) cells.push(cell);
      }
    }
  }
  return cells;
}

/** A vehicle's own pixels are visible against the road. */
export async function noRoadSpriteDrawsInBlack(): Promise<void> {
  for (const name of ROAD_SPRITES) {
    const drawnInBlack = cellsOf(name).filter((cell) => cell !== null && cell[1] === BLACK);
    assert.deepStrictEqual(
      drawnInBlack, [],
      `${name} draws ${drawnInBlack.length} cell(s) in the road's own colour`,
    );
  }
}

/**
 * The transparent half is still transparent.
 *
 * A vehicle is a half-block: one half is the body, the other half must let the
 * road through. Recolouring the wheels must not have filled that in - a car
 * with a solid rectangle behind it is a worse bug than an invisible wheel.
 */
export async function theRoadStillShowsThroughTheOtherHalf(): Promise<void> {
  for (const name of ROAD_SPRITES) {
    const transparent = cellsOf(name).filter((cell) => cell !== null && cell[2] === BLACK);
    assert.ok(
      transparent.length > 0,
      `${name} has no cell left with the road as its background`,
    );
  }
}

/** Every cell still carries a glyph, so the recolour edited colours only. */
export async function everyCellStillHasItsGlyph(): Promise<void> {
  for (const name of ROAD_SPRITES) {
    for (const cell of cellsOf(name)) {
      if (cell === null) continue;
      assert.strictEqual(typeof cell[0], 'string', `${name} has a cell with no glyph`);
      assert.ok(cell[0].length > 0, `${name} has an empty glyph`);
    }
  }
}

/**
 * No visible sprite may contain a cell that draws nothing at all.
 *
 * A cell with black in BOTH halves is a hole: the glyph is painted black on
 * black and the terminal's own ground shows through unchanged. The fly was
 * exactly this - two white wings with its body missing between them - and it
 * survived the wheel fix because the wheels were black on a COLOUR and this
 * is black on black. Both are the same mistake seen from different sides.
 */
export async function nothingVisibleIsPaintedBlackOnBlack(): Promise<void> {
  for (const name of MUST_BE_SEEN) {
    const holes = cellsOf(name).filter(
      (cell) => cell !== null && cell[1] === BLACK && cell[2] === BLACK,
    );
    assert.deepStrictEqual(
      holes, [],
      `${name} has ${holes.length} cell(s) painted black on black, which draw nothing`,
    );
  }
}

/**
 * The frog's own pixels are not the road's near-neighbour.
 *
 * The sysop, after the wheels: "the frogger sprite needs to be changed as
 * well". The frog is bright green (10) with legs in dark green (2), which is
 * legible against its own body and nearly not there against the black road.
 * The legs THAT SIT ON THE ROAD are bright now; a dark-green half paired with
 * a coloured half is shading and is left alone, which is why this rule is
 * about the pairing rather than about colour 2.
 */
export async function theFrogIsNotDarkGreenOnTheRoad(): Promise<void> {
  const DARK_GREEN = 2;
  for (const name of ['frog', 'frog-sit']) {
    const dim = cellsOf(name).filter(
      (cell) => cell !== null && cell[1] === DARK_GREEN && cell[2] === BLACK,
    );
    assert.deepStrictEqual(
      dim, [],
      `${name} draws ${dim.length} dark-green cell(s) straight onto the road`,
    );
  }
}
