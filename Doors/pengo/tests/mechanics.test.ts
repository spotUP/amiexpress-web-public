/**
 * The Stage 3 mechanics rulings from the arcade-mechanics gap audit
 * (thoughts/shared/research/2026-09-01_pengo-arcade-mechanics-gap.md):
 * the diamond re-scoring bug, the score cap, chain-kill crushes, the
 * boxed-in-block destroy, touch-killing a stunned Sno-Bee, and the
 * concurrent-enemy population cap. The Gaussian AI targeting has its own
 * suite (ai.test.ts) since the interesting part of it is a pure function.
 */

import assert from 'assert';
import { join } from 'path';
import { loadSpriteSheet } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { createInitialGameData } from '../game/initial-data';
import { buildBoard } from '../game/render';
import { PengoGame } from '../game/pengo-game';
import { PengoData, Enemy } from '../game/types';
import {
  GRID_WIDTH, GRID_HEIGHT, SCORES, MAX_SCORE, crushComboScore, MAX_LIVING_ENEMIES,
  CELL_W,
  CELL_H, getLevelConfig,} from '../game/constants';

const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));

/** A board the test controls completely (same shape as the sfx suite's). */
function emptyBoard(): { game: PengoGame; data: PengoData } {
  const data = createInitialGameData();
  const game = new PengoGame(data, () => { /* no display in tests */ }, sheet);
  game.initLevel();

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const edge = x === 0 || x === GRID_WIDTH - 1 || y === 0 || y === GRID_HEIGHT - 1;
      data.grid[y][x] = edge ? 'wall' : 'empty';
    }
  }
  data.enemies = [];
  data.eggs = [];
  data.state = 'playing';
  data.pengo = {
    x: 4, y: 4, direction: 'right',
    isPushing: false, pushFrame: 0, isDead: false, deathFrame: 0,
  };
  game.cues.clear();
  return { game, data };
}

/**
 * Push, then let the block finish travelling.
 *
 * A push no longer resolves inside the keypress - the block is an entity in
 * flight and moves a cell per SLIDE_TICKS_PER_CELL, which is what makes the
 * slide visible instead of a one-frame teleport. Tests that assert where a
 * block ENDED UP have to let it get there.
 */
function settlePush(game: PengoGame, data: PengoData, maxTicks = 200): void {
  game.handlePush();
  let ticks = 0;
  // Only the slide, not a whole game tick: update() also moves enemies and
  // runs the clock, and these tests are about what a PUSH does. Driving the
  // full loop let unrelated scoring leak into the assertions.
  while (data.slidingBlocks.length > 0 && ticks++ < maxTicks) {
    (game as unknown as { advanceSlidingBlocks(): void }).advanceSlidingBlocks();
  }
  if (data.slidingBlocks.length > 0) {
    throw new Error(`a pushed block never came to rest within ${maxTicks} ticks`);
  }
}

function enemyAt(x: number, y: number, state: Enemy['state'] = 'walking'): Enemy {
  return {
    id: Math.floor(Math.random() * 1e9), x, y, direction: 'left', state,
    stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
  };
}

// ---------------------------------------------------------------------------
// Diamond alignment: score once, then lock.
// ---------------------------------------------------------------------------

/** The bug reported by the audit: the score re-added on every later push. */
export async function theDiamondBonusIsAwardedExactlyOnce(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[3][4] = 'diamond';
  data.grid[3][6] = 'diamond';
  data.grid[4][5] = 'ice';

  settlePush(game, data);
  const afterFirstAlignment = data.score;
  assert.ok(afterFirstAlignment >= SCORES.diamondAlign2, 'the bonus must have fired at all');

  // A second, unrelated push - the diamonds are already aligned and
  // untouched; only the ice-block push score should move. isPushing must
  // be cleared by hand (as the real game loop's animation timer would),
  // or handlePush()'s own re-entrancy guard silently no-ops the second call.
  data.pengo.isPushing = false;
  data.grid[4][5] = 'ice';
  settlePush(game, data);

  assert.strictEqual(
    data.score, afterFirstAlignment + SCORES.pushBlock,
    'the diamond bonus must not re-fire on a push that has nothing to do with it'
  );
}

/** Once aligned, the diamonds themselves stop being pushable. */
export async function alignedDiamondsAreLockedInPlace(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[3][4] = 'diamond';
  data.grid[3][6] = 'diamond';
  data.grid[4][5] = 'ice';
  settlePush(game, data);
  assert.strictEqual(data.grid[3][4], 'diamond', 'sanity: still there before the locked push');
  game.cues.clear();
  data.pengo.isPushing = false;

  // Face the aligned diamond and try to push it.
  data.pengo.x = 3;
  data.pengo.y = 3;
  data.pengo.direction = 'right';
  settlePush(game, data);

  assert.strictEqual(data.grid[3][4], 'diamond', 'a locked diamond must not move');
  assert.deepStrictEqual(game.cues.drain(), ['boop'], 'a locked diamond gives no push feedback, just a thud');
}

