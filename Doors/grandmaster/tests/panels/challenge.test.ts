/**
 * Challenge Mode: the opponent that has no board.
 *
 * This is the original's VS. COMPUTER, and the stage counts prove it -
 * panel-attack's difficulties 1 to 4 have 10, 11, 12 and 12 stages, exactly
 * matching the SNES game's Easy, Normal, Hard and S.Hard. The other four
 * difficulties are panel-attack's own additions on top.
 */

import assert from 'assert';
import { Health } from '../../core/panels/health';
import { AttackEngine } from '../../core/panels/attack-engine';
import { SimulatedStack } from '../../core/panels/simulated-stack';
import { GarbageQueue } from '../../core/panels/garbage-queue';
import {
  createStages, challengeStageCount, CHALLENGE_DIFFICULTIES,
  newChallengeProgress, recordStageResult, attackFileName,
} from '../../core/panels/challenge-mode';
import {
  loadChallengeAttack, listTrainingPatterns, hasChallengeFile, loadAttackFile,
} from '../../core/panels/attack-patterns';
import { getModern } from '../../core/panels/level-data';

// --- health ---

/**
 * Damage is linear to five rows then sublinear, so anything ten rows or taller
 * is worth exactly seven. One enormous chain cannot end a match by itself.
 *
 * These are upstream's own HealthTests values.
 */
export async function damageForHeightMatchesUpstream(): Promise<void> {
  const health = new Health({
    framesToppedOutToLose: 10, lineClearGPM: 0, lineHeightToKill: 6, riseSpeed: 10,
  });

  for (let height = 1; height <= 5; height++) {
    assert.strictEqual(health.damageForHeight(height), height, 'linear below six');
  }
  const close = (actual: number, expected: number) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

  close(health.damageForHeight(6), 5.8);
  close(health.damageForHeight(7), 6.4);
  close(health.damageForHeight(8), 6.8);
  close(health.damageForHeight(9), 7);
  close(health.damageForHeight(10), 7);
  close(health.damageForHeight(13), 7, 'and it never grows again');
}

/** Two +4 combos in a row count as one - so spamming the smallest is weak. */
export async function twoFourCombosInARowCountAsOne(): Promise<void> {
  const health = new Health({
    framesToppedOutToLose: 100, lineClearGPM: 0, lineHeightToKill: 100, riseSpeed: 99,
  });
  const fourCombo = { width: 3, height: 1, isMetal: false, isChain: false, frameEarned: 0 };

  health.receiveGarbage({ ...fourCombo });
  const afterFirst = health.currentLines;
  health.receiveGarbage({ ...fourCombo });
  assert.strictEqual(health.currentLines, afterFirst, 'the second one is free');

  health.receiveGarbage({ ...fourCombo });
  assert.ok(health.currentLines > afterFirst, 'and the third counts again');
}

/**
 * Damage to the burial counter is PERMANENT. A real stack's health refills once
 * it is no longer topped out; this one's never does, which is what makes a
 * sustained attack tell.
 */
export async function burialDamageIsPermanent(): Promise<void> {
  const health = new Health({
    framesToppedOutToLose: 60, lineClearGPM: 600, lineHeightToKill: 1, riseSpeed: 99,
  });
  health.currentLines = 50; // deeply buried
  health.run();
  const afterBurial = health.framesToppedOutToLose;
  assert.ok(afterBurial < 60, 'it lost time while buried');

  health.currentLines = 0; // dug itself out
  for (let i = 0; i < 100; i++) health.run();
  assert.ok(
    health.framesToppedOutToLose <= afterBurial,
    'and never gets that time back',
  );
}

