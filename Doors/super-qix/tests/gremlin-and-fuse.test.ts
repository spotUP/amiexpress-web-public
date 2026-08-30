/**
 * Backtracking, the Fuse, and the Gremlin's temperament.
 *
 * Covers FAQ-2.1f (crossing your own line is fatal), FAQ-2.1g and FAQ-2.5.3e
 * (backtracking along the line IS allowed), FAQ-2.2n/2.2o/2.2p (the fuse
 * starts when you stop, resumes where it left off, and treats backtracking
 * as not moving), FAQ-2.2a (the Gremlin leans towards the marker), FAQ-2.2d
 * (it presses harder on later levels once you detach), FAQ-2.2e and
 * FAQ-2.5.3b (it divides on later levels, but stays one Gremlin normally),
 * and FAQ-2.1j/2.2f (the region holding a Gremlin is Outside, and the LARGER
 * one wins when it has divided).
 */

import assert from 'assert';
import { QixEngine } from '../game/qix-engine';
import { EnemySystem } from '../game/enemies';
import { DrawingSystem } from '../game/drawing';
import { SuperQixData, Direction } from '../game/types';
import {
  FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES, FUSE_START_DELAY, GAME_TICK_MS,
  QIX_SPLIT_FROM_LEVEL, QIX_MAX_COPIES,
} from '../game/constants';