// ---------------------------------------------------------------------------
// Score cap.
// ---------------------------------------------------------------------------

export async function theScoreNeverExceedsTheArcadesFiveDigitDisplay(): Promise<void> {
  const { game, data } = emptyBoard();
  data.score = MAX_SCORE - 5;
  data.timeRemaining = 999; // a large time bonus, to blow well past the cap

  game.update(); // 0 enemies, 0 eggs -> level complete, awards clearLevel + time bonus

  assert.strictEqual(data.score, MAX_SCORE);
}

// ---------------------------------------------------------------------------
// Chain-kill crushes.
// ---------------------------------------------------------------------------

/** A single continuous push catches every enemy in its path, not just the first. */
export async function aPushChainKillsEveryEnemyInItsPath(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][5] = 'ice';
  data.enemies = [enemyAt(6, 4), enemyAt(7, 4)];

  const before = data.score;
  settlePush(game, data);

  assert.strictEqual(data.enemies[0].state, 'crushed', 'the first enemy in the path is caught');
  assert.strictEqual(data.enemies[1].state, 'crushed', 'the second, further down the SAME push, must be too');
  assert.strictEqual(
    data.score, before + SCORES.pushBlock + crushComboScore(2),
    'one combo for the whole chain (400+1600 style table), not two separate flat crushes'
  );
  assert.deepStrictEqual(game.cues.drain(), ['dash', 'explosion'], 'one crush cue for the whole chain');
}

// ---------------------------------------------------------------------------
// Destroying a boxed-in block.
// ---------------------------------------------------------------------------

/** Pushing a block into a wall with no room to slide destroys it, rather than doing nothing. */
export async function pushingABlockWithNoRoomDestroysIt(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][1] = 'ice'; // one cell in from the left wall
  data.pengo.x = 2;
  data.pengo.y = 4;
  data.pengo.direction = 'left';

  settlePush(game, data);

  assert.strictEqual(data.grid[4][1], 'empty', 'a block with nowhere to go must be destroyed, not left in place');
  assert.deepStrictEqual(game.cues.drain(), ['dash', 'switch']);
}

/** A block that CAN slide at least one cell is unaffected - only the boxed-in case destroys. */
export async function aBlockThatCanMoveIsNotDestroyed(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][5] = 'ice';
  settlePush(game, data);

  let found = false;
  for (const row of data.grid) for (const cell of row) if (cell === 'ice') found = true;
  assert.ok(found, 'the block must still exist somewhere on the board');
}

// ---------------------------------------------------------------------------
// Touch-killing a stunned Sno-Bee.
// ---------------------------------------------------------------------------

export async function walkingIntoAStunnedSnoBeeKillsIt(): Promise<void> {
  const { game, data } = emptyBoard();
  data.enemies = [enemyAt(4, 4, 'stunned')];
  data.enemies[0].stunTimer = 30;
  const before = data.score;

  game.update();

  assert.strictEqual(data.enemies[0].state, 'crushed', 'touching a stunned Sno-Bee kills it');
  assert.strictEqual(data.score, before + SCORES.touchKillStunned);
  assert.notStrictEqual(SCORES.touchKillStunned, SCORES.crushEnemy, 'a touch-kill must stay smaller than a real crush');
  assert.strictEqual(data.pengo.isDead, false, 'a stunned Sno-Bee cannot kill Pengo back');
}

/** A live (not stunned) Sno-Bee on the same cell still kills Pengo, unchanged. */
export async function walkingIntoAWalkingSnoBeeStillKillsPengo(): Promise<void> {
  const { game, data } = emptyBoard();
  data.enemies = [enemyAt(4, 4, 'walking')];

  game.update();

  assert.strictEqual(data.pengo.isDead, true);
}

// ---------------------------------------------------------------------------
// Population cap.
// ---------------------------------------------------------------------------

export async function readyEggsHoldWhileTheEnemyPopulationIsAtCap(): Promise<void> {
  const { game, data } = emptyBoard();
  data.enemies = [enemyAt(2, 2), enemyAt(2, 3), enemyAt(2, 5), enemyAt(2, 6)];
  assert.strictEqual(data.enemies.length, MAX_LIVING_ENEMIES, 'test setup must actually sit at the cap');
  data.eggs = [{ x: 8, y: 8, hatchTimer: 1 }];

  game.update();

  assert.strictEqual(data.eggs.length, 1, 'no room: the ready egg must hold rather than hatch');
  assert.strictEqual(data.enemies.filter(e => e.state !== 'dead').length, MAX_LIVING_ENEMIES);
}

