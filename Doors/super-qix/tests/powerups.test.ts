/**
 * Power-ups, letters and the scoring multiplier.
 *
 * FAQ 2.3 describes how a released Letter "drifts across the playing field
 * in a straight line towards the far wall, then moves back around the
 * edges", while a Power-up "begins following the nearest lines already laid
 * down". FAQ 2.3.1 lists what each one does, and FAQ 2.4.1 the multiplier
 * for rejoining close to where you left.
 *
 * Covers FAQ-2.3a, FAQ-2.3b, FAQ-2.3c, FAQ-2.3.1c, FAQ-2.3.1d, FAQ-2.3.1e,
 * FAQ-2.3.1f, FAQ-2.4.1b, FAQ-2.4.1d and FAQ-2.4.1e.
 */

import assert from 'assert';
import { QixEngine } from '../game/qix-engine';
import { PowerUpSystem } from '../game/powerups';
import { SuperQixData, Direction, PowerUp } from '../game/types';
import {
  FIELD_WIDTH, FIELD_HEIGHT, SKILL_LEVELS,
  MULTIPLIER_REJOIN_CELLS, MULTIPLIER_FIRST, MULTIPLIER_CHAINED,
  MULTIPLIER_CHAIN_MS, WARP_OPENING_MS, WARP_OPEN_MS,
  SKULL_STUN_MS,
} from '../game/constants';

function createData(): SuperQixData {
  return {
    state: 'menu', score: 0, lives: SKILL_LEVELS.medium.lives, level: 1,
    skill: 'medium', bonusLivesAwarded: 0,
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
    stopTimer: 0, timeMeter: 0, lastMultiplierAt: 0, lastMultiplier: 1,
    warp: null, transitionTimer: 0, transitionMessage: '',
  };
}

/** A quiet level: no enemies, marker on the bottom border. */
function quietLevel(): { engine: QixEngine; data: SuperQixData } {
  const data = createData();
  const engine = new QixEngine(data, () => { /* no display in tests */ });
  engine.initLevel(1);
  data.state = 'playing';
  data.qixList = [];
  data.sparxList = [];
  return { engine, data };
}

/**
 * Where the marker stands on the patrol path.
 *
 * A Skull parked at a pathIndex that is not a real index of the path gets
 * wrapped to the far end of it by the patrol update, which runs before the
 * collision check - so the fixture has to name a genuine point.
 */
function markerPathIndex(data: SuperQixData): number {
  return Math.max(0, data.borderPath.findIndex(
    p => p.x === data.marker.x && p.y === data.marker.y
  ));
}

function step(engine: QixEngine, dir: Direction): void {
  (engine as unknown as { lastMoveTime: number }).lastMoveTime = 0;
  engine.handleDirection(dir);
}

/**
 * Draw a box `width` cells wide out of the bottom border and back down to
 * it, returning the points scored for the claim.
 */
function drawBox(engine: QixEngine, data: SuperQixData, width: number): number {
  const before = data.score;

  step(engine, 'up');
  for (let i = 0; i < width; i++) step(engine, 'right');
  step(engine, 'down');

  return data.score - before;
}

/**
 * FAQ-2.4.1d: "Multipliers occur when the point where you finish outlining
 * an area is as close as possible (within about 2 pixels) to the point where
 * you began. Achieving a multiplier will give you 20x normal points."
 */
export async function rejoiningBesideTheDepartureScoresTwentyTimes(): Promise<void> {
  const near = quietLevel();
  const nearPoints = drawBox(near.engine, near.data, MULTIPLIER_REJOIN_CELLS);

  const far = quietLevel();
  const farPoints = drawBox(far.engine, far.data, MULTIPLIER_REJOIN_CELLS + 6);

  assert.ok(farPoints > 0, 'the wide box has to score something to compare');
  assert.ok(
    nearPoints > farPoints,
    `a tight rejoin (${nearPoints}) should beat a wider one (${farPoints}) ` +
    'even though it claims less ground'
  );
  assert.strictEqual(near.data.lastMultiplier, MULTIPLIER_FIRST);
}

/** A rejoin further away than the tolerance pays the plain rate. */
export async function aDistantRejoinScoresNormally(): Promise<void> {
  const { engine, data } = quietLevel();

  drawBox(engine, data, MULTIPLIER_REJOIN_CELLS + 6);

  assert.strictEqual(data.lastMultiplier, 1);
  assert.strictEqual(data.scoreMultiplier, 1);
}

/**
 * FAQ-2.4.1e: "If you manage another multiplier within a second or two of
 * the last one, it increases to 30x".
 */
export async function aSecondMultiplierSoonAfterScoresThirtyTimes(): Promise<void> {
  const { engine, data } = quietLevel();

  drawBox(engine, data, MULTIPLIER_REJOIN_CELLS);
  assert.strictEqual(data.lastMultiplier, MULTIPLIER_FIRST);

  // A second tight box, immediately: the chain window has not run out.
  drawBox(engine, data, MULTIPLIER_REJOIN_CELLS);

  assert.strictEqual(data.lastMultiplier, MULTIPLIER_CHAINED);
}

