/**
 * Backtracking, the Fuse, and the Gremlin's temperament.
 *
 * Covers FAQ-2.1f (crossing your own line is REFUSED, not fatal - "you are not
 * allowed to cross your own line", and the refusal lights the fuse the way
 * QUIX's qmoves.c does), FAQ-2.1g and FAQ-2.5.3e
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
import { PowerUpSystem } from '../game/powerups';
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
    activeEffects: [], borderPath: [], internalLines: [],
    highscores: [], menuSelection: 0, playerName: '', playerNameCursor: 0,
    lastUpdateTime: Date.now(), frameCount: 0, levelStartTime: Date.now(),
    stopTimer: 0, gremlinsCaptured: 0, timeMeter: 0, warp: null, transitionTimer: 0, transitionMessage: '',
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

/**
 * Walk the marker into an earlier part of its own line, and nothing happens
 * except that the move is refused.
 *
 * Q-1a. FAQ 2.1: "You are not allowed to cross your own line, which can result
 * in painting yourself into a corner if you're not careful." Not allowed means
 * refused - and painting yourself into a corner is only worth warning about if
 * it does not kill you outright. QUIX agrees: qmoves.c:226-230 refuses the move.
 *
 * The geometry: up three, right one, down one puts the head one cell to the
 * RIGHT of the line's own vertical run, so stepping left is a crossing rather
 * than a backtrack.
 */
export async function theMarkerCannotCrossItsOwnLine(): Promise<void> {
  const { engine, data } = startedEngine();
  const drawing: any = (engine as any).drawingSystem;

  engine.handleDraw();
  for (let i = 0; i < 3; i++) move(engine, 'up');
  move(engine, 'right');
  move(engine, 'down');

  const head = { x: data.marker.x, y: data.marker.y };
  const target = { x: head.x - 1, y: head.y };
  assert.strictEqual(
    data.field[target.y][target.x], 'stix',
    'the cell to the left should be an earlier part of the line'
  );
  assert.strictEqual(
    drawing.isBacktrack(target), false,
    'it must be a crossing, not the backtrack cell, or this proves nothing'
  );

  const livesBefore = data.lives;
  const lengthBefore = data.currentStix!.points.length;
  move(engine, 'left');

  assert.strictEqual(
    data.lives, livesBefore,
    'crossing your own line must not cost a life'
  );
  assert.deepStrictEqual(
    { x: data.marker.x, y: data.marker.y }, head,
    'the marker should stay where it was - the move is refused, not taken'
  );
  assert.ok(data.currentStix, 'the line must survive a refused crossing');
  assert.strictEqual(
    data.currentStix!.points.length, lengthBefore,
    'a refused crossing must not extend or shorten the line'
  );
}

/**
 * Q-1b. QUIX lights the fuse when the player is wedged (qmoves.c:214-219), so
 * a marker painted into a corner is on the clock rather than merely stuck.
 * Without this, refusing the move would turn a death into a safe haven.
 */
export async function aRefusedCrossingLightsTheFuse(): Promise<void> {
  const { engine, data } = startedEngine();

  engine.handleDraw();
  for (let i = 0; i < 3; i++) move(engine, 'up');
  move(engine, 'right');
  move(engine, 'down');
  assert.strictEqual(data.fuse, null, 'no fuse yet - the player has been moving');

  move(engine, 'left');   // refused: into its own line

  assert.ok(data.fuse, 'a refused crossing should light the fuse at once');
  assert.strictEqual(data.fuse!.active, true, 'and it should be burning');
  assert.ok(
    data.stopTimer >= FUSE_START_DELAY,
    `the stop timer should be past the delay, was ${data.stopTimer}`
  );
}

/**
 * Q-1d. The fuse is the whole reason refusing the move is not a free pass:
 * stand still while drawing and it burns the length of the line and kills.
 */
