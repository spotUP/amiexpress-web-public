/**
 * The end-of-level sequence and its bonuses.
 *
 * The arcade shows a BONUS tally over the finished picture - AREA with the
 * percentage taken, WORD with the letters banked - then wipes the picture
 * away and announces what the next round asks for.
 *
 * Covers FAQ-2.3d (word letters pay nothing until the level completes),
 * FAQ-2.3e and FAQ-2.4.2b (1,000 per letter when the word is unfinished),
 * FAQ-2.3f and FAQ-2.4.2c (10,000 per letter when it is finished),
 * FAQ-2.3g and FAQ-2.4.1c (500 at once for a spare letter), FAQ-2.4.2a
 * (1,000 per 1% above the threshold) and FAQ-2.4.2d, kept as an extra life
 * because a BBS door has no coin slot.
 */

import assert from 'assert';
import { QixEngine } from '../game/qix-engine';
import { PowerUpSystem } from '../game/powerups';
import { SuperQixData } from '../game/types';
import {
  FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES,
  LETTER_END_OF_LEVEL_POINTS, LETTER_WORD_COMPLETE_POINTS, SPARE_LETTER_POINTS,
  POINTS_PER_BONUS_PERCENT, EXTRA_LIFE_PERCENT,
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
    stopTimer: 0, timeMeter: 0, lastMultiplierAt: 0, lastMultiplier: 1,
    warp: null, transitionTimer: 0, transitionMessage: '',
  };
}

function clearedLevel(claimed: number, letters: string[]): {
  engine: QixEngine; data: SuperQixData; frame: () => string; gained: number;
} {
  const data = createData();
  let last = '';
  const engine = new QixEngine(data, c => { last = c; });
  engine.initLevel(1);
  data.state = 'playing';
  data.sparxList = [];
  data.qixList = [];
  data.collectedLetters = [...letters];

  const before = data.score;
  data.claimedPercent = claimed;
  engine.update();

  return { engine, data, frame: () => last, gained: data.score - before };
}

/** FAQ-2.4.2: 1,000 points for each 1% above the threshold. */
export async function theAreaBonusPaysPerPercentAboveTheThreshold(): Promise<void> {
  const { data, gained } = clearedLevel(82, []);

  const above = 82 - data.targetPercent;   // 7
  assert.strictEqual(
    gained, above * POINTS_PER_BONUS_PERCENT,
    `clearing at 82% with a ${data.targetPercent}% target should pay ` +
    `${above} x ${POINTS_PER_BONUS_PERCENT}`
  );

  // Exactly on the threshold pays nothing for area.
  const exact = clearedLevel(75, []);
  assert.strictEqual(exact.gained, 0, 'clearing exactly on the threshold earns no area bonus');
}

/**
 * FAQ-2.3: banked letters pay at the END of the level, 1,000 each while the
 * word is unfinished.
 */
export async function bankedLettersPayAtTheEndOfTheLevel(): Promise<void> {
  // 'CASTLE' is level 1's word; two of the three collected.
  const { data, gained } = clearedLevel(75, ['C', 'A']);

  assert.strictEqual(data.levelWord, 'CASTLE', 'this test assumes level 1 spells CASTLE');
  assert.strictEqual(
    gained, 2 * LETTER_END_OF_LEVEL_POINTS,
    'two banked letters should pay 1,000 each when the word is unfinished'
  );
}

/** FAQ-2.3/2.4.2: a completed word pays 10,000 per letter instead. */
export async function completingTheWordPaysTenThousandPerLetter(): Promise<void> {
  const spelled = 'CASTLE'.split('');
  const { gained } = clearedLevel(75, spelled);

  assert.strictEqual(
    gained, spelled.length * LETTER_WORD_COMPLETE_POINTS,
    'a finished word should pay 10,000 per letter'
  );
}

/**
 * FAQ-2.3: picking a needed letter up gives nothing at the time - that is
 * what makes the end-of-level bonus meaningful.
 */
