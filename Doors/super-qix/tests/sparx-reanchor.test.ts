/**
 * Regression tests for the "player position resets after drawing" bug.
 *
 * Reported live: closing a claim (drawing a stix back to the border) could
 * suddenly kill the player and reset the marker to bottom-center, even with
 * no Sparx anywhere nearby on screen.
 *
 * Root cause: `sparx.pathIndex` is a raw index into `d.borderPath`, but
 * `updateBorderPath()` (game/qix-engine.ts) rebuilds that array from scratch
 * every time an area is claimed - different length, different point order.
 * The stale index then resolves to an unrelated cell on the very next tick,
 * teleporting the Sparx - often onto the marker's landing cell - which trips
 * `checkSparxCollision`'s `dist < 1.2` check and kills the player.
 *
 * Fix: `EnemySystem.reanchorBorderPositions()` re-maps every Sparx's
 * pathIndex to the nearest point in the rebuilt path, called right after
 * `updateBorderPath()` in `QixEngine`'s stix-completion branch.
 */

import assert from 'assert';
import { EnemySystem } from '../game/enemies';
import { QixEngine } from '../game/qix-engine';
import { SuperQixData } from '../game/types';
import { FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES } from '../game/constants';

function createData(): SuperQixData {
  return {
    state: 'menu',
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    claimedPercent: 0,
    targetPercent: 75,
    scoreMultiplier: 1,

    field: [],
    fieldWidth: FIELD_WIDTH,
    fieldHeight: FIELD_HEIGHT,

    marker: {
      x: 0, y: 0, isDrawing: false, drawSpeed: null,
      hasShield: false, speedBoost: false, speedBoostTimer: 0,
    },
    currentStix: null,

    qixList: [],
    sparxList: [],
    fuse: null,
    qixIdCounter: 0,
    sparxIdCounter: 0,

    powerUps: [],
    powerUpIdCounter: 0,
    collectedLetters: [],
    levelWord: '',
    activeEffects: [],

    borderPath: [],

    highscores: [],
    menuSelection: 0,
    playerName: '',
    playerNameCursor: 0,

    lastUpdateTime: Date.now(),
    frameCount: 0,
    levelStartTime: Date.now(),
    stopTimer: 0,

    transitionTimer: 0,
    transitionMessage: '',
  };
}

/**
 * Unit test: reanchorBorderPositions keeps a Sparx physically where it was,
 * even when the border path is rebuilt with a completely different length
 * and point order (the exact situation updateBorderPath() creates on a
 * claim).
 */
export async function reanchorKeepsSparxPhysicallyStable(): Promise<void> {
  const data = createData();
  const enemySystem = new EnemySystem(data);

  // Old path: the right-hand border column, with the sparx partway down it.
  const edgeX = FIELD_WIDTH - 1;
  data.borderPath = [];
  for (let y = 0; y < FIELD_HEIGHT; y++) data.borderPath.push({ x: edgeX, y });
  data.sparxList = [{
    id: 1, x: edgeX, y: 5, pathIndex: 5, direction: 1, speed: 1,
    isSuper: false, frozen: false, frozenTimer: 0,
  }];

  // New path: same points, completely different order and length - the
  // shape updateBorderPath() produces after a claim reshapes the border.
  const shuffled = [...data.borderPath].reverse();
  shuffled.push({ x: 0, y: 0 }, { x: 0, y: 1 });
  data.borderPath = shuffled;

  enemySystem.reanchorBorderPositions();

  const sparx = data.sparxList[0];
  // Physically still where it was - not teleported to whatever cell the
  // stale numeric index 5 now happens to occupy in the reordered array.
  assert.strictEqual(sparx.x, edgeX);
  assert.strictEqual(sparx.y, 5);
  assert.strictEqual(data.borderPath[sparx.pathIndex].x, edgeX);
  assert.strictEqual(data.borderPath[sparx.pathIndex].y, 5);
}

function setupPlayingEngine(): { engine: QixEngine; data: SuperQixData } {
  const data = createData();
  const engine = new QixEngine(data, () => {});
  engine.initLevel(1);
  data.state = 'playing';
  // A stationary Qix keeps the claimAreaWithoutQix() flood fill from
  // sweeping the entire rest of the field into "claimed" the moment any
  // sliver closes - same as a real level, which always has at least one Qix.
  data.qixList = [{
    id: 1, x: 5, y: 5, vx: 0, vy: 0, speed: 0,
    segments: [{ x: 5, y: 5 }], frozen: true, frozenTimer: 999999,
  }];
  return { engine, data };
}

