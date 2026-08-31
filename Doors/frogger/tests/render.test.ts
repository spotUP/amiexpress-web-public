/**
 * How the board is drawn.
 *
 * Coloured lanes with character sprites over them, in the style of Philippe
 * Majerus's Frogger ANSI: a log has rounded ends and a grain, a turtle is
 * `:O:`, a car has a nose pointing the way it is going. Each logical cell is
 * CELL_WIDTH characters wide, so a cell is roughly square and forty of them
 * fill the eighty-column screen.
 */

import assert from 'assert';
import { startedLevel, laneOf } from './fixture';
import { FroggerGame } from '../game/frogger-game';
import { RiverObject } from '../game/types';
import {
  GRID_WIDTH, GRID_HEIGHT, CELL_WIDTH, BG_COLORS, SPRITE_FG,
  HOME_CENTRE_OFFSET, FROG_GLYPH, TURTLE_GLYPH, MOUTH_GLYPH,
  LOG_END_LEFT, LOG_END_RIGHT, SNAKE_GLYPH, FLY_GLYPH, BANK_TEXTURE,
} from '../game/constants';

interface Painted { ch: string; fg: string; bg: string }

/** Render once and hand back the frame. */
function frameOf(game: FroggerGame): string[] {
  let frame = '';
  (game as unknown as { renderCallback: (c: string) => void }).renderCallback =
    (c: string) => { frame = c; };
  game.render();
  return frame.split('\n');
}

/** Pull one row apart into its characters and their colours. */
function paintedRow(line: string): Painted[] {
  const cells: Painted[] = [];
  const re = /\{([a-z]+)-bg\}\{([a-z]+)-fg\}(.*?)\{\/[a-z]+-fg\}\{\/[a-z]+-bg\}/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    for (const ch of m[3]) cells.push({ ch, fg: m[2], bg: m[1] });
  }
  return cells;
}

/** The characters of a row, as a plain string. */
function textOf(line: string): string {
  return paintedRow(line).map(c => c.ch).join('');
}

/** Every board row is the full width, character for character. */
export async function everyRowIsAFullScreenWide(): Promise<void> {
  const { game } = startedLevel(1);
  const rows = frameOf(game).slice(0, GRID_HEIGHT);

  assert.strictEqual(rows.length, GRID_HEIGHT, 'one line per lane');

  for (let y = 0; y < rows.length; y++) {
    assert.strictEqual(
      paintedRow(rows[y]).length, GRID_WIDTH * CELL_WIDTH,
      `row ${y} should be ${GRID_WIDTH * CELL_WIDTH} characters wide`
    );
  }
}

/** A cell is wider than one character, so it is not a tall sliver. */
export async function aCellIsWiderThanOneCharacter(): Promise<void> {
  assert.ok(CELL_WIDTH >= 2, 'a cell needs to be at least two characters wide');
}

/**
 * The board is drawn with characters, not just colour. This is the whole
 * point of the ANSI style, and the reason it was reported: a board of solid
 * blocks reads as coloured bars rather than as a game.
 */
export async function theBoardIsDrawnWithCharacters(): Promise<void> {
  const { game } = startedLevel(3);
  const rows = frameOf(game).slice(0, GRID_HEIGHT);

  const drawn = rows.map(textOf).join('').replace(/ /g, '');
  assert.ok(
    drawn.length > 100,
    `the board should be full of sprites, found ${drawn.length} characters`
  );
}

/** A log has rounded ends and a grain along it. */
export async function aLogIsDrawnAsALog(): Promise<void> {
  const { game, data } = startedLevel(1);

  const lane = laneOf(data, 'water', 2);
  const log = lane.objects[0] as RiverObject;
  log.x = 4;

  const row = paintedRow(frameOf(game)[lane.y]);
  const span = log.width * CELL_WIDTH;
  const sprite = row.slice(4 * CELL_WIDTH, 4 * CELL_WIDTH + span);
  const text = sprite.map(c => c.ch).join('');

  assert.strictEqual(text[0], LOG_END_LEFT, 'a rounded left end');
  assert.strictEqual(text[text.length - 1], LOG_END_RIGHT, 'and a rounded right end');
  assert.ok(text.includes('-'), 'with a grain along it');
  assert.ok(sprite.every(c => c.bg === BG_COLORS.log), 'on wood, not on water');
}

/** A turtle set is drawn as turtles. */
export async function turtlesAreDrawnAsTurtles(): Promise<void> {
  const { game, data } = startedLevel(1);

  const lane = laneOf(data, 'water', 1);
  const turtle = lane.objects[0] as RiverObject;
  turtle.x = 6;
  turtle.isDiving = false;

  const row = paintedRow(frameOf(game)[lane.y]);
  const text = row.slice(6 * CELL_WIDTH, 6 * CELL_WIDTH + turtle.width * CELL_WIDTH)
    .map(c => c.ch).join('');

  assert.ok(
    text.includes(TURTLE_GLYPH),
    `expected a turtle in "${text}"`
  );
}

