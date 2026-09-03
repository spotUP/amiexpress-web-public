/**
 * Loading the shipped attack scripts.
 *
 * 68 files, vendored unmodified from panel-attack's own
 * client/assets/default_data/training. 66 of them are Challenge Mode stages;
 * the other two are the Training punching bags.
 *
 * MANY OF THESE ARE RECORDINGS OF REAL GAMES. The late Challenge stages carry
 * an `extraInfo` block naming the player and their garbage-per-minute -
 * challenge-8-12 is somebody sustaining 32.9 GPM - so the hardest stages are
 * not a designer's idea of hard, they are what a person actually did.
 *
 * Paths resolve from THIS FILE, never from the working directory: a door is
 * launched from wherever the BBS happens to be, and the build copies data/
 * alongside the compiled output so the same relative path works in both.
 */
import type { AttackSettings } from './attack-engine';
export declare function attackPatternDirectory(): string;
/** Is there a script for this Challenge stage? Used to resolve fallbacks. */
export declare function hasChallengeFile(difficulty: number, stage: number): boolean;
/** Read one script by file name. */
export declare function loadAttackFile(fileName: string): AttackSettings;
/**
 * The script for a Challenge stage, resolving DOWNWARD to the nearest stage
 * that has one - which is how the pressure changes in steps while the health
 * parameters change every stage.
 */
export declare function loadChallengeAttack(difficulty: number, stage: number): AttackSettings;
/**
 * The Training scripts: the named punching bags, without the Challenge stages.
 */
export declare function listTrainingPatterns(): string[];
//# sourceMappingURL=attack-patterns.d.ts.map