export async function theFuseStillKillsWhenItReachesTheMarker(): Promise<void> {
  const { engine, data } = startedEngine();
  const enemies: any = (engine as any).enemySystem;

  const realFuse = enemies.checkFuseCollision.bind(enemies);
  let cause = '';
  enemies.checkFuseCollision = (...a: any[]) => {
    const r = realFuse(...a);
    if (r) cause = 'fuse';
    return r;
  };

  engine.handleDraw();
  for (let i = 0; i < 8; i++) move(engine, 'up');

  const livesBefore = data.lives;
  const ticks = Math.ceil(FUSE_START_DELAY / GAME_TICK_MS) + 500;
  let died = false;
  for (let i = 0; i < ticks; i++) {
    engine.update();
    if (data.lives < livesBefore) { died = true; break; }
  }

  assert.ok(died, 'standing still while drawing should let the fuse catch the marker');
  assert.strictEqual(cause, 'fuse', `the fuse should be what killed, not ${cause || 'something else'}`);
}

/**
 * An ordinary draw at BBS pace must usually survive.
 *
 * Reported live: "my position still gets reset to the start position every
 * time I draw something". Measured at the time: a fourteen-cell draw with a
 * human gap between keypresses died 30 times out of 30, always to the fuse,
 * because it lit after only 500ms - shorter than the gap between two taps -
 * and the Skulls were quicker than a tapping marker, contradicting FAQ 2.2's
 * "you can outrun them if the way forward is clear".
 *
 * This asserts the outcome the player actually experiences rather than any
 * one constant, so retuning any of them keeps the guarantee.
 */
export async function theFuseIsNotWhatKillsAnOrdinaryDraw(): Promise<void> {
  // 150 rather than 30. This is a stochastic assertion against a threshold
  // the real rate sits close to: measured over 200 runs it is 57%, and at
  // THIRTY runs the sampling error is about nine points, so a true 57% dips
  // under half roughly one run in five. It was doing so before the Gremlin
  // pacing was touched as well - at the original speed the rate is 45%, so
  // this test has been passing partly on luck since it was written.
  //
  // A bigger sample is a stopgap, not the cure: the cure is seeding the
  // engine's RNG so the run is reproducible. Recorded as such.
  const runs = 150;
  const pauseTicks = 20;   // ~660ms between keypresses: tapping, not holding
  let survived = 0;
  const causes: Record<string, number> = {};

  for (let run = 0; run < runs; run++) {
    const data = createData();
    const engine = new QixEngine(data, () => {});
    engine.initLevel(1);
    data.state = 'playing';

    const enemies: any = (engine as any).enemySystem;
    const realFuse = enemies.checkFuseCollision.bind(enemies);
    const realQix = enemies.checkQixCollision.bind(enemies);
    let cause = '';
    enemies.checkFuseCollision = (...a: any[]) => { const r = realFuse(...a); if (r) cause = 'fuse'; return r; };
    enemies.checkQixCollision = (...a: any[]) => { const r = realQix(...a); if (r) cause = 'gremlin'; return r; };

    const lives = data.lives;
    const moves: Direction[] = [
      ...Array(4).fill('up'), ...Array(6).fill('right'), ...Array(4).fill('down'),
    ] as Direction[];

    let died = false;
    outer: for (const m of moves) {
      move(engine, m);
      for (let tick = 0; tick < pauseTicks; tick++) {
        engine.update();
        if (data.lives < lives) { died = true; break outer; }
      }
    }

    if (died) causes[cause || 'other'] = (causes[cause] || 0) + 1;
    else survived++;
  }

  const detail = Object.entries(causes).map(([k, v]) => `${k}:${v}`).join(' ') || 'none';

  // What this test was written for, and still guards: the FUSE must not be
  // what kills an ordinary draw. It lit after 500ms once - shorter than the
  // gap between two taps - and killed thirty draws out of thirty.
  assert.ok(
    (causes['fuse'] || 0) <= runs / 10,
    `the fuse killed ${causes['fuse']}/${runs} ordinary draws (all deaths: ${detail}); ` +
    'it should only punish a real pause'
  );

  // The blanket "half of all draws survive at tapping pace" assertion that
  // used to sit here has been DROPPED, deliberately, and it is worth being
  // plain about why rather than quietly deleting it.
  //
  // It was written when the Gremlin barely leaned towards the marker at all,
  // and it encoded the opposite of what the game now wants: the Gremlin is
  // deliberately aggressive (see QIX_BASE_PULL), so a player who stands
  // still for two thirds of a second between steps SHOULD usually be caught.
  // Reported twice while testing: "he circles himself all the time the
  // gremlin he is no threat at all."
  //
  // The two cannot both hold. What replaces it is
  // anOrdinaryDrawWithHeldKeysIsComfortablySafe, which measures the cadence
  // the door is actually played at - held keys step the marker once a frame,
  // and the 660ms tapping model predates held-key tracking existing at all.
  //
  // The number is kept visible rather than asserted, so a future reader can
  // see what a tapping player faces without the suite pretending it is fine.
  console.log(
    `        [note] at 660ms-per-step tapping pace ${survived}/${runs} draws ` +
    `survive (deaths: ${detail}) - see anOrdinaryDrawWithHeldKeysIsComfortablySafe`
  );
}