/** A turtle that has dived shows nothing: there is nothing to stand on. */
export async function aDivedTurtleShowsOnlyWater(): Promise<void> {
  const { game, data } = startedLevel(2);

  const lane = laneOf(data, 'water', 1);
  const turtle = (lane.objects as RiverObject[]).find(t => t.canDive)!;
  turtle.x = 6;
  turtle.isDiving = true;

  const row = paintedRow(frameOf(game)[lane.y]);
  const cells = row.slice(6 * CELL_WIDTH, 6 * CELL_WIDTH + turtle.width * CELL_WIDTH);

  assert.strictEqual(
    cells.map(c => c.ch).join('').trim(), '',
    'a turtle under the surface should not be drawn'
  );
  assert.ok(cells.every(c => c.bg === BG_COLORS.water), 'only water is left');
}

/** A vehicle points the way it is travelling. */
export async function aVehiclePointsWhereItIsGoing(): Promise<void> {
  const { game, data } = startedLevel(1);

  const road = laneOf(data, 'road', 1);
  road.objects = [{
    id: 1, type: 'car', x: 10, y: road.y, lane: road.lane, width: 2,
    speed: Math.abs(road.speed),      // travelling right
  }];

  const row = paintedRow(frameOf(game)[road.y]);
  const text = row.slice(10 * CELL_WIDTH, 10 * CELL_WIDTH + 2 * CELL_WIDTH)
    .map(c => c.ch).join('');

  assert.strictEqual(text[text.length - 1], '>', `a nose on the right, got "${text}"`);
  assert.ok(
    row[10 * CELL_WIDTH].fg === SPRITE_FG.car,
    'painted in the car colour'
  );
}

/** ...and the other way when it is going the other way. */
export async function aVehicleGoingLeftPointsLeft(): Promise<void> {
  const { game, data } = startedLevel(1);

  const road = laneOf(data, 'road', 1);
  road.objects = [{
    id: 1, type: 'car', x: 10, y: road.y, lane: road.lane, width: 2,
    speed: -Math.abs(road.speed),
  }];

  const text = paintedRow(frameOf(game)[road.y])
    .slice(10 * CELL_WIDTH, 10 * CELL_WIDTH + 2 * CELL_WIDTH)
    .map(c => c.ch).join('');

  assert.strictEqual(text[0], '<', `a nose on the left, got "${text}"`);
}

/** Each kind of traffic is told apart by colour. */
export async function eachKindOfTrafficHasItsOwnColour(): Promise<void> {
  const distinct = new Set([SPRITE_FG.car, SPRITE_FG.truck, SPRITE_FG.racecar]);
  assert.strictEqual(distinct.size, 3, 'cars, trucks and racecars differ');
}

/** The frog is drawn on top of whatever it is standing on. */
export async function theFrogIsDrawnOverItsFooting(): Promise<void> {
  const { game, data } = startedLevel(1);

  const water = laneOf(data, 'water', 3);
  const log = water.objects[0] as RiverObject;
  log.x = 8;

  data.frog.y = water.y;
  data.frog.x = 9;

  const row = paintedRow(frameOf(game)[water.y]);
  const cell = row[9 * CELL_WIDTH];

  assert.strictEqual(cell.ch, FROG_GLYPH, 'the frog wins its cell');
  assert.strictEqual(cell.fg, SPRITE_FG.frog);
  assert.strictEqual(cell.bg, BG_COLORS.log, 'standing on the log');
}

/** A crocodile shows its jaws at the end it swims towards. */
export async function aCrocodileShowsItsJaws(): Promise<void> {
  const { game, data } = startedLevel(5);

  const lane = laneOf(data, 'water', 5);
  const croc = lane.objects[0] as RiverObject;
  croc.x = 12;

  const row = paintedRow(frameOf(game)[lane.y]);
  const span = croc.width * CELL_WIDTH;
  const sprite = row.slice(12 * CELL_WIDTH, 12 * CELL_WIDTH + span);
  const text = sprite.map(c => c.ch).join('');

  assert.ok(text.includes(MOUTH_GLYPH), `jaws somewhere in "${text}"`);

  // Lane 5 runs right to left, so the jaws lead on the left.
  assert.strictEqual(text.slice(0, MOUTH_GLYPH.length), MOUTH_GLYPH);
  assert.strictEqual(sprite[0].fg, SPRITE_FG.crocodileMouth, 'and they are marked');
  assert.strictEqual(
    sprite[span - 1].fg, SPRITE_FG.crocodile,
    'while the back is not'
  );
}

