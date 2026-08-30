/**
 * Enemy behaviour, against the FAQ.
 *
 * Covers FAQ-1b (a level starts with the Gremlin and TWO Skulls), FAQ-1g/1h
 * and FAQ-2.2l (the border Time Meter releases two more Skulls and resets),
 * FAQ-1i (nothing can be destroyed), FAQ-2.1b/2.2b (the Gremlin cannot touch
 * a marker standing on an edge), FAQ-2.1h/2.2j (Skulls cannot reach a player
 * who is drawing, and cannot climb an unfinished line), FAQ-2.2g (two Skulls
 * start opposite the marker travelling in opposite directions), FAQ-2.2h
 * (Skulls are outrunnable), FAQ-2.2k (a Skull never instantly reverses),
 * FAQ-2.2m (a death culls all but two Skulls) and FAQ-2.5.3c (there are no
 * Super Skulls).
 */

import assert from 'assert';
import { QixEngine } from '../game/qix-engine';
import { EnemySystem } from '../game/enemies';
import { SuperQixData, Direction } from '../game/types';
import {
  FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES, GAME_TICK_MS,
  SKULLS_AT_LEVEL_START, SKULLS_PER_RELEASE, SKULL_REVERSE_COOLDOWN_MS,
  SPARX_BASE_SPEED, MARKER_MOVE_DELAY, getLevelConfig,
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
  return { engine, data };
}

function move(engine: QixEngine, dir: Direction): void {
  (engine as any).lastMoveTime = 0;
  engine.handleDirection(dir);
}

/** FAQ-1b / FAQ-2.2g: exactly two Skulls, wherever you are in the game. */
export async function everyLevelStartsWithExactlyTwoSkulls(): Promise<void> {
  for (const level of [1, 5, 9, 16]) {
    const { data } = startedEngine(level);
    assert.strictEqual(
      data.sparxList.length, SKULLS_AT_LEVEL_START,
      `level ${level} started with ${data.sparxList.length} Skulls, not ${SKULLS_AT_LEVEL_START}`
    );
    assert.strictEqual(SKULLS_AT_LEVEL_START, 2, 'the FAQ says two Skulls');
    assert.ok(data.qixList.length >= 1, `level ${level} should have a Gremlin`);
  }
}

/**
 * FAQ-2.2: "Two of these start directly opposite you at the beginning of
 * each level, and move in opposite directions around the edge of the screen."
 */
export async function theTwoSkullsStartOppositeTheMarkerAndSeparate(): Promise<void> {
  const { data } = startedEngine();
  const [a, b] = data.sparxList;

  assert.notStrictEqual(a.direction, b.direction, 'the pair must travel in opposite directions');

  // "Directly opposite" is half a lap round the border path. Check the pair
  // starts as far from the marker as the path allows, not next to them.
  const half = Math.floor(data.borderPath.length / 2);
  const markerIndex = data.borderPath.findIndex(
    p => p.x === data.marker.x && p.y === data.marker.y
  );
  assert.ok(markerIndex >= 0, 'the marker should be on the border path');

  for (const skull of [a, b]) {
    const lap = Math.abs(skull.pathIndex - markerIndex);
    const around = Math.min(lap, data.borderPath.length - lap);
    assert.ok(
      around > data.borderPath.length / 4,
      `a Skull started ${around} steps from the marker, which is not "directly opposite"`
    );
    assert.strictEqual(around, half, 'opposite means half a lap away');
  }
}

/** FAQ-2.2: Skulls are slower than the marker, so the player can outrun them. */
export async function skullsAreSlowerThanTheMarker(): Promise<void> {
  const cellsPerSecondMarker = 1000 / MARKER_MOVE_DELAY;
  // updateSparx advances pathIndex by direction * speed * 0.1 each tick.
  const ticksPerSecond = 1000 / GAME_TICK_MS;
  const cellsPerSecondSkull = SPARX_BASE_SPEED * 0.1 * ticksPerSecond;

  assert.ok(
    cellsPerSecondSkull < cellsPerSecondMarker,
    `a Skull covers ${cellsPerSecondSkull.toFixed(1)} cells/s and the marker only ` +
    `${cellsPerSecondMarker.toFixed(1)}; the player could not outrun them`
  );
}