/** Its ability to clear decays to half over the first five hundred seconds. */
export async function staminaDecaysToHalfAndNoFurther(): Promise<void> {
  // A high clear rate on purpose: the opponent's own rise adds lines every
  // frame too, and at a low rate the rise outpaces the clearing so the net
  // change is an INCREASE - which measures nothing about stamina.
  const health = new Health({
    framesToppedOutToLose: 1e9, lineClearGPM: 6000, lineHeightToKill: 1e9, riseSpeed: 99,
  });

  health.currentLines = 1000;
  const before = health.currentLines;
  health.run();
  const earlyClear = before - health.currentLines;

  // Jump to well past the decay window.
  health.clock = 60 * 1000;
  health.currentLines = 1000;
  const lateBefore = health.currentLines;
  health.run();
  const lateClear = lateBefore - health.currentLines;

  assert.ok(lateClear < earlyClear, 'it clears more slowly later');
  assert.ok(lateClear > earlyClear * 0.4, 'but never below half');
}

// --- the stage ladder ---

export async function theFirstFourDifficultiesMatchTheSnesLadder(): Promise<void> {
  assert.strictEqual(CHALLENGE_DIFFICULTIES, 8);
  assert.strictEqual(challengeStageCount(1), 10, 'Easy');
  assert.strictEqual(challengeStageCount(2), 11, 'Normal');
  assert.strictEqual(challengeStageCount(3), 12, 'Hard');
  assert.strictEqual(challengeStageCount(4), 12, 'S.Hard');
}

export async function eachStageIsHarderThanTheLast(): Promise<void> {
  const stages = createStages(3);
  for (let i = 1; i < stages.length; i++) {
    assert.ok(
      stages[i].healthSettings.framesToppedOutToLose
        > stages[i - 1].healthSettings.framesToppedOutToLose,
      'it survives being buried for longer',
    );
    assert.ok(
      stages[i].healthSettings.lineClearGPM > stages[i - 1].healthSettings.lineClearGPM,
      'and digs itself out faster',
    );
  }
}

/** The difficulty forces the PLAYER's level too - it is not a free choice. */
export async function theDifficultyForcesThePlayersOwnLevel(): Promise<void> {
  assert.strictEqual(createStages(1)[0].playerLevel, 2);
  assert.strictEqual(createStages(5)[0].playerLevel, 8);
  assert.strictEqual(createStages(8)[0].playerLevel, 10);
  assert.strictEqual(
    createStages(8)[0].healthSettings.riseSpeed, getModern(10).startingSpeed,
    "and the opponent rises at that level's speed",
  );
}

export async function anInvalidDifficultyIsRejected(): Promise<void> {
  assert.throws(() => createStages(0), /Invalid challenge mode difficulty/);
  assert.throws(() => createStages(9), /Invalid challenge mode difficulty/);
}

// --- the shipped scripts ---

export async function theShippedAttackScriptsAreThere(): Promise<void> {
  // 66 challenge stages plus the two Training bags.
  assert.ok(hasChallengeFile(1, 1), 'the first stage of the easiest difficulty');
  assert.ok(hasChallengeFile(8, 12), 'and the last of the hardest');

  const training = listTrainingPatterns();
  assert.ok(training.includes('armageddon.json'));
  assert.ok(training.includes('bronze.json'));
}

/**
 * Scripts resolve DOWNWARD: an unauthored stage reuses the nearest lower one,
 * so the pressure changes in steps while the health parameters change smoothly.
 */
export async function anUnauthoredStageFallsBackToTheOneBelow(): Promise<void> {
  // Difficulty 1 ships files at stages 1, 5, 9 and 10 only.
  assert.ok(hasChallengeFile(1, 5));
  assert.ok(!hasChallengeFile(1, 6), 'stage 6 has no file of its own');

  const stages = createStages(1, hasChallengeFile);
  assert.strictEqual(stages[5].attackStage, 5, 'stage 6 uses stage 5 s script');
  assert.strictEqual(stages[0].attackStage, 1);

  const script = loadChallengeAttack(1, 6);
  assert.ok(script.attackPatterns.length > 0, 'and it loads');
}

