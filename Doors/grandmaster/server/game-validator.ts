/**
 * Server-Side Game Validator
 *
 * Validates game results to prevent cheating and ensure fair play
 * - Score validation (sanity checks)
 * - Timing validation
 * - Grade progression validation
 * - Statistical analysis for anomaly detection
 */

import type { GameResult, GameMode } from '../core/types';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  score: number;        // Confidence score 0-100
  flags: string[];      // Warning flags
  violations: string[]; // Rule violations
}

/**
 * Game replay data for validation
 */
export interface ReplayData {
  inputs: Array<{
    timestamp: number;
    action: string;
  }>;
  states: Array<{
    timestamp: number;
    level: number;
    lines: number;
    score: number;
    grade: string;
  }>;
}

/**
 * Server-side game validator
 */
export class GameValidator {
  /**
   * Validate a game result
   */
  validate(result: GameResult, replay?: ReplayData): ValidationResult {
    const flags: string[] = [];
    const violations: string[] = [];
    let score = 100;

    // Score sanity check
    const scoreCheck = this.validateScore(result);
    if (!scoreCheck.valid) {
      violations.push(...scoreCheck.violations);
      score -= 30;
    }
    flags.push(...scoreCheck.flags);

    // Timing validation
    const timingCheck = this.validateTiming(result);
    if (!timingCheck.valid) {
      violations.push(...timingCheck.violations);
      score -= 25;
    }
    flags.push(...timingCheck.flags);

    // Grade progression
    const gradeCheck = this.validateGrade(result);
    if (!gradeCheck.valid) {
      violations.push(...gradeCheck.violations);
      score -= 20;
    }
    flags.push(...gradeCheck.flags);

    // Statistical analysis
    if (replay) {
      const statsCheck = this.validateStatistics(result, replay);
      if (!statsCheck.valid) {
        violations.push(...statsCheck.violations);
        score -= 15;
      }
      flags.push(...statsCheck.flags);
    }

    return {
      valid: violations.length === 0,
      score: Math.max(0, score),
      flags,
      violations,
    };
  }

  /**
   * Validate score ranges
   */
  private validateScore(result: GameResult): { valid: boolean; flags: string[]; violations: string[] } {
    const flags: string[] = [];
    const violations: string[] = [];

    // Maximum theoretical scores per mode
    const MAX_SCORES: Record<GameMode, number> = {
      master: 2000000,    // ~999 level, perfect play
      death: 2000000,
      sprint: 500000,     // 40 lines
      marathon: 1000000,  // 150 lines
      versus: 2000000,
      cpu_battle: 2000000,
      ultra: 300000,      // 3 minutes
      blitz: 100000,      // 2 minutes
      combo: 500000,
      survival: 1000000,
      dig: 500000,
      classic: 1000000,
      zen: 1000000,
      training: 1000000,
    };

    const maxScore = MAX_SCORES[result.mode] || 1000000;

    if (result.score > maxScore) {
      violations.push(`Score ${result.score} exceeds maximum ${maxScore} for ${result.mode} mode`);
    }

    // Score should correlate with level
    if (result.mode === 'master' || result.mode === 'death') {
      const expectedMinScore = result.level * 100;  // Very conservative
      if (result.score < expectedMinScore) {
        flags.push('Score unusually low for level achieved');
      }

      const expectedMaxScore = result.level * 2000; // Generous upper bound
      if (result.score > expectedMaxScore) {
        flags.push('Score unusually high for level achieved');
      }
    }

    // Negative score check
    if (result.score < 0) {
      violations.push('Negative score detected');
    }

    return { valid: violations.length === 0, flags, violations };
  }

  /**
   * Validate timing
   */
  private validateTiming(result: GameResult): { valid: boolean; flags: string[]; violations: string[] } {
    const flags: string[] = [];
    const violations: string[] = [];

    if (!result.time) {
      return { valid: true, flags, violations };
    }

    // Minimum time checks (impossibly fast = cheating)
    const MIN_TIMES: Record<GameMode, number> = {
      master: 120000,     // 2 minutes minimum (even at 20G)
      death: 60000,       // 1 minute minimum
      sprint: 20000,      // 20 seconds minimum for 40 lines
      marathon: 120000,   // 2 minutes minimum
      versus: 30000,
      cpu_battle: 30000,
      ultra: 180000,      // Must be at least 3 minutes
      blitz: 120000,      // Must be at least 2 minutes
      combo: 60000,
      survival: 60000,
      dig: 60000,
      classic: 60000,
      zen: 60000,
      training: 30000,
    };

    const minTime = MIN_TIMES[result.mode];
    if (minTime && result.time < minTime) {
      violations.push(`Completion time ${result.time}ms is impossibly fast (min: ${minTime}ms)`);
    }

    // Maximum reasonable times
    const MAX_TIMES: Record<GameMode, number> = {
      master: 900000,     // 15 minutes max
      death: 900000,
      sprint: 600000,     // 10 minutes max
      marathon: 1800000,  // 30 minutes max
      versus: 1800000,
      cpu_battle: 1800000,
      ultra: 180000,      // Must be exactly 3 minutes
      blitz: 120000,      // Must be exactly 2 minutes
      combo: 1800000,
      survival: 3600000,
      dig: 1800000,
      classic: 1800000,
      zen: 3600000,
      training: 3600000,
  };

    const maxTime = MAX_TIMES[result.mode];
    if (maxTime && result.time > maxTime) {
      flags.push(`Completion time ${result.time}ms exceeds expected maximum ${maxTime}ms`);
    }

    // Lines per minute check
    if (result.linesCleared > 0 && result.time > 0) {
      const lpm = (result.linesCleared / (result.time / 60000));
      if (lpm > 300) { // 5 lines per second sustained = suspicious
        violations.push(`Lines per minute (${lpm.toFixed(1)}) is impossibly high`);
      }
    }

    return { valid: violations.length === 0, flags, violations };
  }