/**
 * FAQ-2.1: "When you are Drawing a line, the Skulls can't reach you." They
 * travel the lines; a player out in the open field is beyond them.
 */
export async function skullsCannotTouchAPlayerWhoIsDrawing(): Promise<void> {
  const { engine, data } = startedEngine();
  const enemies: any = (engine as any).enemySystem;

  // Put a Skull exactly on the marker - the worst case.
  data.sparxList = [{
    id: 1, x: data.marker.x, y: data.marker.y, pathIndex: 0, direction: 1,
    speed: 1, lastReversedAt: 0, frozen: false, frozenTimer: 0,
  }];

  assert.strictEqual(
    enemies.checkSparxCollision(data.marker), true,
    'a Skull on the marker should be lethal while standing on an edge'
  );

  engine.handleDraw();
  assert.strictEqual(data.marker.isDrawing, true);
  assert.strictEqual(
    enemies.checkSparxCollision(data.marker), false,
    'a Skull must not be able to reach a player who is drawing'
  );
}

/**
 * FAQ-2.2 / FAQ-2.5.3: Skulls follow lines only, and never climb an
 * unfinished stix - there are no Super Skulls.
 */
export async function skullsNeverLeaveTheirPathOntoAnUnfinishedLine(): Promise<void> {
  const { engine, data } = startedEngine();

  // Draw out into the field, so a stix exists.
  engine.handleDraw();
  for (let i = 0; i < 4; i++) move(engine, 'up');
  assert.ok(data.currentStix && data.currentStix.points.length > 1, 'a stix should exist');

  const stixCells = new Set(data.currentStix!.points.map(p => `${p.x},${p.y}`));

  for (let tick = 0; tick < 200; tick++) {
    (engine as any).enemySystem.update();
    for (const skull of data.sparxList) {
      assert.ok(
        !stixCells.has(`${Math.round(skull.x)},${Math.round(skull.y)}`),
        `a Skull climbed onto the unfinished line at (${skull.x}, ${skull.y})`
      );
    }
  }

  // And no Skull carries a "super" state at all any more.
  for (const skull of data.sparxList) {
    assert.ok(!('isSuper' in skull), 'Super Skulls should not exist (FAQ 2.5.3)');
  }
}

/** FAQ-2.2: a Skull never instantly reverses direction on a line. */
export async function aSkullCannotReverseTwiceInQuickSuccession(): Promise<void> {
  const data = createData();
  const enemies = new EnemySystem(data);
  const skull = {
    id: 1, x: 0, y: 0, pathIndex: 0, direction: 1 as 1 | -1,
    speed: 1, lastReversedAt: 0, frozen: false, frozenTimer: 0,
  };
  data.sparxList = [skull];

  const now = 10_000;
  assert.strictEqual(enemies.reverseSkull(skull, now), true, 'the first turn should be allowed');
  assert.strictEqual(skull.direction, -1);

  assert.strictEqual(
    enemies.reverseSkull(skull, now + 10), false,
    'a Skull must not be able to turn round again immediately'
  );
  assert.strictEqual(skull.direction, -1, 'and its direction must be unchanged');

  assert.strictEqual(
    enemies.reverseSkull(skull, now + SKULL_REVERSE_COOLDOWN_MS + 1), true,
    'once the cooldown has passed it may turn again'
  );
  assert.strictEqual(skull.direction, 1);
}

/** FAQ-2.2: "If you should die, all but two Skulls will disappear." */
export async function dyingCullsAllButTwoSkulls(): Promise<void> {
  const { engine, data } = startedEngine();

  (engine as any).enemySystem.releaseSkulls(6, 1);
  assert.strictEqual(data.sparxList.length, SKULLS_AT_LEVEL_START + 6);

  const livesBefore = data.lives;
  (engine as any).handleDeath();

  assert.strictEqual(data.lives, livesBefore - 1, 'the death should cost a life');
  assert.strictEqual(
    data.sparxList.length, SKULLS_AT_LEVEL_START,
    `after dying ${data.sparxList.length} Skulls remained, expected ${SKULLS_AT_LEVEL_START}`
  );
}

