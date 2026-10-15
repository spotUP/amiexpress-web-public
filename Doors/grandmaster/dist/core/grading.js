"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradeManager = exports.GRADE_REQUIREMENTS = exports.GRADE_ORDER = void 0;
/**
 * Grade progression order
 */
exports.GRADE_ORDER = [
    '9', '8', '7', '6', '5', '4', '3', '2', '1',
    'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9',
    'S10', 'S11', 'S12', 'S13',
    'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9',
    'M', 'MK', 'MV', 'MO', 'GM', 'GMM',
];
/**
 * Combo multipliers for singles/doubles (from HeborisCE)
 * Index = combo count - 1
 */
const COMBO_MULTIPLIERS_NORMAL = [
    1.0, // Combo 1 (no combo)
    1.2, // Combo 2
    1.4, // Combo 3
    1.6, // Combo 4
    1.8, // Combo 5
    2.0, // Combo 6
    2.2, // Combo 7
    2.4, // Combo 8
    2.6, // Combo 9
    2.8, // Combo 10
    3.0, // Combo 11+
];
/**
 * Combo multipliers for triples/tetrises (from HeborisCE)
 */
const COMBO_MULTIPLIERS_TRIPLE = [
    1.0, // Combo 1
    1.4, // Combo 2
    1.5, // Combo 3
    1.6, // Combo 4
    1.7, // Combo 5
    1.8, // Combo 6
    1.9, // Combo 7
    2.0, // Combo 8
    2.1, // Combo 9
    2.2, // Combo 10+
];
/**
 * Grade requirements table
 * Internal grade points required for each grade
 */
exports.GRADE_REQUIREMENTS = [
    // Number grades (9-1)
    { grade: '9', internalGradeRequired: 0, minLevel: 0, decayRate: 125 },
    { grade: '8', internalGradeRequired: 100, minLevel: 0, decayRate: 80 },
    { grade: '7', internalGradeRequired: 200, minLevel: 0, decayRate: 80 },
    { grade: '6', internalGradeRequired: 300, minLevel: 0, decayRate: 50 },
    { grade: '5', internalGradeRequired: 400, minLevel: 0, decayRate: 45 },
    { grade: '4', internalGradeRequired: 500, minLevel: 0, decayRate: 45 },
    { grade: '3', internalGradeRequired: 600, minLevel: 0, decayRate: 45 },
    { grade: '2', internalGradeRequired: 700, minLevel: 0, decayRate: 40 },
    { grade: '1', internalGradeRequired: 800, minLevel: 0, decayRate: 40 },
    // S grades (S1-S13)
    { grade: 'S1', internalGradeRequired: 900, minLevel: 0, decayRate: 40 },
    { grade: 'S2', internalGradeRequired: 1000, minLevel: 100, decayRate: 40 },
    { grade: 'S3', internalGradeRequired: 1100, minLevel: 200, decayRate: 40 },
    { grade: 'S4', internalGradeRequired: 1200, minLevel: 300, decayRate: 40 },
    { grade: 'S5', internalGradeRequired: 1300, minLevel: 400, decayRate: 30 },
    { grade: 'S6', internalGradeRequired: 1400, minLevel: 500, decayRate: 30 },
    { grade: 'S7', internalGradeRequired: 1500, minLevel: 600, decayRate: 30 },
    { grade: 'S8', internalGradeRequired: 1600, minLevel: 700, decayRate: 20 },
    { grade: 'S9', internalGradeRequired: 1700, minLevel: 800, decayRate: 20 },
    { grade: 'S10', internalGradeRequired: 1800, minLevel: 900, decayRate: 15 },
    { grade: 'S11', internalGradeRequired: 1900, minLevel: 1000, decayRate: 15 },
    { grade: 'S12', internalGradeRequired: 2000, minLevel: 1100, decayRate: 15 },
    { grade: 'S13', internalGradeRequired: 2100, minLevel: 1200, decayRate: 10 },
    // Master grades (m1-m9)
    { grade: 'm1', internalGradeRequired: 2200, minLevel: 1300, decayRate: 10 },
    { grade: 'm2', internalGradeRequired: 2300, minLevel: 1400, decayRate: 10 },
    { grade: 'm3', internalGradeRequired: 2400, minLevel: 1500, decayRate: 10 },
    { grade: 'm4', internalGradeRequired: 2500, minLevel: 1600, decayRate: 10 },
    { grade: 'm5', internalGradeRequired: 2600, minLevel: 1700, decayRate: 5 },
    { grade: 'm6', internalGradeRequired: 2700, minLevel: 1800, decayRate: 5 },
    { grade: 'm7', internalGradeRequired: 2800, minLevel: 1900, decayRate: 5 },
    { grade: 'm8', internalGradeRequired: 2900, minLevel: 2000, decayRate: 5 },
    { grade: 'm9', internalGradeRequired: 3000, minLevel: 2100, decayRate: 5 },
    // Grand Master grades
    { grade: 'M', internalGradeRequired: 3100, minLevel: 2200, decayRate: 2 },
    { grade: 'MK', internalGradeRequired: 3200, minLevel: 2300, decayRate: 2 },
    { grade: 'MV', internalGradeRequired: 3300, minLevel: 2400, decayRate: 0 },
    { grade: 'MO', internalGradeRequired: 3400, minLevel: 2500, decayRate: 0 },
    { grade: 'GM', internalGradeRequired: 3500, minLevel: 2600, decayRate: 0 },
];
/**
 * TAP-style grade point table
 * Points awarded based on BOTH current internal grade AND lines cleared
 * 1:1 with HeborisCE grade.c GradeUp2
 */
