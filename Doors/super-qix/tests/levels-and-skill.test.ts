/**
 * The 16 levels, the loop back to level 1, and the three skill levels.
 *
 * FAQ 3 lists the level names the player is spelling; FAQ 3 also says the
 * level 1 you come back to after 16 is the SAME level 1, "even the enemy
 * speeds are the same". FAQ 3.1 gives the message that ends a lap. FAQ 4
 * gives the operator's three skill settings, and FAQ 2.5.1 the factory high
 * score table.
 *
 * Covers FAQ-3a, FAQ-3b, FAQ-3c, FAQ-3.1, FAQ-2.5.1, FAQ-4.1, FAQ-4.2 and
 * FAQ-4.3.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { QixEngine } from '../game/qix-engine';
import { PowerUpSystem } from '../game/powerups';
import { SuperQixData } from '../game/types';
import {
  FIELD_WIDTH, FIELD_HEIGHT, LEVELS_PER_LAP,
  LEVEL_CONFIGS, getLevelConfig, DEFAULT_HIGHSCORES,
  SKILL_LEVELS, FINAL_LAP_MESSAGE, MAX_LIVES, EXTRA_LIFE_PERCENT,
} from '../game/constants';

function createData(skill: 'easy' | 'medium' | 'hard' = 'medium'): SuperQixData {
  return {
    state: 'menu', score: 0, lives: SKILL_LEVELS[skill].lives, level: 1,
    skill, bonusLivesAwarded: 0,
    claimedPercent: 0, targetPercent: SKILL_LEVELS[skill].targetPercent,
    scoreMultiplier: 1,
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
    stopTimer: 0, gremlinsCaptured: 0, timeMeter: 0, invulnerableUntil: 0, lastMultiplierAt: 0, lastMultiplier: 1,
    warp: null, transitionTimer: 0, transitionMessage: '',
  };
}

/** FAQ-3c: the words are the arcade's level names, in order. */
export async function theLevelWordsAreTheArcadeNames(): Promise<void> {
  const expected = [
    'CASTLE', 'THUNDER', 'ROCKMAN', 'DRAGON',
    'FANFARE', 'PLANET', 'GERDEN', 'JUNGLE',
    'TOYBOX', 'FOUNTAIN', 'MERMAID', 'CARP',
    'FLOWER', 'TENGU', 'ROCKET', 'REDCATS',
  ];

  assert.strictEqual(LEVEL_CONFIGS.length, LEVELS_PER_LAP);
  assert.deepStrictEqual(LEVEL_CONFIGS.map(c => c.word), expected);
}

/**
 * FAQ-3b: "There are no changes that I can detect between the initial L.1
 * and the L.1 you come back to after finishing L.16. Even the enemy speeds
 * are the same."
 *
 * The Gremlin COUNT is the one deliberate exception and is not checked here -
 * see theGremlinCountStopsAtTheCap. It holds at the cap across the wrap
 * instead of dropping back to one, so a second lap does not hand back the
 * Gremlins the first one earned.
 */
export async function theSecondLapIsIdenticalToTheFirst(): Promise<void> {
  for (let level = 1; level <= LEVELS_PER_LAP; level++) {
    const first = getLevelConfig(level);
    const second = getLevelConfig(level + LEVELS_PER_LAP);

    assert.strictEqual(second.qixSpeed, first.qixSpeed, `qixSpeed at L${level}`);
    assert.strictEqual(second.sparxSpeed, first.sparxSpeed, `sparxSpeed at L${level}`);
    assert.strictEqual(second.fuseSpeed, first.fuseSpeed, `fuseSpeed at L${level}`);
    assert.strictEqual(second.timeMeterMs, first.timeMeterMs, `timeMeter at L${level}`);
    assert.strictEqual(second.word, first.word, `word at L${level}`);
  }
}

/**
 * Q-4a. Lives stop at the ceiling however they are earned.
 *
 * All three routes are exercised - the skill level's score thresholds, the
 * 98% claim and the 1-UP power-up - because a ceiling honoured by two of the
 * three is not a ceiling, and each of them used to be its own bare `lives++`.
 */