/**
 * FAQ-1: the border Time Meter fills as you play, and when it is full "two
 * more Skulls are released onto the field and the counter resets".
 */
export async function theTimeMeterFillsThenReleasesTwoSkullsAndResets(): Promise<void> {
  const { engine, data } = startedEngine();
  const config = getLevelConfig(1);

  assert.strictEqual(data.timeMeter, 0, 'the meter starts empty');
  const before = data.sparxList.length;

  // Run just short of a full meter.
  const ticksToFill = Math.ceil(config.timeMeterMs / GAME_TICK_MS);
  for (let i = 0; i < ticksToFill - 2; i++) (engine as any).advanceTimeMeter();

  assert.ok(data.timeMeter > 0 && data.timeMeter < 1, `the meter should be part full, was ${data.timeMeter}`);
  assert.strictEqual(data.sparxList.length, before, 'no Skulls until the meter is full');

  // Tip it over.
  for (let i = 0; i < 4; i++) (engine as any).advanceTimeMeter();

  assert.strictEqual(
    data.sparxList.length, before + SKULLS_PER_RELEASE,
    `a full meter should release ${SKULLS_PER_RELEASE} Skulls`
  );
  assert.ok(data.timeMeter < 1, 'and the counter should reset');
}

/**
 * FAQ-1: the border IS the meter - "composed of squares which serve as a
 * Time Meter. As you play, they change colour two at a time, until the whole
 * border is red".
 */
export async function theBorderShowsTheTimeMeterFillingInPairs(): Promise<void> {
  const data = createData();
  let frame = '';
  const engine = new QixEngine(data, content => { frame = content; });
  engine.initLevel(1);
  data.state = 'playing';

  const countRed = (painted: string) =>
    (painted.match(/\{red-bg\}/g) || []).length;

  // Empty meter: no red squares on the frame. (Skulls are drawn on a red
  // background too, so they are removed for this measurement.)
  data.sparxList = [];
  engine.render();
  assert.strictEqual(countRed(frame), 0, 'an empty meter should show no red border squares');

  // Quarter full: some, but not all, of the border has turned.
  data.timeMeter = 0.25;
  engine.render();
  const quarter = countRed(frame);
  assert.ok(quarter > 0, 'a quarter-full meter should have turned some squares red');
  assert.ok(quarter < data.borderPath.length, 'and should not have turned them all');
  assert.strictEqual(quarter % 2, 0, 'squares change colour two at a time');

  // Nearly full: strictly more of the border is red than at a quarter.
  data.timeMeter = 0.99;
  engine.render();
  assert.ok(
    countRed(frame) > quarter,
    'the meter should keep filling as time passes'
  );
}

/**
 * FAQ-1: "As the player completes levels, the enemies begin to move faster
 * and more aggressively, and the timer counts down more quickly."
 */
export async function laterLevelsAreFasterInEveryRespect(): Promise<void> {
  const early = getLevelConfig(1);
  const late = getLevelConfig(16);

  assert.ok(
    late.timeMeterMs < early.timeMeterMs,
    `level 16 fills its meter in ${late.timeMeterMs}ms, not quicker than level 1's ${early.timeMeterMs}ms`
  );
  assert.ok(
    late.qixSpeed > early.qixSpeed,
    `the Gremlin should be faster by level 16 (${late.qixSpeed} vs ${early.qixSpeed})`
  );
  assert.ok(
    late.sparxSpeed > early.sparxSpeed,
    `the Skulls should be faster by level 16 (${late.sparxSpeed} vs ${early.sparxSpeed})`
  );
}