export async function aHeldEggHatchesOnceRoomOpensUp(): Promise<void> {
  const { game, data } = emptyBoard();
  data.enemies = [enemyAt(2, 2), enemyAt(2, 3), enemyAt(2, 5), enemyAt(2, 6)];
  data.eggs = [{ x: 8, y: 8, hatchTimer: 1 }];
  game.update();
  assert.strictEqual(data.eggs.length, 1, 'sanity: held on the first tick');

  data.enemies[0].state = 'dead'; // makes room

  game.update();

  assert.strictEqual(data.eggs.length, 0, 'the held egg hatches once a Sno-Bee has died');
}

// ---------------------------------------------------------------------------
// Enemies breaking blocks in their path (ref2's coinflip).
//
// Both mocked deterministic - `enemy.targetX/Y` are set directly so the
// Gaussian target-pick is skipped this tick (the enemy hasn't "arrived"),
// leaving the coinflip as the only Math.random() call in play.
// ---------------------------------------------------------------------------

/** Runs `fn` with Math.random replaced, restoring it even if `fn` throws. */
async function withMockedRandom(value: number, fn: () => void | Promise<void>): Promise<void> {
  const original = Math.random;
  Math.random = () => value;
  try {
    await fn();
  } finally {
    Math.random = original;
  }
}

export async function anEnemyBlockedByIceSometimesBreaksIt(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][5] = 'ice'; // directly above the enemy's path
  data.enemies = [enemyAt(5, 5)];
  data.enemies[0].targetX = 5;
  data.enemies[0].targetY = 2; // due north - straight into the ice
  data.enemies[0].moveTimer = 9; // due to move this tick (level 1 speed is 10)

  await withMockedRandom(0, () => {
    game.update();
  });

  assert.strictEqual(data.grid[4][5], 'empty', 'the coinflip landing under the break chance must break the block');
  assert.strictEqual(data.enemies[0].y, 5, 'breaking the block takes the tick - the enemy does not also move through it');
}

export async function anEnemyBlockedByIceSometimesDoesNotBreakIt(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][5] = 'ice';
  data.enemies = [enemyAt(5, 5)];
  data.enemies[0].targetX = 5;
  data.enemies[0].targetY = 2;
  data.enemies[0].moveTimer = 9;

  await withMockedRandom(0.99, () => {
    game.update();
  });

  assert.strictEqual(data.grid[4][5], 'ice', 'the coinflip landing above the break chance must leave the block standing');
}

// ---------------------------------------------------------------------------
// A push is a journey, not a teleport.
// ---------------------------------------------------------------------------

/**
 * A pushed block travels over several frames, and is visible the whole way.
 *
 * Reported in play as blocks disappearing when pushed, and diagnosed
 * exactly: "they move too fast making it a 1 frame animation". The whole
 * slide used to run inside the keypress, so the block left one cell and
 * arrived at the far wall in the same frame the player pressed the key.
 */
export async function aPushedBlockTravelsOverSeveralFrames(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][5] = 'ice';               // a clear corridor to the right

  game.handlePush();

  assert.ok(data.slidingBlocks.length === 1,
    'the push puts a block in flight rather than resolving on the spot');
  const block = data.slidingBlocks[0];
  const startX = block.x;

  const advance = () =>
    (game as unknown as { advanceSlidingBlocks(): void }).advanceSlidingBlocks();

  // Somewhere in the middle of the journey it is neither where it started
  // nor yet at rest - which is the frame the player needs to see.
  let sawItMoving = false;
  for (let i = 0; i < 40 && data.slidingBlocks.length > 0; i++) {
    advance();
    if (data.slidingBlocks.length > 0 && data.slidingBlocks[0].x !== startX) {
      sawItMoving = true;
    }
  }

  assert.ok(sawItMoving, 'the block was drawn somewhere between its ends');
  assert.strictEqual(data.slidingBlocks.length, 0, 'and it came to rest');
}

/** While it is in flight the block is nowhere in the grid - so it must be drawn. */
export async function aBlockInFlightIsNotLostFromTheBoard(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][5] = 'ice';

  game.handlePush();
  const inFlight = data.slidingBlocks.length;
  const inGrid = data.grid.flat().filter((c) => c === 'ice').length;

  assert.strictEqual(inFlight, 1, 'the block is in the air');
  assert.strictEqual(inGrid, 0, 'and out of the grid while it travels');

  const board = buildBoard(data, sheet, 0);
  const cell = board[data.slidingBlocks[0].y * CELL_H]
    ?.[data.slidingBlocks[0].x * CELL_W];
  assert.ok(cell && cell.char !== ' ',
    'the renderer draws a block in flight, or it vanishes for the whole slide');
}

