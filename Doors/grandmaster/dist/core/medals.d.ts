/**
 * TGM3 Medal System
 *
 * Based on HeborisCE effect.c medal system
 * Medals: AC (All Clear), ST (Section Time), SK (Skill), RE (Recover), CO (Combo)
 *
 * Each medal has 4 tiers: Bronze (0), Silver (1), Gold (2), Platinum (3)
 */
export type MedalType = 'AC' | 'ST' | 'SK' | 'RE' | 'CO';
export type MedalTier = 0 | 1 | 2 | 3;
export interface Medal {
    type: MedalType;
    tier: MedalTier;
    awardedAt: number;
    timestamp: number;
}
export interface MedalState {
    AC: MedalTier;
    ST: MedalTier;
    SK: MedalTier;
    RE: MedalTier;
    CO: MedalTier;
}
/**
 * Medal tier names
 */
export declare const MEDAL_TIER_NAMES: Record<MedalTier, string>;
/**
 * Medal type descriptions
 */
export declare const MEDAL_DESCRIPTIONS: Record<MedalType, string>;
/**
 * Medal manager
 */
export declare class MedalManager {
    private medals;
    private recentMedals;
    private perfectClears;
    private coolSections;
    private tetrisCount;
    private tSpinCount;
    private maxCombo;
    private recoveryCount;
    private wasInDanger;
    /**
     * Check and award AC medal (Perfect Clear)
     */
    checkPerfectClear(level: number): Medal | null;
    /**
     * Check and award ST medal (Section Time)
     */
    checkSectionTime(sectionResult: 'COOL' | 'REGRET' | 'NORMAL', level: number): Medal | null;
    /**
     * Check and award SK medal (Skill - Tetrises and T-Spins)
     */
    checkSkill(lineCount: number, isTSpin: boolean, level: number): Medal | null;
    /**
     * Check and award RE medal (Recover)
     */
    checkRecover(boardHeight: number, level: number): Medal | null;
    /**
     * Check and award CO medal (Combo)
     */
    checkCombo(combo: number, level: number): Medal | null;
    /**
     * Update medal tier if threshold is met
     */
    private updateMedal;
    /**
     * Get current medal state
     */
    getMedals(): MedalState;
    /**
     * Get recently awarded medals (for display/animation)
     */
    getRecentMedals(): Medal[];
    /**
     * Clear recent medals (after displaying)
     */
    clearRecentMedals(): void;
    /**
     * Get total medal score
     * Each tier is worth: Bronze=1, Silver=2, Gold=3, Platinum=4
     */
    getTotalScore(): number;
    /**
     * Check if player has platinum in all categories
     */
    hasAllPlatinum(): boolean;
    /**
     * Get medal color for display
     */
    static getMedalColor(tier: MedalTier): string;
    /**
     * Reset all medals
     */
    reset(): void;
}
//# sourceMappingURL=medals.d.ts.map