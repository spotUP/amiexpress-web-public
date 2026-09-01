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
import { PengoGame } from '../game/pengo-game';
import { PengoData, Enemy } from '../game/types';
import {
  GRID_WIDTH, GRID_HEIGHT, SCORES, MAX_SCORE, crushComboScore, MAX_LIVING_ENEMIES,
} from '../game/constants';

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

  game.handlePush();
  const afterFirstAlignment = data.score;
  assert.ok(afterFirstAlignment >= SCORES.diamondAlign2, 'the bonus must have fired at all');

  // A second, unrelated push - the diamonds are already aligned and
  // untouched; only the ice-block push score should move. isPushing must
  // be cleared by hand (as the real game loop's animation timer would),
  // or handlePush()'s own re-entrancy guard silently no-ops the second call.
  data.pengo.isPushing = false;
  data.grid[4][5] = 'ice';
  game.handlePush();

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
  game.handlePush();
  assert.strictEqual(data.grid[3][4], 'diamond', 'sanity: still there before the locked push');
  game.cues.clear();
  data.pengo.isPushing = false;

  // Face the aligned diamond and try to push it.
  data.pengo.x = 3;
  data.pengo.y = 3;
  data.pengo.direction = 'right';
  game.handlePush();

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
  game.handlePush();

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

  game.handlePush();

  assert.strictEqual(data.grid[4][1], 'empty', 'a block with nowhere to go must be destroyed, not left in place');
  assert.deepStrictEqual(game.cues.drain(), ['dash', 'switch']);
}

/** A block that CAN slide at least one cell is unaffected - only the boxed-in case destroys. */
export async function aBlockThatCanMoveIsNotDestroyed(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][5] = 'ice';
  game.handlePush();

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
