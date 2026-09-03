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

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { AttackSettings } from './attack-engine';
import { attackFileName } from './challenge-mode';

/** Where the vendored scripts live, relative to this module. */
const PATTERN_DIR = join(__dirname, '..', '..', 'attack-patterns');

export function attackPatternDirectory(): string {
  return PATTERN_DIR;
}

/** Is there a script for this Challenge stage? Used to resolve fallbacks. */
export function hasChallengeFile(difficulty: number, stage: number): boolean {
  return existsSync(join(PATTERN_DIR, attackFileName(difficulty, stage)));
}

/** Read one script by file name. */
export function loadAttackFile(fileName: string): AttackSettings {
  const path = join(PATTERN_DIR, fileName);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as AttackSettings;
  if (!parsed.name) {
    parsed.name = fileName.replace(/\.json$/, '');
  }
  return parsed;
}

/**
 * The script for a Challenge stage, resolving DOWNWARD to the nearest stage
 * that has one - which is how the pressure changes in steps while the health
 * parameters change every stage.
 */
export function loadChallengeAttack(difficulty: number, stage: number): AttackSettings {
  for (let candidate = stage; candidate >= 1; candidate--) {
    if (hasChallengeFile(difficulty, candidate)) {
      return loadAttackFile(attackFileName(difficulty, candidate));
    }
  }
  throw new Error(`no attack file for challenge difficulty ${difficulty}`);
}

/**
 * The Training scripts: the named punching bags, without the Challenge stages.
 */
export function listTrainingPatterns(): string[] {
  return readdirSync(PATTERN_DIR)
    .filter((name) => name.endsWith('.json') && !name.startsWith('challenge-'))
    .sort();
}