const GRADE_POINT_TABLE = [
    // [grade index][lines cleared 1-4]
    [10, 15, 30, 55], // Grade 9
    [10, 20, 30, 40], // Grade 8
    [10, 20, 30, 40], // Grade 7
    [10, 15, 25, 35], // Grade 6
    [10, 15, 25, 35], // Grade 5
    [10, 15, 25, 35], // Grade 4
    [5, 15, 23, 33], // Grade 3
    [5, 15, 23, 33], // Grade 2
    [5, 15, 23, 33], // Grade 1
    [3, 12, 15, 30], // S1
    [3, 12, 15, 30], // S2
    [3, 12, 15, 30], // S3
    [3, 12, 15, 30], // S4
    [3, 15, 20, 30], // S5
    [3, 15, 20, 30], // S6
    [3, 15, 20, 30], // S7
    [4, 18, 23, 30], // S8
    [4, 18, 23, 30], // S9
    [4, 18, 23, 30], // S10
    [4, 18, 23, 30], // S11
    [4, 18, 23, 30], // S12
    [4, 18, 23, 30], // S13
    [4, 18, 23, 30], // m1
    [4, 18, 23, 30], // m2
    [4, 18, 23, 30], // m3
    [4, 18, 23, 30], // m4
    [4, 18, 23, 30], // m5
    [4, 18, 23, 30], // m6
    [4, 18, 23, 30], // m7
    [4, 18, 23, 30], // m8
    [4, 18, 23, 30], // m9
    [2, 12, 15, 20], // M
    [2, 12, 15, 20], // MK
    [2, 12, 15, 20], // MV
    [2, 12, 15, 20], // MO
    [2, 12, 15, 20], // GM
];
/**
 * Grade decay frames (glimit in HeborisCE)
 * Points decrease by 1 after this many frames of non-combo play
 */
const DECAY_LIMITS = [
    100, 80, 80, 60, 50, 50, 40, 40, 40,
    30, 30, 25, 25, 20, 20, 20, 15, 15,
    10, 8, 5, 5, 5, 5, 5, 5, 4,
    5, 5, 4, 3, 2, 1
];
/**
 * Grade manager
 */