/** The hardest stages are recordings of real players, and say so. */
export async function theHardestStagesAreRecordedHumanGames(): Promise<void> {
  const script = loadAttackFile(attackFileName(8, 12));
  assert.ok(script.extraInfo, 'it carries the provenance of the recording');
  assert.ok(script.extraInfo?.playerName, 'including who played it');
  assert.ok(script.extraInfo?.gpm, 'and how much garbage a minute they sustained');
}

// --- the opponent, running ---

export async function aTrainingOpponentNeverDies(): Promise<void> {
  const opponent = new SimulatedStack({
    attackSettings: loadAttackFile('bronze.json'),
  });
  assert.strictEqual(opponent.healthEngine, undefined, 'no health model at all');

  for (let i = 0; i < 3000; i++) opponent.run();
  assert.ok(!opponent.gameEnded(), 'a punching bag cannot be knocked over');
  assert.ok(opponent.outgoingGarbage.history.length > 0, 'but it does attack');
}

export async function aChallengeOpponentCanBeKilled(): Promise<void> {
  const stage = createStages(1, hasChallengeFile)[0];
  const opponent = new SimulatedStack({
    attackSettings: loadChallengeAttack(1, stage.attackStage),
    healthSettings: stage.healthSettings,
  });

  // Bury it: a wall of tall chain garbage, far more than it can dig out.
  for (let i = 0; i < 20; i++) {
    opponent.receiveGarbage([
      { width: 6, height: 12, isMetal: false, isChain: true, frameEarned: 0, finalized: true },
    ]);
    opponent.run();
  }
  for (let i = 0; i < 2000 && !opponent.gameEnded(); i++) opponent.run();

  assert.ok(opponent.gameEnded(), 'enough garbage kills it');
}

export async function anAttackScriptSendsGarbageOnItsOwnSchedule(): Promise<void> {
  const queue = new GarbageQueue();
  const engine = new AttackEngine(loadAttackFile('bronze.json'), queue);

  for (let i = 0; i < 2000; i++) engine.run();

  assert.ok(queue.history.length > 0, 'it sent something');
  assert.ok(queue.history.some((g) => g.isChain), 'including a chain');
}

/**
 * A script whose delay has not been countdown-adjusted is shifted back by the
 * whole 188-frame countdown, so a file saying it starts at frame 150 in fact
 * starts immediately.
 */
export async function anUnadjustedScriptIsShiftedBackByTheCountdown(): Promise<void> {
  const queue = new GarbageQueue();
  const engine = new AttackEngine({
    delayBeforeStart: 150,
    delayBeforeRepeat: 91,
    attackPatterns: [{ width: 6, height: 1, startTime: 0 }],
  }, queue);

  assert.strictEqual(engine.delayBeforeStart, 150 - 188);
}

/**
 * A Challenge run has NO LIVES. Losing a stage costs a continue and you replay
 * the same stage; the run is scored on total time plus continues, so a clean
 * slow run can beat a fast messy one.
 */
export async function losingAStageCostsAContinueRatherThanTheRun(): Promise<void> {
  let progress = newChallengeProgress(1);
  assert.strictEqual(progress.stageIndex, 1);
  assert.strictEqual(progress.continues, 0);

  progress = recordStageResult(progress, false, 600);
  assert.strictEqual(progress.stageIndex, 1, 'the same stage again');
  assert.strictEqual(progress.continues, 1, 'at the cost of a continue');
  assert.strictEqual(progress.expendedFrames, 600, 'and the time still counts');

  progress = recordStageResult(progress, true, 400);
  assert.strictEqual(progress.stageIndex, 2, 'winning advances');
  assert.strictEqual(progress.continues, 1);
  assert.strictEqual(progress.expendedFrames, 1000);
  assert.strictEqual(progress.complete, false);
}

export async function beatingTheLastStageCompletesTheRun(): Promise<void> {
  let progress = newChallengeProgress(1);
  for (let stage = 1; stage <= challengeStageCount(1); stage++) {
    progress = recordStageResult(progress, true, 100);
  }
  assert.strictEqual(progress.complete, true);
  assert.strictEqual(progress.continues, 0, 'a clean run');
}
