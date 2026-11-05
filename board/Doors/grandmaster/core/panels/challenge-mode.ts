/**
 * Challenge Mode's stage ladder, ported from client/src/ChallengeMode.lua.
 *
 * THIS IS THE ORIGINAL'S VS. COMPUTER MODE. The stage counts give it away:
 * panel-attack's difficulties 1-4 have 10, 11, 12 and 12 stages, and the SNES
 * game's Easy, Normal, Hard and S.Hard have exactly 10, 11, 12 and 12 levels.
 * panel-attack then adds four harder difficulties of its own on top.
 *
 * Each stage sets three things: how long the opponent can stay buried before
 * it dies, how fast it digs itself out, and - notably - WHAT LEVEL YOU PLAY AT.
 * The player's own speed is forced by the difficulty, so choosing difficulty 8
 * is choosing to play at modern level 10 whether you like it or not.
 *
 * The attack scripts resolve DOWNWARD: a stage with no file of its own uses the
 * nearest lower one that has it. So the pressure changes only at the stages
 * that were authored, while the health parameters change every stage.
 */

import { getModern } from './level-data';
import type { HealthSettings } from './health';
import type { AttackSettings } from './attack-engine';

export const CHALLENGE_DIFFICULTIES = 8;

interface DifficultySpec {
  stageCount: number;
  framesToppedOutToLoseBase: number;
  framesToppedOutToLoseIncrement: number;
  lineClearGPMBase: number;
  lineClearGPMIncrement: number;
  /** The modern level the PLAYER is forced to play at. */
  panelLevel: number;
  lineHeightToKill: number;
}

/**
 * The eight difficulties, verbatim.
 *
 * Difficulty 5 is where it stops being a curve and becomes a wall: the burial
 * tolerance jumps from +30 per stage to +240, so a late stage there can absorb
 * four seconds of being buried rather than half of one.
 */
const DIFFICULTIES: readonly DifficultySpec[] = [
  { stageCount: 10, framesToppedOutToLoseBase: 60, framesToppedOutToLoseIncrement: 3, lineClearGPMBase: 3.3, lineClearGPMIncrement: 0.45, panelLevel: 2, lineHeightToKill: 6 },
  { stageCount: 11, framesToppedOutToLoseBase: 66, framesToppedOutToLoseIncrement: 6, lineClearGPMBase: 5, lineClearGPMIncrement: 0.7, panelLevel: 4, lineHeightToKill: 6 },
  { stageCount: 12, framesToppedOutToLoseBase: 72, framesToppedOutToLoseIncrement: 12, lineClearGPMBase: 15.5, lineClearGPMIncrement: 0.7, panelLevel: 6, lineHeightToKill: 6 },
  { stageCount: 12, framesToppedOutToLoseBase: 72, framesToppedOutToLoseIncrement: 30, lineClearGPMBase: 15.5, lineClearGPMIncrement: 1.5, panelLevel: 6, lineHeightToKill: 6 },
  { stageCount: 12, framesToppedOutToLoseBase: 72, framesToppedOutToLoseIncrement: 240, lineClearGPMBase: 30, lineClearGPMIncrement: 1.5, panelLevel: 8, lineHeightToKill: 6 },
  { stageCount: 12, framesToppedOutToLoseBase: 72, framesToppedOutToLoseIncrement: 240, lineClearGPMBase: 35, lineClearGPMIncrement: 1.5, panelLevel: 10, lineHeightToKill: 6 },
  { stageCount: 12, framesToppedOutToLoseBase: 360, framesToppedOutToLoseIncrement: 240, lineClearGPMBase: 37, lineClearGPMIncrement: 1.5, panelLevel: 10, lineHeightToKill: 6 },
  { stageCount: 12, framesToppedOutToLoseBase: 720, framesToppedOutToLoseIncrement: 240, lineClearGPMBase: 39, lineClearGPMIncrement: 1.5, panelLevel: 10, lineHeightToKill: 6 },
];

export interface ChallengeStage {
  index: number;
  healthSettings: HealthSettings;
  /** The modern level the player is put on for this stage. */
  playerLevel: number;
  /** The attack script's stage number, after resolving downward. */
  attackStage: number;
}

export function challengeStageCount(difficulty: number): number {
  return specFor(difficulty).stageCount;
}

function specFor(difficulty: number): DifficultySpec {
  const spec = DIFFICULTIES[difficulty - 1];
  if (!spec) throw new Error(`Invalid challenge mode difficulty level of ${difficulty}`);
  return spec;
}

/**
 * Which attack script a stage uses.
 *
 * Files exist only at some stages, and a stage without one falls back to the
 * nearest lower stage that has it - so the attack pattern changes in steps
 * while the health parameters change smoothly.
 */
export function resolveAttackStage(
  difficulty: number, stageIndex: number, hasFile: (d: number, s: number) => boolean,
): number {
  for (let stage = stageIndex; stage >= 1; stage--) {
    if (hasFile(difficulty, stage)) return stage;
  }
  return 1;
}

/** Every stage of a difficulty, in order. */
export function createStages(
  difficulty: number,
  hasFile: (d: number, s: number) => boolean = () => true,
): ChallengeStage[] {
  const spec = specFor(difficulty);
  const riseSpeed = getModern(spec.panelLevel).startingSpeed;
  const stages: ChallengeStage[] = [];

  for (let stageIndex = 1; stageIndex <= spec.stageCount; stageIndex++) {
    const step = stageIndex - 1;
    stages.push({
      index: stageIndex,
      healthSettings: {
        framesToppedOutToLose:
          spec.framesToppedOutToLoseBase + spec.framesToppedOutToLoseIncrement * step,
        lineClearGPM: spec.lineClearGPMBase + spec.lineClearGPMIncrement * step,
        lineHeightToKill: spec.lineHeightToKill,
        riseSpeed,
      },
      playerLevel: spec.panelLevel,
      attackStage: resolveAttackStage(difficulty, stageIndex, hasFile),
    });
  }

  return stages;
}

/** The file a stage's attack script lives in. */
export function attackFileName(difficulty: number, stage: number): string {
  return `challenge-${difficulty}-${stage}.json`;
}

/**
 * How a run is scored.
 *
 * There are no lives. Losing a stage costs a CONTINUE and you replay it; the
 * run is measured by total time plus continues, so a clean slow run can beat a
 * fast messy one.
 */
export interface ChallengeProgress {
  difficulty: number;
  stageIndex: number;
  continues: number;
  expendedFrames: number;
  complete: boolean;
}

export function newChallengeProgress(difficulty: number): ChallengeProgress {
  specFor(difficulty);
  return { difficulty, stageIndex: 1, continues: 0, expendedFrames: 0, complete: false };
}

/** Record a finished stage. `playerWon` false means the player was beaten. */
export function recordStageResult(
  progress: ChallengeProgress, playerWon: boolean, frames: number,
): ChallengeProgress {
  const next = { ...progress, expendedFrames: progress.expendedFrames + frames };

  if (!playerWon) {
    // Not a loss of the run - just a continue, and the same stage again.
    next.continues += 1;
    return next;
  }

  if (next.stageIndex < challengeStageCount(next.difficulty)) {
    next.stageIndex += 1;
  } else {
    next.complete = true;
  }
  return next;
}

export { AttackSettings };
