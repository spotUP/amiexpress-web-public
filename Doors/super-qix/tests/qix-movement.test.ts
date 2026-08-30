/**
 * Regression tests for the Qix that stopped moving.
 *
 * Reported live: "the monster that is flying around always gets stuck in a
 * wall", together with "my position gets reset to the start position after
 * each time I draw" - one cause behind both. A Qix parked in the player's
 * drawing area kills on contact, and a death resets the marker to spawn.
 *
 * The bug: updateQix reversed velocity when the FLOORED next position
 * reached FIELD_HEIGHT-1 (the border row), but then clamped the position to
 * FIELD_HEIGHT-2. Between those two values the Qix was shoved back every
 * tick and its velocity was never reversed, so vy stayed at full speed into
 * the wall forever while the per-bounce positional jitter decayed the other
 * axis to nothing.
 *
 * Measured before the fix, over 1500 ticks: 98% of ticks within 1.5 cells of
 * a wall, movement on 2% of ticks, 13 of 576 playable cells ever visited,
 * one cell occupied for 287 consecutive ticks. After: 26% / 100% / 271.
 */

import assert from 'assert';
import { QixEngine } from '../game/qix-engine';
import { SuperQixData } from '../game/types';
import { FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES } from '../game/constants';

function createData(): SuperQixData {
  return {
    state: 'menu', score: 0, lives: STARTING_LIVES, level: 1,
    claimedPercent: 0, targetPercent: 75, scoreMultiplier: 1,
    field: [], fieldWidth: FIELD_WIDTH, fieldHeight: FIELD_HEIGHT,
    marker: {
      x: 0, y: 0, isDrawing: false, drawSpeed: null,
      hasShield: false, speedBoost: false, speedBoostTimer: 0,
    },
    currentStix: null,
    qixList: [], sparxList: [], fuse: null, qixIdCounter: 0, sparxIdCounter: 0,
    powerUps: [], powerUpIdCounter: 0, collectedLetters: [], levelWord: '',
    activeEffects: [], borderPath: [],
    highscores: [], menuSelection: 0, playerName: '', playerNameCursor: 0,
    lastUpdateTime: Date.now(), frameCount: 0, levelStartTime: Date.now(),
    stopTimer: 0, timeMeter: 0, transitionTimer: 0, transitionMessage: '',
  };
}

function runningEngine(): { engine: QixEngine; data: SuperQixData } {
  const data = createData();
  const engine = new QixEngine(data, () => {});
  engine.initLevel(1);
  data.state = 'playing';
  // Sparx are irrelevant here and only add noise.
  data.sparxList = [];
  return { engine, data };
}

/**
 * The Qix must actually roam. These thresholds sit far below what the fixed
 * code achieves and far above what the broken code could reach, so the test
 * is about the defect, not about a particular random walk.
 */
export async function qixKeepsMovingInsteadOfStickingToAWall(): Promise<void> {
  const TICKS = 1500;
  const { engine, data } = runningEngine();
  const qix = data.qixList[0];
  assert.ok(qix, 'level 1 should spawn a Qix');

  const visited = new Set<string>();
  let movedTicks = 0;
  let nearWallTicks = 0;
  let previous = { x: qix.x, y: qix.y };

  for (let t = 0; t < TICKS; t++) {
    engine.update();

    if (Math.hypot(qix.x - previous.x, qix.y - previous.y) > 0.05) movedTicks++;
    previous = { x: qix.x, y: qix.y };

    const gapX = Math.min(qix.x - 1, (FIELD_WIDTH - 2) - qix.x);
    const gapY = Math.min(qix.y - 1, (FIELD_HEIGHT - 2) - qix.y);
    if (Math.min(gapX, gapY) < 1.5) nearWallTicks++;

    visited.add(`${Math.floor(qix.x)},${Math.floor(qix.y)}`);
  }

  const movedPct = (100 * movedTicks) / TICKS;
  const wallPct = (100 * nearWallTicks) / TICKS;

  assert.ok(
    movedPct > 90,
    `Qix moved on only ${movedPct.toFixed(0)}% of ticks - it is stuck (broken code: 2%)`
  );
  assert.ok(
    wallPct < 70,
    `Qix spent ${wallPct.toFixed(0)}% of ticks pinned against a wall (broken code: 98%)`
  );
  assert.ok(
    visited.size > 100,
    `Qix only ever visited ${visited.size} cells - it is not roaming (broken code: 13)`
  );
}

/**
 * The specific mechanism, pinned directly: a Qix travelling into the bottom
 * edge must have that velocity component reversed. The old code never
 * reversed it, because the bounce test and the clamp used different limits.
 */
export async function qixDrivenIntoTheEdgeHasItsVelocityReversed(): Promise<void> {
  const { engine, data } = runningEngine();
  const qix = data.qixList[0];

  // Sitting on the last playable row, heading straight down into the border.
  qix.x = Math.floor(FIELD_WIDTH / 2) + 0.5;
  qix.y = FIELD_HEIGHT - 2;
  qix.vx = 0;
  qix.vy = 2;
  qix.speed = 2;

  for (let t = 0; t < 20; t++) {
    engine.update();
    if (qix.vy < 0) break;
  }

  assert.ok(
    qix.vy < 0,
    'Qix drove into the bottom border for 20 ticks without its vertical velocity ever reversing'
  );
  // The Qix position is continuous, so compare the CELL it occupies rather
  // than the raw coordinate: y = 16.99 is still inside playable row 16.
  const cellY = Math.floor(qix.y);
  const cellX = Math.floor(qix.x);
  assert.ok(
    cellY >= 1 && cellY <= FIELD_HEIGHT - 2,
    `Qix left the playable rows (y=${qix.y}, row ${cellY})`
  );
  assert.ok(
    cellX >= 1 && cellX <= FIELD_WIDTH - 2,
    `Qix left the playable columns (x=${qix.x}, column ${cellX})`
  );
}

/**
 * A completed stix turns the cells under it into claimed ground, which can
 * strand a Qix inside the claimed region. It must find its way back out
 * rather than sit there.
 */
export async function qixTrappedInClaimedGroundEscapes(): Promise<void> {
  const { engine, data } = runningEngine();
  const qix = data.qixList[0];

  // Claim a block and drop the Qix in the middle of it.
  for (let y = 4; y <= 8; y++) {
    for (let x = 4; x <= 8; x++) {
      data.field[y][x] = 'claimed';
    }
  }
  qix.x = 6.5;
  qix.y = 6.5;

  engine.update();

  const cell = data.field[Math.floor(qix.y)]?.[Math.floor(qix.x)];
  assert.strictEqual(
    cell, 'unclaimed',
    `Qix stayed inside claimed ground at (${qix.x.toFixed(1)}, ${qix.y.toFixed(1)}) - cell is "${cell}"`
  );
}
