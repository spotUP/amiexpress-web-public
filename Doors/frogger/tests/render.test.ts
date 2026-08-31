/**
 * How the board is drawn.
 *
 * Blocks of background colour rather than ASCII sprites, the way Grandmaster
 * and Super Qix draw theirs, with each logical cell CELL_WIDTH characters
 * wide so a cell comes out roughly square.
 */

import assert from 'assert';
import { startedLevel, laneOf } from './fixture';
import { FroggerGame } from '../game/frogger-game';
import { FroggerData, RiverObject } from '../game/types';
import {
  GRID_WIDTH, GRID_HEIGHT, CELL_WIDTH, BG_COLORS, HOME_CENTRE_OFFSET,
} from '../game/constants';

/** Render once and hand back the frame. */
function frameOf(game: FroggerGame): string[] {
  let frame = '';
  (game as unknown as { renderCallback: (c: string) => void }).renderCallback =
    (c: string) => { frame = c; };
  game.render();
  return frame.split('\n');
}

/** The background colour of every cell of one row. */
function rowColours(line: string): string[] {
  const cells: string[] = [];
  const re = /\{([a-z]+)-bg\}( +)\{\/[a-z]+-bg\}/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const count = m[2].length / CELL_WIDTH;
    for (let i = 0; i < count; i++) cells.push(m[1]);
  }
  return cells;
}

/** Every board row is the full width, in cells and in characters. */
export async function everyRowIsAFullWidthOfCells(): Promise<void> {
  const { game } = startedLevel(1);
  const rows = frameOf(game).slice(0, GRID_HEIGHT);

  assert.strictEqual(rows.length, GRID_HEIGHT, 'one line per lane');

  for (let y = 0; y < rows.length; y++) {
    const visible = rows[y].replace(/\{[^}]*\}/g, '');
    assert.strictEqual(
      visible.length, GRID_WIDTH * CELL_WIDTH,
      `row ${y} should be ${GRID_WIDTH * CELL_WIDTH} characters wide`
    );
    assert.strictEqual(rowColours(rows[y]).length, GRID_WIDTH, `row ${y} cell count`);
  }
}

/** A cell is drawn wider than one character, so it is not a tall sliver. */
export async function aCellIsWiderThanOneCharacter(): Promise<void> {
  assert.ok(CELL_WIDTH >= 2, 'a cell needs to be at least two characters wide');
}

/** The board is colour, not text: no ASCII sprites are left in it. */
export async function theBoardCarriesNoAsciiSprites(): Promise<void> {
  const { game } = startedLevel(3);
  const rows = frameOf(game).slice(0, GRID_HEIGHT);

  const visible = rows.join('').replace(/\{[^}]*\}/g, '');
  assert.strictEqual(
    visible.trim(), '',
    'every board cell should be a coloured space, not a character'
  );

  assert.ok(rows.every(r => r.includes('-bg}')), 'every row is painted with backgrounds');
}

/** Open water is water-coloured; the road is road-coloured. */
export async function theGroundIsPaintedByLaneType(): Promise<void> {
  const { game, data } = startedLevel(1);

  const water = laneOf(data, 'water', 3);
  water.objects = [];
  const road = laneOf(data, 'road', 2);
  road.objects = [];

  const rows = frameOf(game);

  assert.ok(
    rowColours(rows[water.y]).every(c => c === BG_COLORS.water),
    'empty water should be all water'
  );
  assert.ok(
    rowColours(rows[road.y]).every(c => c === BG_COLORS.road),
    'empty road should be all road'
  );
}

/** A car is drawn in the car colour, across its whole width. */
export async function aCarIsPaintedInTheCarColour(): Promise<void> {
  const { game, data } = startedLevel(1);

  const road = laneOf(data, 'road', 1);
  road.objects = [{
    id: 1, type: 'car', x: 10, y: road.y, lane: road.lane, width: 2,
    speed: road.speed,
  }];

  const colours = rowColours(frameOf(game)[road.y]);

  assert.strictEqual(colours[10], BG_COLORS.car);
  assert.strictEqual(colours[11], BG_COLORS.car);
  assert.strictEqual(colours[12], BG_COLORS.road, 'and no wider than it is');
}

/** Each kind of traffic has its own colour. */
export async function eachKindOfTrafficIsToldApartByColour(): Promise<void> {
  const distinct = new Set([BG_COLORS.car, BG_COLORS.truck, BG_COLORS.racecar]);
  assert.strictEqual(distinct.size, 3, 'cars, trucks and racecars differ');

  assert.notStrictEqual(BG_COLORS.log, BG_COLORS.water, 'a log stands out from the water');
  assert.notStrictEqual(BG_COLORS.turtle, BG_COLORS.water, 'so does a turtle');
  assert.notStrictEqual(BG_COLORS.frog, BG_COLORS.log, 'and the frog from its footing');
}