class GradeManager {
    constructor() {
        this.internalGrade = 0;
        this.currentGrade = '9';
        this.gradeIndex = 0; // Index into GRADE_POINT_TABLE
        this.gameStartTime = 0;
        this.gmFlags = { flag1: false, flag2: false, flag3: false };
        this.level300Time = null;
        this.level500Time = null;
        this.level700Time = null;
        this.coolCount = 0;
        this.regretCount = 0;
        this.decayTimer = 0; // gtime in HeborisCE
    }
    /**
     * Get combo multiplier based on combo count and line type
     */
    getComboMultiplier(combo, lineCount) {
        const multipliers = lineCount >= 3 ? COMBO_MULTIPLIERS_TRIPLE : COMBO_MULTIPLIERS_NORMAL;
        const index = Math.min(combo - 1, multipliers.length - 1);
        return multipliers[Math.max(0, index)];
    }
    /**
     * Award points for line clear (authentic TAP-style)
     */
    awardPoints(lineCount, combo, level, isTSpin = false) {
        if (lineCount === 0)
            return;
        // Get base points from grade point table
        const gradeRow = GRADE_POINT_TABLE[Math.min(this.gradeIndex, GRADE_POINT_TABLE.length - 1)];
        let points = gradeRow[Math.min(lineCount - 1, 3)];
        // HeborisCE: points = (points * gbai) / 2
        // gbai = ((tc / 250) + 1) + (skillbai + 1)
        const levelMultiplier = Math.floor(level / 250) + 1;
        const gbai = levelMultiplier + 2; // Default multiplier for simplicity
        points = Math.floor((points * gbai) / 2);
        // Apply combo multiplier
        const comboMultiplier = this.getComboMultiplier(combo, lineCount);
        points = Math.floor(points * comboMultiplier);
        // T-Spin bonus (authentic TGM3 style - bonus only, doesn't use different table)
        if (isTSpin) {
            // T-Spin adds extra points based on lines cleared
            const tSpinBonus = lineCount === 1 ? 20 : lineCount === 2 ? 40 : lineCount === 3 ? 60 : 0;
            points += tSpinBonus;
        }
        // Add to internal grade
        this.internalGrade += points;
        // Check for grade up
        this.updateGrade(level);
        // Update GM flags based on level and time
        this.checkGMFlags(level);
    }
    /**
     * Apply decay (called every frame)
     * HeborisCE: decay happens if combo <= 1
     */
    updateDecay(combo, level, isEnding) {
        if (combo > 1 || isEnding) {
            this.decayTimer = 0;
            return;
        }
        this.decayTimer++;
        const limit = DECAY_LIMITS[this.gradeIndex] || 100;
        if (this.decayTimer >= limit) {
            this.decayTimer = 0;
            if (this.internalGrade > 0 || this.gradeIndex > 0) {
                this.internalGrade--;
                // TGM3: Grade demotion on excessive negative points
                if (this.internalGrade < -50 && this.gradeIndex > 0) {
                    this.internalGrade = 0;
                    this.demoteGrade();
                }
            }
        }
        // Check if grade should decrease
        this.updateGrade(level);
    }
    demoteGrade() {
        const currentIndex = exports.GRADE_ORDER.indexOf(this.currentGrade);
        if (currentIndex > 0) {
            this.currentGrade = exports.GRADE_ORDER[currentIndex - 1];
            this.gradeIndex = exports.GRADE_ORDER.indexOf(this.currentGrade);
        }
    }
    /**
     * Process section evaluation result (COOL!!/REGRET)
     * COOL!! increases grade and adds bonus internal points
     * REGRET decreases grade
     */
    processSectionResult(result, level) {
        if (result === 'COOL') {
            this.coolCount++;
            // Advance to next grade immediately (Grade Skip)
            const currentIndex = exports.GRADE_ORDER.indexOf(this.currentGrade);
            if (currentIndex < exports.GRADE_ORDER.indexOf('m9')) {
                this.currentGrade = exports.GRADE_ORDER[currentIndex + 1];
                this.gradeIndex = exports.GRADE_ORDER.indexOf(this.currentGrade);
                // Boost internal points to the start of the new grade
                const req = exports.GRADE_REQUIREMENTS.find(r => r.grade === this.currentGrade);
                if (req) {
                    this.internalGrade = Math.max(this.internalGrade, req.internalGradeRequired);
                }
            }
        }
        else if (result === 'REGRET') {
            this.regretCount++;
            this.demoteGrade();
            // Reset internal points to the start of the demoted grade
            const req = exports.GRADE_REQUIREMENTS.find(r => r.grade === this.currentGrade);
            if (req) {
                this.internalGrade = req.internalGradeRequired;
            }
        }
    }
    /**
     * Check and update GM condition flags
     * From HeborisCE: gmflag1 at 300, gmflag2 at 500, gmflag3 at 700
     */
    checkGMFlags(level) {
        const elapsed = (Date.now() - this.gameStartTime) / 1000; // seconds
        // Level 300 gate: must reach in under 4:15 (255 seconds)
        if (level >= 300 && this.level300Time === null) {
            this.level300Time = elapsed;
            this.gmFlags.flag1 = elapsed <= 255;
        }
        // Level 500 gate: must reach in under 7:30 (450 seconds)
        if (level >= 500 && this.level500Time === null) {
            this.level500Time = elapsed;
            this.gmFlags.flag2 = elapsed <= 450;
        }
        // Level 700 gate: must reach in under 11:30 (690 seconds)
        if (level >= 700 && this.level700Time === null) {
            this.level700Time = elapsed;
            this.gmFlags.flag3 = elapsed <= 690;
        }
    }
    /**
     * Check if all GM flags are set (qualifies for GM)
     */
    hasAllGMFlags() {
        return this.gmFlags.flag1 && this.gmFlags.flag2 && this.gmFlags.flag3;
    }
    /**
     * Get GM flags status
     */
    getGMFlags() {
        return { ...this.gmFlags };
    }
    /**
     * Update current grade based on internal points and level
     */
    updateGrade(level) {
        // Find the highest grade we qualify for
        for (let i = exports.GRADE_REQUIREMENTS.length - 1; i >= 0; i--) {
            const req = exports.GRADE_REQUIREMENTS[i];
            if (this.internalGrade >= req.internalGradeRequired &&
                level >= req.minLevel) {
                const newGrade = req.grade;
                if (this.compareGrades(newGrade, this.currentGrade) > 0) {
                    this.currentGrade = newGrade;
                    // Update grade index for point table lookup
                    this.gradeIndex = exports.GRADE_ORDER.indexOf(newGrade);
                }
                return;
            }
        }
    }
    /**
     * Get current requirement
     */
    getCurrentRequirement() {
        return exports.GRADE_REQUIREMENTS.find(r => r.grade === this.currentGrade) || null;
    }
    /**
     * Compare two grades (-1, 0, 1)
     */
    compareGrades(a, b) {
        const indexA = exports.GRADE_ORDER.indexOf(a);
        const indexB = exports.GRADE_ORDER.indexOf(b);
        return indexA - indexB;
    }
    /**
     * Get current grade
     */
    getGrade() {
        return this.currentGrade;
    }
    /**
     * Get internal grade points
     */
    getInternalGrade() {
        return this.internalGrade;
    }
    /**
     * Check if grade is at least a certain level
     */
    isGradeAtLeast(grade) {
        return this.compareGrades(this.currentGrade, grade) >= 0;
    }
    /**
     * Check if qualified for M rank (credit roll)
     * Requires grade M AND all GM time gates passed
     */
    isQualifiedForM() {
        return this.isGradeAtLeast('M') && this.hasAllGMFlags();
    }
    /**
     * Get grade color for display
     */
    getGradeColor() {
        if (this.currentGrade === 'GMM')
            return 'rainbow'; // Grand Master Maru
        if (this.currentGrade === 'GM')
            return 'rainbow';
        if (this.currentGrade === 'MO')
            return 'orange';
        if (this.currentGrade === 'MV' || this.currentGrade === 'MK')
            return 'red';
        if (this.currentGrade === 'M')
            return 'yellow';
        if (this.currentGrade.startsWith('m'))
            return 'magenta';
        if (this.currentGrade.startsWith('S'))
            return 'cyan';
        return 'white';
    }
    /**
     * Reset grade system
     */
    reset() {
        this.internalGrade = 0;
        this.currentGrade = '9';
        this.gradeIndex = 0;
        this.gameStartTime = Date.now();
        this.gmFlags = { flag1: false, flag2: false, flag3: false };
        this.level300Time = null;
        this.level500Time = null;
        this.level700Time = null;
    }
    /**
     * Set game start time (call when game starts)
     */
    setStartTime(startTime) {
        this.gameStartTime = startTime;
    }
}
exports.GradeManager = GradeManager;
//# sourceMappingURL=grading.js.map