/** FAQ-2.2: released Skulls arrive "from the center-top" of the field. */
export async function releasedSkullsArriveFromTheCentreTop(): Promise<void> {
  const { engine, data } = startedEngine();
  const before = data.sparxList.length;

  (engine as any).enemySystem.releaseSkulls(SKULLS_PER_RELEASE, 1);
  const arrived = data.sparxList.slice(before);

  assert.strictEqual(arrived.length, SKULLS_PER_RELEASE);
  for (const skull of arrived) {
    assert.strictEqual(skull.y, 0, 'a released Skull should enter along the top edge');
    assert.ok(
      Math.abs(skull.x - Math.floor(FIELD_WIDTH / 2)) <= 1,
      `a released Skull entered at x=${skull.x}, which is not the centre-top`
    );
  }
  assert.notStrictEqual(
    arrived[0].direction, arrived[1].direction,
    'the released pair should head opposite ways'
  );
}

/**
 * FAQ-2.1 / FAQ-2.2: the Gremlin "cannot touch you when you are against a
 * wall or closed area" - it is only a danger once you detach to draw.
 */
export async function theGremlinCannotTouchAMarkerStandingOnAnEdge(): Promise<void> {
  const { engine, data } = startedEngine();

  // Gremlin sitting exactly on the marker, which is on the bottom border.
  data.qixList = [{
    id: 1, x: data.marker.x, y: data.marker.y, vx: 0, vy: 0, speed: 0,
    segments: [{ x: data.marker.x, y: data.marker.y }], frozen: true, frozenTimer: 999999,
  }];
  data.sparxList = [];

  const livesBefore = data.lives;
  engine.update();

  assert.strictEqual(
    data.lives, livesBefore,
    'the Gremlin killed a marker that was standing safely on the border'
  );

  // Detach, and it becomes lethal.
  engine.handleDraw();
  engine.update();
  assert.strictEqual(
    data.lives, livesBefore - 1,
    'the Gremlin should kill a player who has detached to draw'
  );
}

/**
 * FAQ-2.1/2.2: the Gremlin kills "either by running into your marker or into
 * any point of the incomplete line you have marked out so far" - the line is
 * as vulnerable as the player.
 */
export async function theGremlinKillsByTouchingTheLineNotJustTheMarker(): Promise<void> {
  const { engine, data } = startedEngine();
  data.sparxList = [];

  // Draw a line up the field, then leave the marker far from the Gremlin.
  engine.handleDraw();
  for (let i = 0; i < 5; i++) move(engine, 'up');
  assert.ok(data.currentStix && data.currentStix.points.length > 3, 'a line should exist');

  // Park the Gremlin on the MIDDLE of the line, well away from the marker.
  const midpoint = data.currentStix!.points[2];
  assert.ok(
    Math.abs(midpoint.x - data.marker.x) + Math.abs(midpoint.y - data.marker.y) > 1.5,
    'the chosen line cell must be clear of the marker, or this proves nothing'
  );
  data.qixList = [{
    id: 1, x: midpoint.x, y: midpoint.y, vx: 0, vy: 0, speed: 0,
    segments: [{ x: midpoint.x, y: midpoint.y }], frozen: true, frozenTimer: 999999,
  }];

  const livesBefore = data.lives;
  engine.update();

  assert.strictEqual(
    data.lives, livesBefore - 1,
    'the Gremlin touching the incomplete line should cost a life'
  );
}

/** FAQ-1: "Neither the Gremlin nor the Skulls can be destroyed". */
export async function enemiesCannotBeDestroyed(): Promise<void> {
  const { engine, data } = startedEngine();
  const enemies: any = (engine as any).enemySystem;

  assert.strictEqual(typeof enemies.killQix, 'undefined', 'nothing should be able to destroy a Gremlin');
  assert.strictEqual(typeof enemies.killSparx, 'undefined', 'nothing should be able to destroy a Skull');
  assert.strictEqual(typeof enemies.destroyEnemy, 'undefined');

  const qixBefore = data.qixList.length;
  const skullsBefore = data.sparxList.length;

  // Play out a stretch of the game; the populations may only grow.
  for (let i = 0; i < 300; i++) engine.update();

  assert.ok(data.qixList.length >= qixBefore, 'a Gremlin disappeared');
  assert.ok(data.sparxList.length >= skullsBefore, 'a Skull disappeared');
}