export async function collectingANeededLetterPaysNothingImmediately(): Promise<void> {
  const data = createData();
  data.levelWord = 'CASTLE';
  const powerUps = new PowerUpSystem(data);

  const before = data.score;
  (powerUps as any).collectLetter('C');

  assert.strictEqual(data.score, before, 'a needed letter must not pay on pickup');
  assert.deepStrictEqual(data.collectedLetters, ['C'], 'it should be banked instead');
}

/** FAQ-2.3/2.4.1: a duplicate or unwanted letter pays 500 at once. */
export async function aSpareLetterPaysFiveHundredImmediately(): Promise<void> {
  const data = createData();
  data.levelWord = 'CASTLE';
  data.collectedLetters = ['C'];
  const powerUps = new PowerUpSystem(data);

  // A duplicate.
  let before = data.score;
  (powerUps as any).collectLetter('C');
  assert.strictEqual(data.score, before + SPARE_LETTER_POINTS, 'a duplicate pays 500');
  assert.deepStrictEqual(data.collectedLetters, ['C'], 'and is not banked twice');

  // A letter that is not in the word at all.
  before = data.score;
  (powerUps as any).collectLetter('Z');
  assert.strictEqual(data.score, before + SPARE_LETTER_POINTS, 'an unwanted letter pays 500');
  assert.ok(!data.collectedLetters.includes('Z'), 'and is not banked');
}

/**
 * The area bonus must be paid ONCE. It was briefly credited twice - once by
 * levelComplete and again by the outro - so every cleared level overpaid.
 */
export async function theAreaBonusIsNotPaidTwice(): Promise<void> {
  const { gained, data } = clearedLevel(82, []);
  const above = 82 - data.targetPercent;

  assert.strictEqual(
    gained, above * POINTS_PER_BONUS_PERCENT,
    `the area bonus was paid more than once: got ${gained} for ${above}% above target`
  );
}

/** FAQ-2.4.2d, adapted: 98% earns an extra life rather than a free credit. */
export async function fillingNinetyEightPercentEarnsAnExtraLife(): Promise<void> {
  const modest = clearedLevel(80, []);
  assert.strictEqual(modest.data.lives, STARTING_LIVES, 'an ordinary clear grants no life');

  const great = clearedLevel(EXTRA_LIFE_PERCENT, []);
  assert.strictEqual(
    great.data.lives, STARTING_LIVES + 1,
    `clearing at ${EXTRA_LIFE_PERCENT}% should grant an extra life`
  );
}

/**
 * The sequence itself: BONUS over the picture, then the next round's demand.
 */
export async function theOutroShowsTheBonusTallyThenTheNextRound(): Promise<void> {
  const { engine, frame } = clearedLevel(82, ['C', 'A']);
  const visible = () => frame().replace(/\{[^}]*\}/g, '');

  const order: string[] = [];
  let frames = 0;

  while (engine.advanceLevelOutro()) {
    frames++;
    const text = visible();
    if (text.includes('BONUS') && !order.includes('BONUS')) order.push('BONUS');
    if (text.includes('AREA') && !order.includes('AREA')) order.push('AREA');
    if (text.includes('WORD') && !order.includes('WORD')) order.push('WORD');
    if (text.includes('CHALLENGE TO') && !order.includes('CHALLENGE')) order.push('CHALLENGE');
    if (text.includes('READY') && !order.includes('READY')) order.push('READY');
    assert.ok(frames < 1000, 'the sequence should terminate');
  }

  assert.ok(order.includes('BONUS'), 'the BONUS tally should be shown');
  assert.ok(order.includes('AREA'), 'the AREA line should be shown');
  assert.ok(order.includes('WORD'), 'the WORD line should be shown');
  assert.ok(order.includes('READY'), 'the next round should announce itself');

  assert.ok(
    order.indexOf('BONUS') < order.indexOf('CHALLENGE'),
    `the tally must come before the next round's demand, got ${order.join(' -> ')}`
  );
  assert.strictEqual(engine.isRevealing(), false, 'the sequence should finish');
}