export async function livesStopAtTheCeilingHoweverTheyAreEarned(): Promise<void> {
  // Route 1: the skill level's score thresholds.
  {
    const data = createData('easy');
    const engine = new QixEngine(data, () => {});
    engine.initLevel(1);
    data.lives = MAX_LIVES;
    data.score = 1_000_000;   // past every threshold easy mode lists
    (engine as any).awardBonusLives();
    assert.strictEqual(
      data.lives, MAX_LIVES,
      `the score thresholds pushed lives to ${data.lives}, past the ceiling`
    );
    assert.ok(
      data.bonusLivesAwarded > 0,
      'the thresholds must actually have been reached, or this proves nothing'
    );
  }

  // Route 2: claiming 98% of the board.
  {
    const data = createData();
    const engine = new QixEngine(data, () => {});
    engine.initLevel(1);
    data.state = 'playing';
    data.sparxList = [];
    data.qixList = [];
    data.lives = MAX_LIVES;
    data.claimedPercent = EXTRA_LIFE_PERCENT;
    engine.update();
    assert.strictEqual(
      data.lives, MAX_LIVES,
      `a 98% claim pushed lives to ${data.lives}, past the ceiling`
    );
  }

  // Route 3: the 1-UP power-up.
  {
    const data = createData();
    const engine = new QixEngine(data, () => {});
    engine.initLevel(1);
    const powerUps: any = (engine as any).powerUpSystem as PowerUpSystem;
    data.lives = MAX_LIVES;
    data.powerUps = [{
      id: 1, type: 'oneUp', x: data.marker.x, y: data.marker.y,
      letter: '', collected: false, spawnedAt: Date.now(), vx: 0, vy: 0,
    } as any];
    powerUps.checkCollection(data.marker);
    assert.strictEqual(
      data.powerUps[0].collected, true,
      'the 1-UP must actually have been picked up, or this proves nothing'
    );
    assert.strictEqual(
      data.lives, MAX_LIVES,
      `a 1-UP pushed lives to ${data.lives}, past the ceiling`
    );
  }

  // And below the ceiling a life is still a life.
  {
    const data = createData();
    const engine = new QixEngine(data, () => {});
    engine.initLevel(1);
    const powerUps: any = (engine as any).powerUpSystem as PowerUpSystem;
    data.lives = MAX_LIVES - 1;
    data.powerUps = [{
      id: 1, type: 'oneUp', x: data.marker.x, y: data.marker.y,
      letter: '', collected: false, spawnedAt: Date.now(), vx: 0, vy: 0,
    } as any];
    powerUps.checkCollection(data.marker);
    assert.strictEqual(
      data.lives, MAX_LIVES,
      'a 1-UP below the ceiling must still pay - the cap is not a freeze'
    );
  }
}

/**
 * Q-4b. One function owns the ceiling.
 *
 * Asserted against the source, because the defect this guards against is not
 * a wrong number - it is a FOURTH award site being added later with a bare
 * `lives++` that quietly ignores the cap. A behavioural test cannot see a
 * route that does not exist yet; this can.
 */