/** A home shows what is sitting in it. */
export async function aHomeShowsWhatIsInIt(): Promise<void> {
  const { game, data } = startedLevel(2);

  data.homes[0].occupied = true;
  data.homes[1].hasFly = true;
  data.homes[2].hasAlligator = true;

  const row = paintedRow(frameOf(game)[0]);
  // The cell the frog has to land in is where the occupant is drawn.
  const middleOf = (i: number) =>
    row[(data.homes[i].x + HOME_CENTRE_OFFSET) * CELL_WIDTH];

  assert.strictEqual(middleOf(0).ch, FROG_GLYPH, 'a frog safely home');
  assert.strictEqual(middleOf(1).ch, FLY_GLYPH, 'a fly to be had');
  assert.strictEqual(middleOf(2).ch, MOUTH_GLYPH[0], 'a crocodile lying in wait');
  assert.strictEqual(middleOf(3).ch, ' ', 'and an empty home');
}

/** The hedge between the homes is textured, not a flat block. */
export async function theHedgeIsTextured(): Promise<void> {
  const { game, data } = startedLevel(1);
  const row = paintedRow(frameOf(game)[0]);

  const between = row[(data.homes[0].x + 5) * CELL_WIDTH];
  assert.notStrictEqual(between.ch, ' ', 'the hedge should have a texture');
  assert.strictEqual(between.bg, BG_COLORS.hedge);
}

/** The banks and the median are textured too. */
export async function theBanksAreTextured(): Promise<void> {
  const { game, data } = startedLevel(1);
  const bank = data.lanes.find(l => l.type === 'safe')!;

  const row = paintedRow(frameOf(game)[bank.y]);

  // Counted, not merely "something is drawn": the frog stands on the bottom
  // bank, so one glyph proves nothing about the texture.
  const textured = row.filter(c => BANK_TEXTURE.includes(c.ch)).length;

  assert.ok(
    textured > row.length / 2,
    `most of the bank should be textured, found ${textured} of ${row.length}`
  );
  assert.ok(row.every(c => c.bg === BG_COLORS.bank));
}

/** A snake riding a log is drawn over it. */
export async function aSnakeOnALogIsVisible(): Promise<void> {
  const { game, data } = startedLevel(3);

  const lane = laneOf(data, 'water', 3);
  const log = lane.objects[0] as RiverObject;
  log.x = 5;
  log.snakeAt = 2;

  const row = paintedRow(frameOf(game)[lane.y]);

  assert.strictEqual(row[7 * CELL_WIDTH].ch, SNAKE_GLYPH, 'the snake shows on the log');
  assert.strictEqual(row[7 * CELL_WIDTH].fg, SPRITE_FG.snake);
}

/** A dying frog blinks. */
export async function aDyingFrogBlinks(): Promise<void> {
  const { game, data } = startedLevel(1);

  data.frog.isDead = true;
  data.frog.x = 20;
  data.frog.y = 10;

  data.frog.deathFrame = 0;
  const on = paintedRow(frameOf(game)[10])[20 * CELL_WIDTH];

  data.frog.deathFrame = 3;
  const off = paintedRow(frameOf(game)[10])[20 * CELL_WIDTH];

  assert.strictEqual(on.ch, FROG_GLYPH, 'showing on one frame');
  assert.strictEqual(on.fg, SPRITE_FG.frogDying, 'in the dying colour');
  assert.notStrictEqual(off.ch, FROG_GLYPH, 'and gone on the next');
}

/**
 * Nothing outside 7-bit ASCII is ever drawn.
 *
 * Reported live 2026-08-31: "we cant use unicode characters in frogger".
 * The board goes through blessed with fullUnicode off, so a Unicode glyph
 * arrives mangled or not at all - the sprites showed as nothing.
 */
export async function theBoardIsPureAscii(): Promise<void> {
  for (const level of [1, 3, 5, 7]) {
    const { game, data } = startedLevel(level);
    data.snakes.push({ id: 1, x: 5, y: 6, direction: 1, speed: 1 });

    const frame = frameOf(game).join('\n');
    const offenders = [...frame].filter(ch => ch.charCodeAt(0) > 126);

    assert.strictEqual(
      offenders.length, 0,
      `level ${level} drew non-ASCII: ${[...new Set(offenders)].join(' ')}`
    );
  }
}

/**
 * The frog is never the same colour as the ground it stands on.
 *
 * Reported live: "i cant see the grog when i stand on green as the grog is
 * the same green."
 */
export async function theFrogStandsOutFromEveryLane(): Promise<void> {
  for (const ground of [BG_COLORS.bank, BG_COLORS.water, BG_COLORS.road, BG_COLORS.log]) {
    assert.notStrictEqual(
      SPRITE_FG.frog, ground,
      `the frog would be invisible on ${ground}`
    );
  }
}