/** Leave it too long and the chain lapses back to 20x. */
export async function theMultiplierChainLapses(): Promise<void> {
  const { engine, data } = quietLevel();

  drawBox(engine, data, MULTIPLIER_REJOIN_CELLS);
  data.lastMultiplierAt = Date.now() - (MULTIPLIER_CHAIN_MS + 100);

  drawBox(engine, data, MULTIPLIER_REJOIN_CELLS);

  assert.strictEqual(data.lastMultiplier, MULTIPLIER_FIRST);
}

/**
 * FAQ-2.4.1b: "It is possible to complete such a small section that you get
 * NO points for doing so, but this may still trigger the release of a bonus
 * letter or power-up."
 */
export async function aTinyClaimCanScoreNothingAndStillOfferABonus(): Promise<void> {
  const { engine, data } = quietLevel();

  let offers = 0;
  const powerUps = new PowerUpSystem(data);
  const original = powerUps.trySpawnPowerUp.bind(powerUps);
  (engine as unknown as { powerUpSystem: PowerUpSystem }).powerUpSystem = {
    ...powerUps,
    trySpawnPowerUp: () => { offers++; },
    checkCollection: () => { /* not under test */ },
    updateEffects: () => { /* not under test */ },
    updateMovement: () => { /* not under test */ },
  } as unknown as PowerUpSystem;
  void original;

  // The smallest possible claim: one cell out and straight back.
  step(engine, 'up');
  step(engine, 'right');
  step(engine, 'down');

  assert.strictEqual(offers, 1, 'even the smallest fill gets its chance');
}

/**
 * FAQ-2.3.1d: the Shield "will protect you from one encounter with a Skull.
 * Will also stun the Skull in question for one second. Will NOT protect you
 * from the Gremlin".
 */
export async function theShieldDoesNotSaveYouFromTheGremlin(): Promise<void> {
  const { engine, data } = quietLevel();

  data.marker.hasShield = true;
  step(engine, 'up');            // out into the field, drawing
  assert.ok(data.marker.isDrawing, 'the marker should be drawing');

  const lives = data.lives;
  data.qixList = [{
    id: 1, x: data.marker.x, y: data.marker.y, vx: 0, vy: 0, speed: 0,
    segments: [], frozen: true, frozenTimer: 100,
  }];

  engine.update();

  assert.strictEqual(data.lives, lives - 1, 'the Gremlin gets through a shield');
  assert.ok(data.marker.hasShield, 'and does not consume it');
}

/** The Skull it IS for gets absorbed, and stunned. */
export async function theShieldAbsorbsASkullAndStunsIt(): Promise<void> {
  const { engine, data } = quietLevel();

  data.marker.hasShield = true;
  const lives = data.lives;

  data.sparxList = [{
    id: 1, x: data.marker.x, y: data.marker.y,
    pathIndex: markerPathIndex(data), direction: 1,
    speed: 0, lastReversedAt: 0, frozen: false, frozenTimer: 0,
  }];

  engine.update();

  assert.strictEqual(data.lives, lives, 'the shield takes the hit');
  assert.ok(!data.marker.hasShield, 'and is used up');
  assert.ok(data.sparxList[0].frozen, 'the Skull is stunned');
  assert.ok(
    data.sparxList[0].frozenTimer > 0 &&
    data.sparxList[0].frozenTimer <= Math.ceil(SKULL_STUN_MS / 33),
    'for about a second'
  );
}

/**
 * FAQ-2.3.1e: "All enemies are still deadly if YOU run into THEM, they just
 * can't move for a moment."
 */
export async function frozenEnemiesStillKill(): Promise<void> {
  const { engine, data } = quietLevel();

  const lives = data.lives;
  data.sparxList = [{
    id: 1, x: data.marker.x, y: data.marker.y,
    pathIndex: markerPathIndex(data), direction: 1,
    speed: 0, lastReversedAt: 0, frozen: true, frozenTimer: 100,
  }];

  engine.update();

  assert.strictEqual(data.lives, lives - 1);
}

/**
 * FAQ-2.3.1c: HURRY "Speeds up EVERYTHING in the game".
 */
export async function hurrySpeedsUpTheEnemiesToo(): Promise<void> {
  const { engine, data } = quietLevel();

  data.sparxList = [{
    id: 1, x: 0, y: 0, pathIndex: 0, direction: 1,
    speed: 1, lastReversedAt: 0, frozen: false, frozenTimer: 0,
  }];
  data.qixList = [{
    id: 1, x: 10, y: 10, vx: 1, vy: 1, speed: 1,
    segments: [], frozen: false, frozenTimer: 0,
  }];

  const plain = engine.enemySpeedScale();

  data.marker.speedBoost = true;
  data.activeEffects.push({ type: 'speed', remainingTime: 5000 });

  assert.ok(
    engine.enemySpeedScale() > plain,
    'a Hurry has to hurry the enemies as well as the marker'
  );
}