  /**
   * Validate grade progression
   */
  private validateGrade(result: GameResult): { valid: boolean; flags: string[]; violations: string[] } {
    const flags: string[] = [];
    const violations: string[] = [];

    // Grade should correlate with level
    const gradeRanks: Record<string, number> = {
      '9': 0, '8': 1, '7': 2, '6': 3, '5': 4, '4': 5, '3': 6, '2': 7, '1': 8,
      'S1': 9, 'S2': 10, 'S3': 11, 'S4': 12, 'S5': 13, 'S6': 14, 'S7': 15, 'S8': 16, 'S9': 17,
      'S10': 18, 'S11': 19, 'S12': 20, 'S13': 21,
      'm1': 22, 'm2': 23, 'm3': 24, 'm4': 25, 'm5': 26, 'm6': 27, 'm7': 28, 'm8': 29, 'm9': 30,
      'M': 31, 'MK': 32, 'MV': 33, 'MO': 34, 'GM': 35, 'GMM': 36,
    };

    const gradeRank = gradeRanks[result.grade] ?? 0;

    // GM/GMM requires level 999
    if ((result.grade === 'GM' || result.grade === 'GMM') && result.level < 999) {
      violations.push(`Grade ${result.grade} requires level 999, got ${result.level}`);
    }

    // M grades require high level
    if (result.grade.startsWith('M') && result.level < 500) {
      violations.push(`Grade ${result.grade} is extremely unlikely at level ${result.level}`);
    }

    // S grades require moderate level
    if (result.grade.startsWith('S') && result.level < 100) {
      flags.push(`Grade ${result.grade} at level ${result.level} is unusual but possible`);
    }

    return { valid: violations.length === 0, flags, violations };
  }

  /**
   * Validate statistics from replay data
   */
  private validateStatistics(result: GameResult, replay: ReplayData): { valid: boolean; flags: string[]; violations: string[] } {
    const flags: string[] = [];
    const violations: string[] = [];

    // Input rate validation
    if (replay.inputs.length > 0) {
      const totalTime = result.time || 1;
      const inputsPerSecond = (replay.inputs.length / (totalTime / 1000));

      // Humans can't sustain > 30 inputs/second
      if (inputsPerSecond > 30) {
        violations.push(`Input rate ${inputsPerSecond.toFixed(1)}/sec exceeds human capability`);
      }

      // Too few inputs is also suspicious
      if (inputsPerSecond < 0.5 && result.linesCleared > 10) {
        flags.push(`Input rate ${inputsPerSecond.toFixed(1)}/sec is unusually low`);
      }
    }

    // State progression validation
    if (replay.states.length > 1) {
      for (let i = 1; i < replay.states.length; i++) {
        const prev = replay.states[i - 1];
        const curr = replay.states[i];

        // Lines should only increase
        if (curr.lines < prev.lines) {
          violations.push(`Lines decreased from ${prev.lines} to ${curr.lines}`);
        }

        // Score should only increase
        if (curr.score < prev.score) {
          violations.push(`Score decreased from ${prev.score} to ${curr.score}`);
        }

        // Level should only increase
        if (curr.level < prev.level) {
          violations.push(`Level decreased from ${prev.level} to ${curr.level}`);
        }
      }
    }

    // Finesse validation (if available)
    if (result.finesseRate !== undefined) {
      if (result.finesseRate < 0 || result.finesseRate > 1) {
        violations.push(`Invalid finesse rate: ${result.finesseRate}`);
      }

      // Perfect finesse (100%) is suspicious unless very skilled
      if (result.finesseRate === 1 && result.level > 500) {
        flags.push('Perfect finesse at high level is exceptional');
      }
    }

    return { valid: violations.length === 0, flags, violations };
  }

  /**
   * Calculate anomaly score (0-100, higher = more suspicious)
   */
  calculateAnomalyScore(result: GameResult): number {
    let anomalyScore = 0;

    // Check for perfect stats (too perfect = suspicious)
    if (result.finesseRate === 1.0) anomalyScore += 15;
    if (result.finesseErrors === 0 && result.lines > 100) anomalyScore += 10;

    // Check for unusual ratios
    if (result.time && result.linesCleared > 0) {
      const lpm = (result.linesCleared / (result.time / 60000));
      if (lpm > 200) anomalyScore += 20;
      if (lpm > 250) anomalyScore += 30;
    }

    // Grade vs level mismatch
    if (result.grade === 'GM' && result.level < 999) anomalyScore += 50;
    if (result.grade.startsWith('M') && result.level < 500) anomalyScore += 30;

    return Math.min(100, anomalyScore);
  }
}