/**
 * ...and the way people ACTUALLY play it is comfortably safe.
 *
 * The tapping model above dates from before held-key tracking existed, when
 * the client's auto-repeat put ~660ms between steps. The door now moves the
 * marker once per frame while a key is held, which is how a real player
 * draws - and at that cadence an ordinary draw survives about nine times in
 * ten. This is the case the Gremlin's pacing must not break.
 */
export async function anOrdinaryDrawWithHeldKeysIsComfortablySafe(): Promise<void> {
  const runs = 100;
  const pauseTicks = 2;        // held keys: a step every couple of frames
  let survived = 0;

  for (let run = 0; run < runs; run++) {
    const data = createData();
    const engine = new QixEngine(data, () => {});
    engine.initLevel(1);
    data.state = 'playing';

    const lives = data.lives;
    const moves: Direction[] = [
      ...Array(4).fill('up'), ...Array(6).fill('right'), ...Array(4).fill('down'),
    ] as Direction[];

    let died = false;
    outer: for (const m of moves) {
      move(engine, m);
      for (let tick = 0; tick < pauseTicks; tick++) {
        engine.update();
        if (data.lives < lives) { died = true; break outer; }
      }
    }
    if (!died) survived++;
  }

  assert.ok(
    survived >= runs * 0.7,
    `only ${survived}/${runs} draws survived at held-key pace; the Gremlin may ` +
    'threaten a careless player, not make ordinary drawing a lottery'
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
      // Measured on a late level with the player exposed, which is where the
      // FAQ says the lean is pronounced ("in later levels ... he will get
      // extremely aggressive and zoom towards you every time you detach").
      // At level 1 with the marker safe the lean is deliberately gentle -
      // it has to be, or an ordinary draw becomes a death sentence - and is
      // too small to separate from the wander in a sample this size.
      const { engine, data } = startedEngine(16);
      data.marker.x = markerX;
      data.marker.y = markerY;
      data.marker.isDrawing = true;
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

/**
 * Set up a board already walled into a narrow left strip and a wider right
 * side, with one frozen Gremlin in each, and draw a line that closes.
 *
 * The wall makes the narrow strip a region of its own before a line is ever
 * drawn; the line then splits the right side again. Outside is the largest
 * region holding a Gremlin - the middle - so the narrow strip is claimed with
 * its Gremlin inside it, and the other one is left loose.
 *
 * Neither Gremlin sits in the marker's column: a Gremlin standing on the line
 * would be paved over rather than sealed in, and no region would hold it.
 */
function trapOneGremlinOfTwo(): { data: SuperQixData; engine: QixEngine } {
  const data = createData();
  const engine = new QixEngine(data, () => {});
  engine.initLevel(1);
  data.state = 'playing';
  data.sparxList = [];

  const wall = 6;
  for (let y = 1; y < FIELD_HEIGHT - 1; y++) data.field[y][wall] = 'claimed';

  data.qixList = [
    { id: 1, x: 3, y: 5, vx: 0, vy: 0, speed: 0,
      segments: [{ x: 3, y: 5 }], frozen: true, frozenTimer: 999999 },
    { id: 2, x: 12, y: 5, vx: 0, vy: 0, speed: 0,
      segments: [{ x: 12, y: 5 }], frozen: true, frozenTimer: 999999 },
  ];

  // Straight up from the bottom frame to the top one, at the marker's own
  // column (20) - clear of both Gremlins.
  engine.handleDraw();
  for (let i = 0; i < FIELD_HEIGHT; i++) move(engine, 'up');

  return { data, engine };
}

/**
 * Q-3a. Sealing a Gremlin into ground you claim is a capture, and the game
 * counts it. It used to drop the Gremlin silently, so the most spectacular
 * play in the game left no trace at all.
 */
export async function sealingAGremlinIntoAClaimCountsAsACapture(): Promise<void> {
  const { data } = trapOneGremlinOfTwo();

  assert.strictEqual(
    data.qixList.length, 1,
    'exactly one of the two Gremlins should have been sealed in'
  );
  assert.strictEqual(
    data.gremlinsCaptured, 1,
    `the capture should have been counted, got ${data.gremlinsCaptured}`
  );
}

/**
 * Q-3b. Only the Gremlin actually inside the claimed ground is caught. The
 * one left in Outside is still on the board and must not be paid for.
 */
export async function aGremlinLeftOutsideTheClaimIsNotACapture(): Promise<void> {
  const { data } = trapOneGremlinOfTwo();

  assert.strictEqual(data.qixList.length, 1, 'one Gremlin should survive');
  assert.strictEqual(
    data.qixList[0].id, 2,
    'the survivor should be the one in Outside, not the one in the claim'
  );
  assert.strictEqual(
    data.gremlinsCaptured, 1,
    'the surviving Gremlin must not be counted as captured as well'
  );
}

/**
 * A claim along the edge releases bonuses like any other.
 *
 * Reported live 2026-08-31: "i have never seen any flying letters at all in
 * qix. not plumbed?" They were plumbed - and unreachable. The spawn scan
 * only looked at claimed cells between 2 and FIELD-2 on both axes, and a
 * claim hugging an edge lands on exactly the row that excludes. Edge-hugging
 * claims are almost every claim, and are what FAQ 5.2's strategy is built
 * on, so no bonus was ever released.
 */
export async function anEdgeClaimCanReleaseABonus(): Promise<void> {
  let released = 0;
  const claims = 80;

  for (let i = 0; i < claims; i++) {
    const data = createData();
    const engine = new QixEngine(data, () => { /* no display */ });
    engine.initLevel(1);
    data.state = 'playing';
    data.sparxList = [];
    data.qixList = [{
      id: 1, x: 5, y: 5, vx: 0, vy: 0, speed: 0,
      segments: [], frozen: true, frozenTimer: 1e6,
    }];

    const step = (dir: Direction) => {
      (engine as unknown as { lastMoveTime: number }).lastMoveTime = 0;
      engine.handleDirection(dir);
    };

    // A small box out of the bottom edge and back: the ordinary claim.
    step('up'); step('right'); step('right'); step('down');

    if (data.powerUps.length > 0) released++;
  }

  // The chance is one in four, so eighty claims releasing none would be a
  // one-in-ten-billion coincidence - or, as it was, an unreachable spawn.
  assert.ok(
    released > 0,
    `no bonus in ${claims} edge claims; they cannot be released at all`
  );
}

/** A bonus starts on ground the claim actually took. */
export async function aBonusStartsOnTheGroundJustClaimed(): Promise<void> {
  const data = createData();
  const engine = new QixEngine(data, () => { /* no display */ });
  engine.initLevel(1);
  data.state = 'playing';

  const system = new PowerUpSystem(data);

  // Claimed ground far away, so the fall-back scan has somewhere else it
  // could pick. Without this the test cannot tell the two paths apart.
  for (let x = 4; x < 10; x++) data.field[2][x] = 'claimed';

  const filled = [
    { x: 20, y: FIELD_HEIGHT - 2 },
    { x: 21, y: FIELD_HEIGHT - 2 },
  ];
  for (const cell of filled) data.field[cell.y][cell.x] = 'claimed';

  // Ask enough times that the one-in-four chance has certainly fired.
  for (let i = 0; i < 200 && data.powerUps.length === 0; i++) {
    system.trySpawnPowerUp(filled);
  }

  assert.ok(data.powerUps.length > 0, 'nothing was ever released');

  const bonus = data.powerUps[0];
  assert.ok(
    filled.some(c => c.x === Math.round(bonus.x) && c.y === Math.round(bonus.y)),
    `a bonus should start on the claim, not at ${bonus.x},${bonus.y}`
  );
}

/**
 * The Gremlin kills what it is standing on, not what it is beside.
 *
 * Reported live 2026-08-31: "i died now but no enemy was touching my active
 * line". The test was a Manhattan distance under 1.5, which is every
 * orthogonally adjacent cell as well as the cell itself - so it killed from
 * a square away, which on this board is plainly "not touching".
 */
export async function theGremlinKillsOnlyWhatItStandsOn(): Promise<void> {
  const withGremlin = () => {
    const data = createData();
    data.qixList = [{
      id: 1, x: 10, y: 10, vx: 0, vy: 0, speed: 0,
      segments: [], frozen: true, frozenTimer: 1e6,
    }];
    return new EnemySystem(data);
  };

  assert.ok(
    withGremlin().checkQixCollision({ x: 20, y: 20 }, [{ x: 10, y: 10 }]),
    'standing on the line has to kill'
  );
  assert.ok(
    !withGremlin().checkQixCollision({ x: 20, y: 20 }, [{ x: 11, y: 10 }]),
    'one cell away must not'
  );
  assert.ok(
    !withGremlin().checkQixCollision({ x: 11, y: 11 }, []),
    'nor diagonally beside the marker'
  );
}

/**
 * A bonus is released from the area the claim just took, not from anywhere
 * on the board that happens to be claimed.
 *
 * FAQ 2.3: "Every time you fill an area of the picture (no matter how
 * small), there's a chance a random Letter or Power-up will be released" -
 * it comes out of the ground you just filled.
 */
export async function aBonusComesOutOfTheNewClaimNotOldGround(): Promise<void> {
  let spawns = 0;
  let onOldGround = 0;

  for (let trial = 0; trial < 120; trial++) {
    const data = createData();
    const engine = new QixEngine(data, () => { /* no display */ });
    engine.initLevel(1);
    data.state = 'playing';
    data.sparxList = [];
    data.qixList = [{
      id: 1, x: 5, y: 5, vx: 0, vy: 0, speed: 0,
      segments: [], frozen: true, frozenTimer: 1e6,
    }];

    // Ground claimed long ago, at the other end of the board.
    const old = [];
    for (let x = 25; x < 34; x++) {
      data.field[18][x] = 'claimed';
      old.push({ x, y: 18 });
    }

    const step = (dir: Direction) => {
      (engine as unknown as { lastMoveTime: number }).lastMoveTime = 0;
      engine.handleDirection(dir);
    };

    // A fresh claim down at the left.
    data.marker.x = 8;
    step('up'); step('right'); step('down');

    for (const bonus of data.powerUps) {
      spawns++;
      if (old.some(c => c.x === Math.round(bonus.x) && c.y === Math.round(bonus.y))) {
        onOldGround++;
      }
    }
  }

  assert.ok(spawns > 0, 'nothing was released in 120 claims');
  assert.strictEqual(
    onOldGround, 0,
    `${onOldGround} of ${spawns} bonuses came out of ground claimed earlier`
  );
}