function createData(): SuperQixData {
  return {
    state: 'menu', score: 0, lives: STARTING_LIVES, level: 1,
    claimedPercent: 0, targetPercent: 75, scoreMultiplier: 1,
    field: [], fieldWidth: FIELD_WIDTH, fieldHeight: FIELD_HEIGHT,
    marker: {
      x: 0, y: 0, isDrawing: false,
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

function startedEngine(level = 1): { engine: QixEngine; data: SuperQixData } {
  const data = createData();
  const engine = new QixEngine(data, () => {});
  engine.initLevel(level);
  data.state = 'playing';
  data.sparxList = [];
  data.qixList = [];
  return { engine, data };
}

function move(engine: QixEngine, dir: Direction): void {
  (engine as any).lastMoveTime = 0;
  engine.handleDirection(dir);
}

/** FAQ-2.1 / FAQ-2.5.3: the marker may retrace its own unfinished line. */
export async function theMarkerCanBacktrackAlongItsOwnLine(): Promise<void> {
  const { engine, data } = startedEngine();

  engine.handleDraw();
  const start = { x: data.marker.x, y: data.marker.y };
  for (let i = 0; i < 4; i++) move(engine, 'up');

  const outermost = { x: data.marker.x, y: data.marker.y };
  const lengthOut = data.currentStix!.points.length;
  assert.strictEqual(lengthOut, 5, 'four steps out should give a five-point line');

  // Retrace one step: the marker moves back and the line SHORTENS.
  move(engine, 'down');
  assert.strictEqual(data.marker.y, outermost.y + 1, 'the marker should step back');
  assert.strictEqual(
    data.currentStix!.points.length, lengthOut - 1,
    'the line should shorten as the marker retraces it'
  );
  assert.strictEqual(
    data.field[outermost.y][outermost.x], 'unclaimed',
    'the abandoned cell should return to open field'
  );

  // All the way back out.
  for (let i = 0; i < 3; i++) move(engine, 'down');
  assert.strictEqual(data.marker.x, start.x);
  assert.strictEqual(data.marker.y, start.y);
}

/**
 * FAQ-2.1: "You are not allowed to cross your own line." Backtracking is the
 * single exception, and only onto the cell just behind the marker.
 */
export async function crossingTheLineElsewhereIsStillRefused(): Promise<void> {
  const { engine, data } = startedEngine();
  const drawing: any = (engine as any).drawingSystem;

  engine.handleDraw();
  for (let i = 0; i < 4; i++) move(engine, 'up');
  for (let i = 0; i < 3; i++) move(engine, 'right');

  const points = data.currentStix!.points;
  const behind = points[points.length - 2];
  const farBack = points[1];

  assert.strictEqual(drawing.isBacktrack(behind), true, 'the cell just behind is a backtrack');
  assert.strictEqual(
    drawing.isBacktrack(farBack), false,
    'an earlier part of the line is NOT a backtrack, it is a crossing'
  );
  assert.strictEqual(
    drawing.extendStix(farBack), false,
    'the line must refuse to be drawn across itself'
  );
}

/** FAQ-2.2: the fuse starts once the player stops while drawing. */
export async function stoppingWhileDrawingLightsTheFuse(): Promise<void> {
  const { engine, data } = startedEngine();

  engine.handleDraw();
  for (let i = 0; i < 5; i++) move(engine, 'up');
  assert.strictEqual(data.fuse, null, 'no fuse while the player is still moving');

  // Stand still long enough for it to catch.
  const ticks = Math.ceil(FUSE_START_DELAY / GAME_TICK_MS) + 2;
  for (let i = 0; i < ticks; i++) engine.update();

  assert.ok(data.fuse, 'stopping should light the fuse');
  assert.strictEqual(data.fuse!.active, true);
}

/**
 * FAQ-2.2: "If you begin moving again, the fuse stops, but another pause
 * will cause it to light up wherever it left off." It must not restart from
 * the beginning of the line.
 */
export async function theFuseResumesWhereItStoppedRatherThanRestarting(): Promise<void> {
  const { engine, data } = startedEngine();

  engine.handleDraw();
  for (let i = 0; i < 8; i++) move(engine, 'up');

  const ticks = Math.ceil(FUSE_START_DELAY / GAME_TICK_MS) + 6;
  for (let i = 0; i < ticks; i++) engine.update();
  assert.ok(data.fuse, 'the fuse should be burning');
  const burntTo = data.fuse!.pathIndex;
  assert.ok(burntTo > 0, 'it should have travelled some way along the line');

  // Move again: the fuse holds position rather than being extinguished.
  move(engine, 'up');
  engine.update();
  assert.ok(data.fuse, 'moving must not throw the fuse away');
  assert.ok(
    data.fuse!.pathIndex >= burntTo,
    `the fuse restarted: it was at ${burntTo} and is now at ${data.fuse!.pathIndex}`
  );
}

/**
 * FAQ-2.2: "backtracking counts as not moving for the purposes of the Fuse,
 * so be quick about it!"
 */
export async function backtrackingDoesNotResetTheFuseTimer(): Promise<void> {
  const { engine, data } = startedEngine();

  engine.handleDraw();
  for (let i = 0; i < 6; i++) move(engine, 'up');

  // Build up most of the delay standing still.
  const nearly = Math.ceil(FUSE_START_DELAY / GAME_TICK_MS) - 1;
  for (let i = 0; i < nearly; i++) engine.update();
  const timerBefore = data.stopTimer;
  assert.ok(timerBefore > 0, 'the stop timer should have been accumulating');

  // Retrace a step. Drawing forward would reset the timer; backtracking must not.
  move(engine, 'down');
  assert.ok(
    data.stopTimer >= timerBefore,
    `backtracking reset the fuse timer (${timerBefore} -> ${data.stopTimer})`
  );

  // Whereas drawing forward into new ground DOES reset it.
  move(engine, 'up');
  assert.strictEqual(data.stopTimer, 0, 'drawing onward should reset the fuse timer');
}

/**
 * FAQ-2.2: the Gremlin's wander is "weighted somewhat towards your marker".
 *
 * The lean is deliberately gentle, so an absolute distance threshold on what
 * is still a random walk would be a coin toss. This measures the SAME
 * geometry twice - once with the lean, once with it disabled - and asks only
 * that the lean brings it closer on average. That is the effect the FAQ
 * describes, and it is what would disappear if the weighting were removed.
 */
export async function theGremlinLeansTowardsTheMarker(): Promise<void> {
  const markerX = 2;
  const markerY = FIELD_HEIGHT - 2;

  function meanFinalDistance(withPull: boolean): number {
    let total = 0;
    const runs = 40;

    for (let run = 0; run < runs; run++) {
      const { engine, data } = startedEngine();
      data.marker.x = markerX;
      data.marker.y = markerY;
      data.qixList = [{
        id: 1,
        x: FIELD_WIDTH - 3,
        y: 2,
        vx: 1.5, vy: 1.5, speed: 2,
        segments: [{ x: FIELD_WIDTH - 3, y: 2 }],
        frozen: false, frozenTimer: 0,
      }];

      const enemies: any = (engine as any).enemySystem;
      if (!withPull) enemies.markerPull = () => 0;

      // Sample the distance throughout, not just at the end: where it
      // SPENDS its time is the claim, and one final position is noise.
      let sampled = 0;
      let samples = 0;
      for (let tick = 0; tick < 600; tick++) {
        enemies.update();
        if (tick % 10 === 0) {
          const q = data.qixList[0];
          sampled += Math.hypot(q.x - markerX, q.y - markerY);
          samples++;
        }
      }
      total += sampled / samples;
    }

    return total / runs;
  }

  const leaning = meanFinalDistance(true);
  const neutral = meanFinalDistance(false);

  assert.ok(
    leaning < neutral,
    `the weighting made no difference: mean distance to the marker was ` +
    `${leaning.toFixed(2)} with the lean and ${neutral.toFixed(2)} without`
  );
}

/** FAQ-2.2: it presses harder once the player detaches, more so later on. */
export async function theGremlinPressesHarderWhenThePlayerDetaches(): Promise<void> {
  const data = createData();
  const enemies: any = new EnemySystem(data);

  data.level = 1;
  data.marker.isDrawing = false;
  const idleEarly = enemies.markerPull();

  data.marker.isDrawing = true;
  const drawingEarly = enemies.markerPull();

  data.level = 16;
  const drawingLate = enemies.markerPull();

  assert.ok(drawingEarly > idleEarly, 'detaching should raise the Gremlin\'s interest');
  assert.ok(drawingLate > drawingEarly, 'and later levels should raise it further');
  assert.ok(drawingLate <= 1, 'but it must never become a perfect homing missile');
}

/**
 * FAQ-2.5.3: "There is usually only one Gremlin in Super Qix (though he
 * sometimes divides into two or more during a level)" - and FAQ-2.2 puts the
 * dividing in the later levels.
 */
export async function theGremlinDividesOnlyOnLaterLevels(): Promise<void> {
  // An early level: one Gremlin, and it stays one.
  const early = startedEngine(1);
  early.data.qixList = [{
    id: 1, x: 10, y: 10, vx: 1, vy: 1, speed: 2,
    segments: [{ x: 10, y: 10 }], frozen: false, frozenTimer: 0,
  }];
  const earlyEnemies: any = (early.engine as any).enemySystem;
  for (let tick = 0; tick < 3000; tick++) earlyEnemies.maybeSplitQix();
  assert.strictEqual(
    early.data.qixList.length, 1,
    'the Gremlin should not divide on an early level'
  );

  // A later level: it does divide, and never past the cap.
  const late = startedEngine(QIX_SPLIT_FROM_LEVEL + 2);
  late.data.qixList = [{
    id: 1, x: 10, y: 10, vx: 1, vy: 1, speed: 2,
    segments: [{ x: 10, y: 10 }], frozen: false, frozenTimer: 0,
  }];
  const lateEnemies: any = (late.engine as any).enemySystem;
  for (let tick = 0; tick < 20000; tick++) lateEnemies.maybeSplitQix();

  assert.ok(late.data.qixList.length > 1, 'the Gremlin should divide on a later level');
  assert.ok(
    late.data.qixList.length <= QIX_MAX_COPIES,
    `it divided past the cap: ${late.data.qixList.length} copies`
  );
}

/**
 * FAQ-2.2: cut between two copies and "'Outside' is considered to be the
 * larger of the two areas and the Gremlin trapped in the smaller area will
 * disappear when it fills in".
 */
export async function cuttingBetweenTwoGremlinsClaimsTheSmallerSideAndTrapsIt(): Promise<void> {
  const data = createData();
  const engine = new QixEngine(data, () => {});
  engine.initLevel(1);
  data.state = 'playing';
  data.sparxList = [];

  // Wall the field into a narrow strip on the left and a wide area right.
  const wall = 6;
  for (let y = 1; y < FIELD_HEIGHT - 1; y++) data.field[y][wall] = 'claimed';

  // One Gremlin each side.
  data.qixList = [
    { id: 1, x: 3, y: 5, vx: 0, vy: 0, speed: 0,
      segments: [{ x: 3, y: 5 }], frozen: true, frozenTimer: 999999 },
    { id: 2, x: 20, y: 10, vx: 0, vy: 0, speed: 0,
      segments: [{ x: 20, y: 10 }], frozen: true, frozenTimer: 999999 },
  ];

  const drawing: any = (engine as any).drawingSystem;
  const result = drawing.claimAreaWithoutQix();

  // The big right-hand side is Outside; the narrow left strip is claimed.
  assert.ok(result.percent > 0, 'the smaller side should have been claimed');
  const claimed = new Set(result.filled.map((p: any) => `${p.x},${p.y}`));
  assert.ok(claimed.has('3,5'), 'the narrow side should be in the claimed area');
  assert.ok(!claimed.has('20,10'), 'the larger side must be left as Outside');

  // And the Gremlin sealed into the claimed side is gone.
  assert.strictEqual(data.qixList.length, 1, 'the trapped Gremlin should disappear');
  assert.strictEqual(data.qixList[0].id, 2, 'the one in the larger area survives');
}
