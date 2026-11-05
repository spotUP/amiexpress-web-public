"use strict";
/**
 * TGM3 Medal System
 *
 * Based on HeborisCE effect.c medal system
 * Medals: AC (All Clear), ST (Section Time), SK (Skill), RE (Recover), CO (Combo)
 *
 * Each medal has 4 tiers: Bronze (0), Silver (1), Gold (2), Platinum (3)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MedalManager = exports.MEDAL_DESCRIPTIONS = exports.MEDAL_TIER_NAMES = void 0;
/**
 * Medal tier names
 */
exports.MEDAL_TIER_NAMES = {
    0: 'Bronze',
    1: 'Silver',
    2: 'Gold',
    3: 'Platinum',
};
/**
 * Medal type descriptions
 */
exports.MEDAL_DESCRIPTIONS = {
    AC: 'All Clear (Perfect Clear)',
    ST: 'Section Time (Fast completion)',
    SK: 'Skill (Tetrises and T-Spins)',
    RE: 'Recover (Surviving danger)',
    CO: 'Combo (Consecutive clears)',
};
/**
 * Thresholds for each medal type and tier
 */
const MEDAL_THRESHOLDS = {
    // AC: Number of perfect clears
    AC: { bronze: 1, silver: 2, gold: 3, platinum: 5 },
    // ST: Number of COOL sections
    ST: { bronze: 1, silver: 3, gold: 5, platinum: 7 },
    // SK: Tetris + T-Spin count
    SK: { bronze: 5, silver: 15, gold: 30, platinum: 50 },
    // RE: Recovered from row 18+ to row 10 or below
    RE: { bronze: 1, silver: 2, gold: 3, platinum: 5 },
    // CO: Maximum combo achieved
    CO: { bronze: 4, silver: 6, gold: 8, platinum: 12 },
};
/**
 * Medal manager
 */
class MedalManager {
    constructor() {
        this.medals = {
            AC: 0,
            ST: 0,
            SK: 0,
            RE: 0,
            CO: 0,
        };
        this.recentMedals = [];
        // Tracking stats
        this.perfectClears = 0;
        this.coolSections = 0;
        this.tetrisCount = 0;
        this.tSpinCount = 0;
        this.maxCombo = 0;
        this.recoveryCount = 0;
        this.wasInDanger = false;
    }
    /**
     * Check and award AC medal (Perfect Clear)
     */
    checkPerfectClear(level) {
        this.perfectClears++;
        return this.updateMedal('AC', this.perfectClears, level);
    }
    /**
     * Check and award ST medal (Section Time)
     */
    checkSectionTime(sectionResult, level) {
        if (sectionResult === 'COOL') {
            this.coolSections++;
            return this.updateMedal('ST', this.coolSections, level);
        }
        return null;
    }
    /**
     * Check and award SK medal (Skill - Tetrises and T-Spins)
     */
    checkSkill(lineCount, isTSpin, level) {
        if (lineCount === 4) {
            this.tetrisCount++;
        }
        if (isTSpin && lineCount > 0) {
            this.tSpinCount++;
        }
        const skillScore = this.tetrisCount + this.tSpinCount;
        return this.updateMedal('SK', skillScore, level);
    }
    /**
     * Check and award RE medal (Recover)
     */
    checkRecover(boardHeight, level) {
        // Track if in danger (stack at row 18 or higher, 0 = bottom)
        const inDanger = boardHeight >= 18;
        if (this.wasInDanger && !inDanger && boardHeight <= 10) {
            // Recovered from danger to safe zone
            this.recoveryCount++;
            this.wasInDanger = false;
            return this.updateMedal('RE', this.recoveryCount, level);
        }
        this.wasInDanger = inDanger;
        return null;
    }
    /**
     * Check and award CO medal (Combo)
     */
    checkCombo(combo, level) {
        if (combo > this.maxCombo) {
            this.maxCombo = combo;
            return this.updateMedal('CO', this.maxCombo, level);
        }
        return null;
    }
    /**
     * Update medal tier if threshold is met
     */
    updateMedal(type, value, level) {
        const thresholds = MEDAL_THRESHOLDS[type];
        let newTier = 0;
        if (value >= thresholds.platinum) {
            newTier = 3;
        }
        else if (value >= thresholds.gold) {
            newTier = 2;
        }
        else if (value >= thresholds.silver) {
            newTier = 1;
        }
        else if (value >= thresholds.bronze) {
            newTier = 0;
        }
        else {
            return null; // No medal yet
        }
        // Only award if tier increased
        if (newTier > this.medals[type]) {
            this.medals[type] = newTier;
            const medal = {
                type,
                tier: newTier,
                awardedAt: level,
                timestamp: Date.now(),
            };
            this.recentMedals.push(medal);
            return medal;
        }
        return null;
    }
    /**
     * Get current medal state
     */
    getMedals() {
        return { ...this.medals };
    }
    /**
     * Get recently awarded medals (for display/animation)
     */
    getRecentMedals() {
        return [...this.recentMedals];
    }
    /**
     * Clear recent medals (after displaying)
     */
    clearRecentMedals() {
        this.recentMedals = [];
    }
    /**
     * Get total medal score
     * Each tier is worth: Bronze=1, Silver=2, Gold=3, Platinum=4
     */
    getTotalScore() {
        return Object.values(this.medals).reduce((sum, tier) => sum + tier + 1, 0);
    }
    /**
     * Check if player has platinum in all categories
     */
    hasAllPlatinum() {
        return Object.values(this.medals).every(tier => tier === 3);
    }
    /**
     * Get medal color for display
     */
    static getMedalColor(tier) {
        switch (tier) {
            case 0: return 'yellow'; // Bronze
            case 1: return 'white'; // Silver
            case 2: return 'lightyellow'; // Gold
            case 3: return 'cyan'; // Platinum
            default: return 'gray';
        }
    }
    /**
     * Reset all medals
     */
    reset() {
        this.medals = { AC: 0, ST: 0, SK: 0, RE: 0, CO: 0 };
        this.recentMedals = [];
        this.perfectClears = 0;
        this.coolSections = 0;
        this.tetrisCount = 0;
        this.tSpinCount = 0;
        this.maxCombo = 0;
        this.recoveryCount = 0;
        this.wasInDanger = false;
    }
}
exports.MedalManager = MedalManager;
//# sourceMappingURL=medals.js.map