/**
 * FAQ-2.3.1f: the Warp "Opens a small doorway at the point you picked it up.
 * The doorway takes a second or two to open, remains open for another second
 * or so, then closes."
 */
export async function theWarpDoorwayOpensThenCloses(): Promise<void> {
  const { engine, data } = quietLevel();
  const now = Date.now();

  data.warp = { x: 5, y: 5, openedAt: now };
  assert.ok(!engine.isWarpOpen(now), 'not open the instant it is dropped');
  assert.ok(engine.isWarpOpen(now + WARP_OPENING_MS + 10), 'open once it has opened');
  assert.ok(
    !engine.isWarpOpen(now + WARP_OPENING_MS + WARP_OPEN_MS + 10),
    'and shut again afterwards'
  );
}

/**
 * FAQ-2.3.1f: "If you can move your diamond into it while it is fully open,
 * you advance directly to the next level. (NOTE: if you warp, you get no
 * end-of-level bonuses, e.g. for partially-spelled words.)"
 */
export async function enteringAnOpenWarpAdvancesTheLevelWithNoBonus(): Promise<void> {
  const { engine, data } = quietLevel();

  data.collectedLetters = ['C', 'A', 'S'];
  data.claimedPercent = 40;
  const score = data.score;

  data.warp = {
    x: data.marker.x, y: data.marker.y,
    openedAt: Date.now() - (WARP_OPENING_MS + 10),
  };

  engine.update();

  assert.strictEqual(data.score, score, 'a warp pays nothing');
  assert.strictEqual(data.state, 'levelTransition', 'but it does end the level');
  assert.strictEqual(data.warp, null, 'and the doorway is gone');
}

/** A doorway still opening is not a way through. */
export async function aClosedWarpIsNotAWayThrough(): Promise<void> {
  const { engine, data } = quietLevel();

  data.warp = { x: data.marker.x, y: data.marker.y, openedAt: Date.now() };
  engine.update();

  assert.strictEqual(data.state, 'playing');
}

/**
 * FAQ-2.3b: "Letters will tend to drift across the playing field in a
 * straight line towards the far wall, then move back around the edges."
 */
export async function aLetterDriftsTowardsTheFarWall(): Promise<void> {
  const { data } = quietLevel();
  const powerUps = new PowerUpSystem(data);

  const letter: PowerUp = {
    id: 1, type: 'letter', letter: 'C', x: 4, y: 10,
    collected: false, spawnTime: Date.now(),
  };
  data.powerUps.push(letter);
  powerUps.launch(letter);

  const startX = letter.x;
  for (let i = 0; i < 20; i++) powerUps.updateMovement();

  assert.ok(
    letter.x > startX,
    `a letter released at x=${startX} should head for the far wall, got ${letter.x}`
  );
  assert.ok(letter.x < FIELD_WIDTH - 1, 'and not leave the field');
}

/** Once it reaches the wall it travels around the edge instead of stopping. */
export async function aLetterAtTheWallTravelsAroundTheEdge(): Promise<void> {
  const { data } = quietLevel();
  const powerUps = new PowerUpSystem(data);

  const letter: PowerUp = {
    id: 1, type: 'letter', letter: 'C', x: FIELD_WIDTH - 3, y: 10,
    collected: false, spawnTime: Date.now(),
  };
  data.powerUps.push(letter);
  powerUps.launch(letter);

  for (let i = 0; i < 200; i++) powerUps.updateMovement();

  assert.strictEqual(letter.drift, 'edge', 'it should be walking the edge by now');

  const before = { x: letter.x, y: letter.y };
  for (let i = 0; i < 20; i++) powerUps.updateMovement();

  assert.ok(
    letter.x !== before.x || letter.y !== before.y,
    'and it should still be moving'
  );
}

/**
 * FAQ-2.3c: "Power-ups will begin following the nearest lines ('stix')
 * already laid down".
 */
export async function aPowerUpFollowsTheNearestLines(): Promise<void> {
  const { data } = quietLevel();
  const powerUps = new PowerUpSystem(data);

  const shield: PowerUp = {
    id: 1, type: 'shield', x: 8, y: 9,
    collected: false, spawnTime: Date.now(),
  };
  data.powerUps.push(shield);
  powerUps.launch(shield);

  for (let i = 0; i < 60; i++) powerUps.updateMovement();

  const cell = data.field[Math.round(shield.y)]?.[Math.round(shield.x)];
  assert.ok(
    cell === 'border' || cell === 'claimed',
    `a power-up should end up on a line, found "${cell}"`
  );
}