export async function everyLifeAwardGoesThroughOneFunction(): Promise<void> {
  const gameDir = path.join(__dirname, '..', 'game');
  const offenders: string[] = [];

  for (const file of fs.readdirSync(gameDir).filter(f => f.endsWith('.ts'))) {
    const source = fs.readFileSync(path.join(gameDir, file), 'utf8');
    source.split('\n').forEach((line, i) => {
      if (/\blives\s*(\+\+|\+=)/.test(line)) {
        // constants.ts owns the one legitimate increment: grantLife's own.
        if (file === 'constants.ts') return;
        offenders.push(`game/${file}:${i + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepStrictEqual(
    offenders, [],
    'these award lives without going through grantLife, so they ignore ' +
    `MAX_LIVES:\n  ${offenders.join('\n  ')}`
  );

  // And grantLife is genuinely where the increment lives.
  const constants = fs.readFileSync(path.join(gameDir, 'constants.ts'), 'utf8');
  assert.ok(
    /export function grantLife[\s\S]*?d\.lives\+\+/.test(constants),
    'grantLife should be the one place a life is added'
  );
}

/**
 * FAQ-3a: "Once you uncover them all, you go back to level 1 and continue
 * playing to increase your score."
 */
export async function clearingLevelSixteenGoesBackToLevelOneKeepingTheScore(): Promise<void> {
  const data = createData();
  const engine = new QixEngine(data, () => { /* no display in tests */ });

  engine.initLevel(LEVELS_PER_LAP);
  data.score = 54321;

  engine.advanceLevel();

  assert.strictEqual(data.level, 1, 'the lap restarts at level 1');
  assert.strictEqual(data.score, 54321, 'the score carries over');
  assert.strictEqual(data.lap, 2, 'the second lap is counted');
}

/** FAQ-3.1: the three lines shown for finishing a lap. */
export async function finishingTheLapShowsTheFinalMessage(): Promise<void> {
  const data = createData();
  let frame = '';
  const engine = new QixEngine(data, c => { frame = c; });

  engine.initLevel(LEVELS_PER_LAP);
  data.state = 'playing';
  data.qixList = [];
  data.sparxList = [];
  data.claimedPercent = data.targetPercent + 1;
  engine.update();

  // Run the reveal out and into the bonus panel, where the message sits.
  for (let i = 0; i < FIELD_WIDTH + 5; i++) engine.advanceLevelOutro();

  for (const line of FINAL_LAP_MESSAGE) {
    assert.ok(frame.includes(line), `the panel should carry "${line}"`);
  }
}

/** An ordinary level does NOT show it. */
export async function anOrdinaryLevelDoesNotShowTheFinalMessage(): Promise<void> {
  const data = createData();
  let frame = '';
  const engine = new QixEngine(data, c => { frame = c; });

  engine.initLevel(3);
  data.state = 'playing';
  data.qixList = [];
  data.sparxList = [];
  data.claimedPercent = data.targetPercent + 1;
  engine.update();

  for (let i = 0; i < FIELD_WIDTH + 5; i++) engine.advanceLevelOutro();

  assert.ok(
    !frame.includes(FINAL_LAP_MESSAGE[0]),
    'only the sixteenth level ends a lap'
  );
}

/** FAQ-2.5.1: the factory high score table. */
export async function theDefaultHighScoresAreTheArcadeTable(): Promise<void> {
  assert.deepStrictEqual(
    DEFAULT_HIGHSCORES.map(h => [h.name, h.level, h.score]),
    [
      ['CAS', 6, 32750],
      ['THU', 5, 30010],
      ['ROC', 5, 28200],
      ['DRA', 4, 21280],
      ['FAN', 3, 20570],
    ]
  );
}

/** FAQ-4.1 / 4.2 / 4.3: lives, bonus lives and fill area per skill. */
export async function eachSkillLevelSetsItsLivesAndFillArea(): Promise<void> {
  assert.strictEqual(SKILL_LEVELS.easy.lives, 5);
  assert.deepStrictEqual(SKILL_LEVELS.easy.bonusLives, [20000, 50000]);
  assert.strictEqual(SKILL_LEVELS.easy.targetPercent, 70);

  assert.strictEqual(SKILL_LEVELS.medium.lives, 3);
  assert.deepStrictEqual(SKILL_LEVELS.medium.bonusLives, [30000, 100000]);
  assert.strictEqual(SKILL_LEVELS.medium.targetPercent, 75);

  assert.strictEqual(SKILL_LEVELS.hard.lives, 2);
  assert.deepStrictEqual(SKILL_LEVELS.hard.bonusLives, []);
  assert.strictEqual(SKILL_LEVELS.hard.targetPercent, 85);

  // "Difficulty refers mainly to how quickly ... the Gremlin and Skulls move"
  assert.ok(
    SKILL_LEVELS.easy.difficulty < SKILL_LEVELS.medium.difficulty &&
    SKILL_LEVELS.medium.difficulty < SKILL_LEVELS.hard.difficulty,
    'hard has to move faster than medium, and medium than easy'
  );
}

/** The chosen skill sets the level's fill threshold, not the level table. */
export async function theSkillLevelSetsTheFillThreshold(): Promise<void> {
  const data = createData('hard');
  const engine = new QixEngine(data, () => { /* no display in tests */ });

  engine.initLevel(1);

  assert.strictEqual(data.targetPercent, 85);
}

/** ...and its enemy speeds. */
export async function theSkillLevelSetsTheEnemySpeeds(): Promise<void> {
  const easy = createData('easy');
  const hard = createData('hard');
  new QixEngine(easy, () => { /* no display */ }).initLevel(1);
  new QixEngine(hard, () => { /* no display */ }).initLevel(1);

  assert.ok(
    hard.qixList[0].speed > easy.qixList[0].speed,
    'the Gremlin is faster on hard'
  );
}

/** FAQ-4.2: "Bonus lives at 30,000 and 100,000 points". */
export async function bonusLivesArriveAtTheSkillThresholds(): Promise<void> {
  const data = createData('medium');
  const engine = new QixEngine(data, () => { /* no display in tests */ });

  engine.initLevel(1);
  data.state = 'playing';
  data.qixList = [];
  data.sparxList = [];

  const lives = data.lives;

  data.score = 29999;
  engine.update();
  assert.strictEqual(data.lives, lives, 'nothing yet below the threshold');

  data.score = 30000;
  engine.update();
  assert.strictEqual(data.lives, lives + 1, 'the first bonus life at 30,000');

  engine.update();
  assert.strictEqual(data.lives, lives + 1, 'and only once');

  data.score = 100000;
  engine.update();
  assert.strictEqual(data.lives, lives + 2, 'the second at 100,000');
}

/** FAQ-4.3: "Bonus lives: NONE". */
export async function hardModeGrantsNoBonusLives(): Promise<void> {
  const data = createData('hard');
  const engine = new QixEngine(data, () => { /* no display in tests */ });

  engine.initLevel(1);
  data.state = 'playing';
  data.qixList = [];
  data.sparxList = [];

  const lives = data.lives;
  data.score = 250000;
  engine.update();

  assert.strictEqual(data.lives, lives);
}
