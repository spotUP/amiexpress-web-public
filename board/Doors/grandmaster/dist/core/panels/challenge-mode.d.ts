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
import type { HealthSettings } from './health';
import type { AttackSettings } from './attack-engine';
export declare const CHALLENGE_DIFFICULTIES = 8;
export interface ChallengeStage {
    index: number;
    healthSettings: HealthSettings;
    /** The modern level the player is put on for this stage. */
    playerLevel: number;
    /** The attack script's stage number, after resolving downward. */
    attackStage: number;
}
export declare function challengeStageCount(difficulty: number): number;
/**
 * Which attack script a stage uses.
 *
 * Files exist only at some stages, and a stage without one falls back to the
 * nearest lower stage that has it - so the attack pattern changes in steps
 * while the health parameters change smoothly.
 */
export declare function resolveAttackStage(difficulty: number, stageIndex: number, hasFile: (d: number, s: number) => boolean): number;
/** Every stage of a difficulty, in order. */
export declare function createStages(difficulty: number, hasFile?: (d: number, s: number) => boolean): ChallengeStage[];
/** The file a stage's attack script lives in. */
export declare function attackFileName(difficulty: number, stage: number): string;
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
export declare function newChallengeProgress(difficulty: number): ChallengeProgress;
/** Record a finished stage. `playerWon` false means the player was beaten. */
export declare function recordStageResult(progress: ChallengeProgress, playerWon: boolean, frames: number): ChallengeProgress;
export { AttackSettings };
//# sourceMappingURL=challenge-mode.d.ts.map