/** The frog is drawn on top of whatever it is standing on. */
export async function theFrogIsDrawnOverItsFooting(): Promise<void> {
  const { game, data } = startedLevel(1);

  const water = laneOf(data, 'water', 3);
  const log = water.objects[0] as RiverObject;
  log.x = 8;

  data.frog.y = water.y;
  data.frog.x = 9;

  const colours = rowColours(frameOf(game)[water.y]);

  assert.strictEqual(colours[9], BG_COLORS.frog, 'the frog wins the cell');
  assert.strictEqual(colours[8], BG_COLORS.log, 'the log either side of it');
}

/**
 * A crocodile's mouth is a different colour from its back, because one is
 * footing and the other is fatal.
 */
export async function aCrocodileShowsWhichEndIsItsMouth(): Promise<void> {
  const { game, data } = startedLevel(5);

  const lane = laneOf(data, 'water', 5);
  const croc = lane.objects[0] as RiverObject;
  croc.x = 12;

  const colours = rowColours(frameOf(game)[lane.y]);
  const cells = colours.slice(12, 12 + croc.width);

  assert.ok(
    cells.includes(BG_COLORS.crocodileMouth),
    `the mouth should be marked, got ${cells.join(',')}`
  );
  assert.ok(
    cells.includes(BG_COLORS.crocodile),
    'and the back should not be'
  );

  // Lane 5 runs right to left, so the mouth is the leading, leftmost cell.
  assert.strictEqual(cells[0], BG_COLORS.crocodileMouth);
}

/** A turtle that has dived is drawn as water: there is nothing to stand on. */
export async function aDivedTurtleLooksLikeWater(): Promise<void> {
  const { game, data } = startedLevel(2);

  const lane = laneOf(data, 'water', 1);
  const turtle = (lane.objects as RiverObject[]).find(t => t.canDive)!;
  turtle.x = 6;
  turtle.isDiving = true;

  const colours = rowColours(frameOf(game)[lane.y]);

  assert.strictEqual(
    colours[6], BG_COLORS.turtleDiving,
    'a turtle under the surface should not look like footing'
  );
  assert.strictEqual(BG_COLORS.turtleDiving, BG_COLORS.water);
}

/** A home shows what is in it. */
export async function aHomeShowsWhatIsInIt(): Promise<void> {
  const { game, data } = startedLevel(2);

  data.homes[0].occupied = true;
  data.homes[1].hasFly = true;
  data.homes[2].hasAlligator = true;

  const colours = rowColours(frameOf(game)[0]);

  assert.strictEqual(colours[data.homes[0].x + HOME_CENTRE_OFFSET], BG_COLORS.homeOccupied);
  assert.strictEqual(colours[data.homes[1].x + HOME_CENTRE_OFFSET], BG_COLORS.homeFly);
  assert.strictEqual(colours[data.homes[2].x + HOME_CENTRE_OFFSET], BG_COLORS.homeCrocodile);
  assert.strictEqual(colours[data.homes[3].x + HOME_CENTRE_OFFSET], BG_COLORS.homeEmpty);
}

/** The hedge between the homes is not an opening. */
export async function theHedgeBetweenHomesIsSolid(): Promise<void> {
  const { game, data } = startedLevel(1);
  const colours = rowColours(frameOf(game)[0]);

  const between = data.homes[0].x + 5;   // between home 1 and home 2
  assert.strictEqual(colours[between], BG_COLORS.hedge);
}

/** A snake riding a log is drawn over it. */
export async function aSnakeOnALogIsVisible(): Promise<void> {
  const { game, data } = startedLevel(3);

  const lane = laneOf(data, 'water', 3);
  const log = lane.objects[0] as RiverObject;
  log.x = 5;
  log.snakeAt = 2;

  const colours = rowColours(frameOf(game)[lane.y]);

  assert.strictEqual(colours[7], BG_COLORS.snake, 'the snake shows on the log');
  assert.strictEqual(colours[5], BG_COLORS.log, 'the rest of the log does not');
}

/** A dying frog blinks rather than sitting there. */
export async function aDyingFrogBlinks(): Promise<void> {
  const { game, data } = startedLevel(1);

  data.frog.isDead = true;
  data.frog.x = 20;
  data.frog.y = 10;

  data.frog.deathFrame = 0;
  const on = rowColours(frameOf(game)[10])[20];

  data.frog.deathFrame = 3;
  const off = rowColours(frameOf(game)[10])[20];

  assert.strictEqual(on, BG_COLORS.frogDying, 'showing on one frame');
  assert.notStrictEqual(off, BG_COLORS.frogDying, 'and gone on the next');
}
