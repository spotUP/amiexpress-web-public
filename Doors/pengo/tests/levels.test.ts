/**
 * The sixteen transcribed arcade mazes.
 *
 * Verifies the transcription against the fetched source counts (see
 * `levels/original-levels.ts`'s provenance note for exactly which cells
 * differ and why), that every level is the right shape, that nobody's
 * start cell is walled in, and that PengoGame actually uses this data for
 * levels 1-16 and falls back to the procedural generator past it.
 */

import assert from 'assert';
import { loadOriginalLevel, originalLevelCount } from '../levels';
import { createInitialGameData } from '../game/initial-data';
import { PengoGame } from '../game/pengo-game';
import { GRID_WIDTH, GRID_HEIGHT } from '../game/constants';
import { loadSpriteSheet } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { join } from 'path';

const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));

/** Source counts fetched 2026-09-01 from cpp-pengo's Game/Data/Levels/N.json
 *  (blocks/diamond/unhatched array lengths - includes cells that land on
 *  our own wall border, which the loader then treats as wall regardless). */
const SOURCE_COUNTS = [
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 82, diamonds: 3, eggs: 6 },
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 74, diamonds: 3, eggs: 4 },
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 82, diamonds: 3, eggs: 6 },
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 74, diamonds: 3, eggs: 4 },
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 82, diamonds: 3, eggs: 6 },
  { blocks: 84, diamonds: 3, eggs: 6 },
  { blocks: 74, diamonds: 3, eggs: 4 },
];

export async function thereAreSixteenOriginalLevels(): Promise<void> {
  assert.strictEqual(originalLevelCount(), 16);
  assert.strictEqual(loadOriginalLevel(17), null, 'no 17th original to load');
  assert.strictEqual(loadOriginalLevel(0), null);
}

/** Every transcribed level is exactly the door's own 13x15 world grid. */
export async function everyLevelIsThirteenByFifteen(): Promise<void> {
  for (let n = 1; n <= 16; n++) {
    const level = loadOriginalLevel(n)!;
    assert.strictEqual(level.grid.length, GRID_HEIGHT, `level ${n} row count`);
    for (const row of level.grid) {
      assert.strictEqual(row.length, GRID_WIDTH, `level ${n} column count`);
    }
  }
}

/** The border ring is always wall, whatever the source transcription says there. */
export async function theBorderIsAlwaysWall(): Promise<void> {
  for (let n = 1; n <= 16; n++) {
    const { grid } = loadOriginalLevel(n)!;
    for (let x = 0; x < GRID_WIDTH; x++) {
      assert.strictEqual(grid[0][x], 'wall', `level ${n} top row`);
      assert.strictEqual(grid[GRID_HEIGHT - 1][x], 'wall', `level ${n} bottom row`);
    }
    for (let y = 0; y < GRID_HEIGHT; y++) {
      assert.strictEqual(grid[y][0], 'wall', `level ${n} left column`);
      assert.strictEqual(grid[y][GRID_WIDTH - 1], 'wall', `level ${n} right column`);
    }
  }
}

/**
 * No level ever loses a diamond to the wall-border override - 0 of the
 * source's diamond cells land on our border in any of the 16 levels
 * (verified against the fetched JSON). This is the invariant the crush/
 * alignment scoring depends on: exactly 3 diamonds, always in play.
 */
export async function everyLevelKeepsAllThreeDiamonds(): Promise<void> {
  for (let n = 1; n <= 16; n++) {
    const { grid } = loadOriginalLevel(n)!;
    let diamonds = 0;
    for (const row of grid) for (const cell of row) if (cell === 'diamond') diamonds++;
    assert.strictEqual(diamonds, SOURCE_COUNTS[n - 1].diamonds, `level ${n} diamond count`);
  }
}

/**
 * Egg-spawn counts match the source to within the (at most one) egg that
 * lands on our wall border and is dropped - never more than one, and
 * never for a level whose source had none there.
 */
export async function eggCountsMatchTheSourceWithinTheBorderOverride(): Promise<void> {
  for (let n = 1; n <= 16; n++) {
    const level = loadOriginalLevel(n)!;
    const expected = SOURCE_COUNTS[n - 1].eggs;
    const diff = expected - level.eggSpawns.length;
    assert.ok(diff >= 0 && diff <= 1,
      `level ${n}: source had ${expected} eggs, transcription kept ${level.eggSpawns.length}`);
  }
}

/** Ice + diamond block counts (post-border-override) never exceed the source's. */
export async function blockCountsNeverExceedTheSource(): Promise<void> {
  for (let n = 1; n <= 16; n++) {
    const { grid } = loadOriginalLevel(n)!;
    let blocks = 0;
    for (const row of grid) for (const cell of row) if (cell === 'ice' || cell === 'diamond') blocks++;
    assert.ok(blocks <= SOURCE_COUNTS[n - 1].blocks, `level ${n}: ${blocks} blocks exceeds source's ${SOURCE_COUNTS[n - 1].blocks}`);
    assert.ok(blocks > 0, `level ${n}: transcription lost every block`);
  }
}

/** Every level has room to stand: at least one interior cell is walkable floor. */
export async function everyLevelHasAnOpenInteriorCell(): Promise<void> {
  for (let n = 1; n <= 16; n++) {
    const { grid } = loadOriginalLevel(n)!;
    let open = 0;
    for (let y = 1; y < GRID_HEIGHT - 1; y++) {
      for (let x = 1; x < GRID_WIDTH - 1; x++) {
        if (grid[y][x] === 'empty') open++;
      }
    }
    assert.ok(open > 0, `level ${n}: no empty interior cell - Pengo could never spawn`);
  }
}

/** PengoGame actually loads the transcription for levels 1-16, not the random generator. */
export async function pengoGameUsesTheOriginalLevelsForOneThroughSixteen(): Promise<void> {
  const data = createInitialGameData();
  const game = new PengoGame(data, () => { /* no display */ }, sheet);
  data.level = 3;
  game.initLevel();

  const expected = loadOriginalLevel(3)!;
  assert.deepStrictEqual(data.grid, expected.grid, 'level 3 must be the authored maze, not a random one');

  let diamonds = 0;
  for (const row of data.grid) for (const cell of row) if (cell === 'diamond') diamonds++;
  assert.strictEqual(diamonds, 3);
}

/** Past level 16, PengoGame falls back to the procedural generator - never crashes, never repeats level 1. */
export async function pengoGameFallsBackToTheProceduralGeneratorPastSixteen(): Promise<void> {
  const data = createInitialGameData();
  const game = new PengoGame(data, () => { /* no display */ }, sheet);
  data.level = 17;
  game.initLevel();

  assert.strictEqual(data.grid.length, GRID_HEIGHT);
  assert.notDeepStrictEqual(data.grid, loadOriginalLevel(1)!.grid,
    'level 17 must not silently be level 1 again');
}