// Bypasses handleDirection's move-rate throttle, which otherwise drops
// same-millisecond calls in a synchronous test.
function move(engine: QixEngine, dir: 'up' | 'down' | 'left' | 'right'): void {
  (engine as any).lastMoveTime = 0;
  engine.handleDirection(dir);
}

/**
 * Draws an L-shaped stix out from the bottom-center spawn point and closes
 * it against the border - the same shape any player draws to claim a
 * corner. Ends with the marker sitting on the border at the closing cell.
 */
function drawAndCloseClaim(engine: QixEngine): void {
  engine.handleFastDraw();
  move(engine, 'up'); move(engine, 'up'); move(engine, 'up');
  move(engine, 'right'); move(engine, 'right'); move(engine, 'right');
  move(engine, 'down'); move(engine, 'down'); move(engine, 'down');
}

/**
 * Work out, from the real engine, the Sparx setup that reproduces the bug:
 * the index the marker's landing cell occupies in the REBUILT border path,
 * and the physical point that same index named in the ORIGINAL path.
 *
 * A Sparx standing at that original point holds exactly that index, so once
 * the claim reorders the array the stale index resolves onto the marker.
 *
 * Derived at runtime rather than hardcoded: these indices are a function of
 * the field geometry, and hardcoding them silently broke this test the
 * moment FIELD_WIDTH changed for the cell-aspect fix.
 */
function probeStaleIndexCollision(): { staleIndex: number; startX: number; startY: number } {
  const { engine, data } = setupPlayingEngine();
  const originalPath = data.borderPath.map(p => ({ ...p }));

  drawAndCloseClaim(engine);

  const staleIndex = data.borderPath.findIndex(
    p => p.x === data.marker.x && p.y === data.marker.y
  );
  assert.ok(
    staleIndex >= 0,
    "marker's landing cell is not in the rebuilt border path - probe needs revisiting"
  );
  const start = originalPath[staleIndex];
  assert.ok(
    start,
    `original border path has no index ${staleIndex} - probe needs revisiting`
  );

  return { staleIndex, startX: start.x, startY: start.y };
}

/**
 * Integration test at the QixEngine level: closing a claim rebuilds the
 * border path out from under every Sparx. Without reanchoring, the next
 * tick's Sparx move snaps it wherever the stale index now lands - here,
 * onto the marker's fresh position - killing the player and resetting the
 * marker. With the fix wired in, it does not.
 */
export async function completingAClaimDoesNotTeleportSparxOntoTheMarker(): Promise<void> {
  const { staleIndex, startX, startY } = probeStaleIndexCollision();
  // RED: same scenario, with the fix's call site stubbed out, reproduces
  // the reported symptom - proves the bug is real, not just plausible.
  {
    const { engine, data } = setupPlayingEngine();
    (engine as any).enemySystem.reanchorBorderPositions = () => {};

    // A Sparx patrolling the border at an ordinary spot, nowhere near where
    // the marker is about to draw - but holding the index that the rebuilt
    // path will re-point at the marker's landing cell.
    data.sparxList = [{
      id: 1, x: startX, y: startY, pathIndex: staleIndex, direction: 1, speed: 0,
      isSuper: false, frozen: false, frozenTimer: 0,
    }];

    drawAndCloseClaim(engine);
    const landingX = data.marker.x;
    const landingY = data.marker.y;
    const livesBeforeTick = data.lives;

    engine.update(); // next game tick: Sparx snaps to the stale index

    assert.strictEqual(
      data.lives, livesBeforeTick - 1,
      'expected the un-reanchored stale index to kill the player (RED case did not reproduce - scenario needs adjusting)'
    );
    assert.notStrictEqual(
      [data.marker.x, data.marker.y].join(','),
      [landingX, landingY].join(','),
      'expected the death to reset the marker off its landing cell'
    );
  }

  // GREEN: identical scenario, real (unstubbed) code path.
  {
    const { engine, data } = setupPlayingEngine();
    data.sparxList = [{
      id: 1, x: startX, y: startY, pathIndex: staleIndex, direction: 1, speed: 0,
      isSuper: false, frozen: false, frozenTimer: 0,
    }];

    drawAndCloseClaim(engine);
    const landingX = data.marker.x;
    const landingY = data.marker.y;
    const livesBeforeTick = data.lives;

    engine.update();

    assert.strictEqual(data.lives, livesBeforeTick, 'player should not have died to a teleported Sparx');
    assert.strictEqual(data.marker.x, landingX, 'marker should stay on its landing cell, not reset');
    assert.strictEqual(data.marker.y, landingY, 'marker should stay on its landing cell, not reset');
  }
}
