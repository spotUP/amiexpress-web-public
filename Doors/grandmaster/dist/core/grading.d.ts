/**
 * TGM3 Grading System
 *
 * Implements the authentic TGM3 grade progression:
 * 9 → 8 → 7 → 6 → 5 → 4 → 3 → 2 → 1 →
 * S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 →
 * S10 → S11 → S12 → S13 →
 * m1 → m2 → m3 → m4 → m5 → m6 → m7 → m8 → m9 →
 * M → MK → MV → MO → GM
 */
import type { TGMGrade, GradeRequirement } from './types';
/**
 * Grade progression order
 */
export declare const GRADE_ORDER: TGMGrade[];
/**
 * GM condition flags - time gates at specific levels
 * Based on HeborisCE gamestart.c gmflag system
 */
export interface GMFlags {
    flag1: boolean;
    flag2: boolean;
    flag3: boolean;
}
/**
 * Grade requirements table
 * Internal grade points required for each grade
 */
export declare const GRADE_REQUIREMENTS: GradeRequirement[];
/**
 * Grade manager
 */
export declare class GradeManager {
    private internalGrade;
    private currentGrade;
    private gradeIndex;
    private gameStartTime;
    private gmFlags;
    private level300Time;
    private level500Time;
    private level700Time;
    private coolCount;
    private regretCount;
    private decayTimer;
    /**
     * Get combo multiplier based on combo count and line type
     */
    private getComboMultiplier;
    /**
     * Award points for line clear (authentic TAP-style)
     */
    awardPoints(lineCount: number, combo: number, level: number, isTSpin?: boolean): void;
    /**
     * Apply decay (called every frame)
     * HeborisCE: decay happens if combo <= 1
     */
    updateDecay(combo: number, level: number, isEnding: boolean): void;
    private demoteGrade;
    /**
     * Process section evaluation result (COOL!!/REGRET)
     * COOL!! increases grade and adds bonus internal points
     * REGRET decreases grade
     */
    processSectionResult(result: 'COOL' | 'REGRET' | 'NORMAL', level: number): void;
    /**
     * Check and update GM condition flags
     * From HeborisCE: gmflag1 at 300, gmflag2 at 500, gmflag3 at 700
     */
    private checkGMFlags;
    /**
     * Check if all GM flags are set (qualifies for GM)
     */
    hasAllGMFlags(): boolean;
    /**
     * Get GM flags status
     */
    getGMFlags(): GMFlags;
    /**
     * Update current grade based on internal points and level
     */
    private updateGrade;
    /**
     * Get current requirement
     */
    private getCurrentRequirement;
    /**
     * Compare two grades (-1, 0, 1)
     */
    private compareGrades;
    /**
     * Get current grade
     */
    getGrade(): TGMGrade;
    /**
     * Get internal grade points
     */
    getInternalGrade(): number;
    /**
     * Check if grade is at least a certain level
     */
    isGradeAtLeast(grade: TGMGrade): boolean;
    /**
     * Check if qualified for M rank (credit roll)
     * Requires grade M AND all GM time gates passed
     */
    isQualifiedForM(): boolean;
    /**
     * Get grade color for display
     */
    getGradeColor(): string;
    /**
     * Reset grade system
     */
    reset(): void;
    /**
     * Set game start time (call when game starts)
     */
    setStartTime(startTime: number): void;
}
//# sourceMappingURL=grading.d.ts.map