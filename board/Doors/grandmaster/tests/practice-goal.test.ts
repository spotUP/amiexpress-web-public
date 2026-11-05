/**
 * PRACTICE goals - what ends a training run.
 *
 * HeborisCE's practice mode ends on a level, a line count, a piece count or a
 * clock (gamestart.c:11229-11252, values from p_goaltypenumlist at 745). This
 * door's training mode had a start level and nothing else: a run ended when
 * the player topped out or quit.
 */

import assert from 'assert';
import { GameEngine } from '../core/game';
import { createBoard } from '../core/board';
import {
  practiceGoalReached, practiceGoalTarget, PRACTICE_GOAL_VALUES,
} from '../core/practice-goal';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};

export async function theValueListIsTheReferencesOwn(): Promise<void> {
  assert.deepStrictEqual(
    [...PRACTICE_GOAL_VALUES], [5, 10, 20, 30, 50, 75, 100, 130, 160, 200],
    'gamestart.c:745 p_goaltypenumlist'
  );
}

export async function theLevelGoalIsTenTimesTheNumberPicked(): Promise<void> {
  // gamestart.c:11231 `tc >= p_goaltypenumlist[n] * 10` - the level goal is
  // the only one that multiplies, which is easy to get wrong in both
  // directions.
  assert.strictEqual(practiceGoalTarget({ type: 'level', value: 30 }), 300);
  assert.strictEqual(practiceGoalTarget({ type: 'lines', value: 30 }), 30);
  assert.strictEqual(practiceGoalTarget({ type: 'pieces', value: 30 }), 30);
  assert.strictEqual(practiceGoalTarget({ type: 'time', value: 30 }), 30);
  assert.strictEqual(practiceGoalTarget({ type: 'none', value: 30 }), null);
  assert.strictEqual(practiceGoalTarget({ type: 'lines', value: 0 }), null, 'no value, no goal');
}

export async function eachGoalWatchesItsOwnCounter(): Promise<void> {
  const run = { level: 100, lines: 9, pieces: 40, elapsedSeconds: 12 };
  assert.strictEqual(practiceGoalReached({ type: 'level', value: 10 }, run), true, 'level 100');
  assert.strictEqual(practiceGoalReached({ type: 'level', value: 20 }, run), false);
  assert.strictEqual(practiceGoalReached({ type: 'lines', value: 5 }, run), true);
  assert.strictEqual(practiceGoalReached({ type: 'lines', value: 10 }, run), false);
  assert.strictEqual(practiceGoalReached({ type: 'pieces', value: 30 }, run), true);
  assert.strictEqual(practiceGoalReached({ type: 'time', value: 10 }, run), true);
  assert.strictEqual(practiceGoalReached({ type: 'none', value: 5 }, run), false);
}

export async function aTrainingRunEndsWhenItsGoalIsMet(): Promise<void> {
  const engine: any = new GameEngine('training', settings, sounds);
  engine.setPracticeGoal({ type: 'lines', value: 5 });
  engine.start();

  assert.strictEqual(engine.getState().status, 'playing');
  engine.getState().lines = 4;
  engine.update(1000 / 60);
  assert.strictEqual(engine.getState().status, 'playing', 'four lines is not five');

  engine.getState().lines = 5;
  engine.update(1000 / 60);
  assert.strictEqual(engine.getState().status, 'complete', 'the run ends on the goal');
  assert.ok(engine.getState().endTime, 'and records when it ended');
}

export async function aTimeGoalLandsWhileNoPieceIsMoving(): Promise<void> {
  // The check sits above the ARE early return: a clock runs out between
  // pieces as readily as during one.
  const engine: any = new GameEngine('training', settings, sounds);
  engine.setPracticeGoal({ type: 'time', value: 5 });
  engine.start();
  engine.getState().currentPiece = null;              // mid-ARE
  engine.getState().startTime = Date.now() - 6000;    // six seconds in

  engine.update(1000 / 60);

  assert.strictEqual(engine.getState().status, 'complete', 'the clock ended the run');
}

export async function anEndlessRunIsStillEndless(): Promise<void> {
  const engine: any = new GameEngine('training', settings, sounds);
  engine.setPracticeGoal({ type: 'none', value: 0 });
  engine.start();
  engine.getState().lines = 999;
  engine.getState().level = 999;
  engine.getState().piecesPlaced = 999;

  for (let f = 0; f < 60; f++) engine.update(1000 / 60);

  assert.strictEqual(engine.getState().status, 'playing', 'no goal, no ending');
}

export async function aPieceGoalCountsPiecesThatActuallyLocked(): Promise<void> {
  const engine: any = new GameEngine('training', settings, sounds);
  engine.setPracticeGoal({ type: 'pieces', value: 5 });
  engine.start();

  for (let piece = 0; piece < 5 && engine.getState().status === 'playing'; piece++) {
    engine.getState().board.grid =
      createBoard(engine.getState().board.width, engine.getState().board.height).grid;
    engine.hardDrop();
    for (let f = 0; f < 40 && !engine.getState().currentPiece
                    && engine.getState().status === 'playing'; f++) {
      engine.update(50);
    }
  }

  assert.strictEqual(engine.getState().status, 'complete', 'five locked pieces end the run');
  assert.ok(engine.getState().piecesPlaced >= 5);
}