/**
 * A block in flight is SOLID.
 *
 * Reported in play 2026-09-01: "when i push a block in pengo the penguin
 * flies with the block and dies on the enemy". pushBlock() takes the block
 * off the grid (`grid[y][x] = 'empty'`) and hands it to `slidingBlocks`,
 * and nothing consulted that list for walkability - so every cell the
 * block travelled through, including the one it was standing in, read as
 * empty floor. Pengo walks a cell per 90ms and a block travels one per
 * SLIDE_TICKS_PER_CELL (200ms), so holding the direction key walked him
 * straight through the block he had just pushed and into whatever was
 * behind it.
 */
export async function pengoCannotWalkIntoABlockStillInFlight(): Promise<void> {
  const { game, data } = emptyBoard();
  data.pengo = { ...data.pengo, x: 2, y: 4, direction: 'right' };
  data.grid[4][3] = 'ice';

  game.handlePush();
  assert.strictEqual(data.slidingBlocks.length, 1, 'precondition: the block is in flight');
  const block = data.slidingBlocks[0];
  assert.strictEqual(block.x, 3, 'precondition: it starts in the cell it was pushed from');

  // The block has not moved yet - it still stands in the cell it was
  // pushed from - so there is nowhere to step.
  game.handleDirection('right');
  assert.strictEqual(data.pengo.x, 2,
    'Pengo must not enter the cell a block still occupies, grid-empty or not');

  // Once it advances, the cell it left is free and Pengo may follow.
  (game as unknown as { advanceSlidingBlocks(): void }).advanceSlidingBlocks();
  (game as unknown as { advanceSlidingBlocks(): void }).advanceSlidingBlocks();
  assert.strictEqual(data.slidingBlocks[0].x, 4, 'precondition: the block moved on');
  game.handleDirection('right');
  assert.strictEqual(data.pengo.x, 3, 'Pengo may follow into the cell the block left');

  // But no further: the block is standing in the next one.
  game.handleDirection('right');
  assert.strictEqual(data.pengo.x, 3,
    'Pengo must not walk into the cell a block in flight occupies');
}

export async function pengoCannotOvertakeTheBlockHePushed(): Promise<void> {
  const { game, data } = emptyBoard();
  data.pengo = { ...data.pengo, x: 2, y: 4, direction: 'right' };
  data.grid[4][3] = 'ice';

  game.handlePush();

  // Hold the direction down for the whole flight: one step per tick, which
  // is FASTER than the block's one cell per SLIDE_TICKS_PER_CELL.
  for (let i = 0; i < 40 && data.slidingBlocks.length > 0; i++) {
    game.handleDirection('right');
    const block = data.slidingBlocks[0];
    assert.ok(data.pengo.x < block.x,
      `Pengo (x=${data.pengo.x}) must stay behind the block he pushed (x=${block.x})`);
    (game as unknown as { advanceSlidingBlocks(): void }).advanceSlidingBlocks();
  }
}

export async function anEnemyCannotWalkIntoABlockInFlight(): Promise<void> {
  // Same hole, other actor: enemies read the same grid, so a Sno-Bee could
  // step into a flying block instead of being squashed by it.
  const { game, data } = emptyBoard();
  data.pengo = { ...data.pengo, x: 2, y: 4, direction: 'right' };
  data.grid[4][3] = 'ice';
  game.handlePush();

  const block = data.slidingBlocks[0];
  const enemy = enemyAt(block.x + 1, 4);
  // Aimed at the block's own cell, and one tick short of its move delay -
  // updateEnemies() increments moveTimer and skips until it reaches
  // enemySpeed, so a single call with moveTimer 0 moves nobody and the
  // test would pass without exercising anything.
  enemy.targetX = block.x;
  enemy.targetY = 4;
  enemy.moveTimer = getLevelConfig(data.level).enemySpeed - 1;
  data.enemies = [enemy];

  const before = { x: enemy.x, y: enemy.y };
  (game as unknown as { updateEnemies(): void }).updateEnemies();
  assert.ok(enemy.x !== before.x || enemy.y !== before.y,
    'precondition: the Sno-Bee must actually have taken its move this tick');
  assert.ok(!(enemy.x === block.x && enemy.y === block.y),
    'a Sno-Bee must not step into the cell a block in flight occupies');
}
