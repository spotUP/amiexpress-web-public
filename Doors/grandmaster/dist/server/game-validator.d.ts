/**
 * Server-Side Game Validator
 *
 * Validates game results to prevent cheating and ensure fair play
 * - Score validation (sanity checks)
 * - Timing validation
 * - Grade progression validation
 * - Statistical analysis for anomaly detection
 */
import type { GameResult } from '../core/types';
/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    score: number;
    flags: string[];
    violations: string[];
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
export declare class GameValidator {
    /**
     * Validate a game result
     */
    validate(result: GameResult, replay?: ReplayData): ValidationResult;
    /**
     * Validate score ranges
     */
    private validateScore;
    /**
     * Validate timing
     */
    private validateTiming;
    /**
     * Validate grade progression
     */
    private validateGrade;
    /**
     * Validate statistics from replay data
     */
    private validateStatistics;
    /**
     * Calculate anomaly score (0-100, higher = more suspicious)
     */
    calculateAnomalyScore(result: GameResult): number;
}
//# sourceMappingURL=game-validator.d.ts.map