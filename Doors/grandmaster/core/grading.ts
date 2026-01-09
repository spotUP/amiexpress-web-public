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
export const GRADE_ORDER: TGMGrade[] = [
  '9', '8', '7', '6', '5', '4', '3', '2', '1',
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9',
  'S10', 'S11', 'S12', 'S13',
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9',
  'M', 'MK', 'MV', 'MO', 'GM', 'GMM',
];

/**
 * Grade requirements table
 * Internal grade points required for each grade
 */
export const GRADE_REQUIREMENTS: GradeRequirement[] = [
  // Number grades (9-1)
  { grade: '9',  internalGradeRequired: 0,    minLevel: 0,   decayRate: 125 },
  { grade: '8',  internalGradeRequired: 100,  minLevel: 0,   decayRate: 80 },
  { grade: '7',  internalGradeRequired: 200,  minLevel: 0,   decayRate: 80 },
  { grade: '6',  internalGradeRequired: 300,  minLevel: 0,   decayRate: 50 },
  { grade: '5',  internalGradeRequired: 400,  minLevel: 0,   decayRate: 45 },
  { grade: '4',  internalGradeRequired: 500,  minLevel: 0,   decayRate: 45 },
  { grade: '3',  internalGradeRequired: 600,  minLevel: 0,   decayRate: 45 },
  { grade: '2',  internalGradeRequired: 700,  minLevel: 0,   decayRate: 40 },
  { grade: '1',  internalGradeRequired: 800,  minLevel: 0,   decayRate: 40 },

  // S grades (S1-S13)
  { grade: 'S1',  internalGradeRequired: 900,  minLevel: 0,   decayRate: 40 },
  { grade: 'S2',  internalGradeRequired: 1000, minLevel: 100, decayRate: 40 },
  { grade: 'S3',  internalGradeRequired: 1100, minLevel: 200, decayRate: 40 },
  { grade: 'S4',  internalGradeRequired: 1200, minLevel: 300, decayRate: 40 },
  { grade: 'S5',  internalGradeRequired: 1300, minLevel: 400, decayRate: 30 },
  { grade: 'S6',  internalGradeRequired: 1400, minLevel: 500, decayRate: 30 },
  { grade: 'S7',  internalGradeRequired: 1500, minLevel: 600, decayRate: 30 },
  { grade: 'S8',  internalGradeRequired: 1600, minLevel: 700, decayRate: 20 },
  { grade: 'S9',  internalGradeRequired: 1700, minLevel: 800, decayRate: 20 },
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
  { grade: 'M',  internalGradeRequired: 3100, minLevel: 2200, decayRate: 2 },
  { grade: 'MK', internalGradeRequired: 3200, minLevel: 2300, decayRate: 2 },
  { grade: 'MV', internalGradeRequired: 3300, minLevel: 2400, decayRate: 0 },
  { grade: 'MO', internalGradeRequired: 3400, minLevel: 2500, decayRate: 0 },
  { grade: 'GM', internalGradeRequired: 3500, minLevel: 2600, decayRate: 0 },
];

/**
 * TAP-style grade point table
 * Points awarded based on BOTH current internal grade AND lines cleared
 * Extracted from HeborisCE grade.c
 */
const GRADE_POINT_TABLE: number[][] = [
  // [grade index][lines cleared 1-4]
  // Grades 9-1 (indices 0-8)
  [10, 20, 40, 50],   // Grade 9
  [10, 20, 30, 40],   // Grade 8
  [10, 20, 30, 40],   // Grade 7
  [10, 15, 30, 40],   // Grade 6
  [10, 15, 20, 40],   // Grade 5
  [5,  15, 20, 30],   // Grade 4
  [5,  10, 20, 30],   // Grade 3
  [5,  10, 15, 30],   // Grade 2
  [5,  10, 15, 30],   // Grade 1
  // S grades (indices 9-21)
  [4,  10, 12, 26],   // S1
  [4,  10, 12, 26],   // S2
  [4,  10, 12, 26],   // S3
  [4,  10, 12, 26],   // S4
  [3,   8, 10, 22],   // S5
  [3,   8, 10, 22],   // S6
  [3,   8, 10, 22],   // S7
  [3,   8, 10, 22],   // S8
  [2,   6,  8, 18],   // S9
  [2,   6,  8, 18],   // S10
  [2,   6,  8, 18],   // S11
  [2,   6,  8, 18],   // S12
  [2,   6,  8, 18],   // S13
  // Master grades (indices 22-30)
  [2,   5,  6, 16],   // m1
  [2,   5,  6, 16],   // m2
  [2,   5,  6, 16],   // m3
  [2,   5,  6, 16],   // m4
  [2,   5,  6, 16],   // m5
  [2,   5,  6, 16],   // m6
  [2,   5,  6, 16],   // m7
  [2,   5,  6, 16],   // m8
  [2,   5,  6, 16],   // m9
  // Grand Master grades (indices 31-35)
  [1,   4,  5, 12],   // M
  [1,   4,  5, 12],   // MK
  [1,   4,  5, 12],   // MV
  [1,   4,  5, 12],   // MO
  [1,   4,  5, 12],   // GM
];

/**
 * Combo multipliers for singles/doubles (from HeborisCE)
 * Index = combo count - 1
 */
const COMBO_MULTIPLIERS_NORMAL: number[] = [
  1.0,  // Combo 1 (no combo)
  1.2,  // Combo 2
  1.4,  // Combo 3
  1.6,  // Combo 4
  1.8,  // Combo 5
  2.0,  // Combo 6
  2.2,  // Combo 7
  2.4,  // Combo 8
  2.6,  // Combo 9
  2.8,  // Combo 10
  3.0,  // Combo 11+
];

/**
 * Combo multipliers for triples/tetrises (from HeborisCE)
 */
const COMBO_MULTIPLIERS_TRIPLE: number[] = [
  1.0,  // Combo 1
  1.4,  // Combo 2
  1.5,  // Combo 3
  1.6,  // Combo 4
  1.7,  // Combo 5
  1.8,  // Combo 6
  1.9,  // Combo 7
  2.0,  // Combo 8
  2.1,  // Combo 9
  2.2,  // Combo 10+
];

/**
 * GM condition flags - time gates at specific levels
 * Based on HeborisCE gamestart.c gmflag system
 */
interface GMFlags {
  flag1: boolean;  // Level 300 gate - must reach in under 4:15
  flag2: boolean;  // Level 500 gate - must reach in under 7:30
  flag3: boolean;  // Level 700 gate - must reach in under 11:30
}

/**
 * Grade manager
 */
export class GradeManager {
  private internalGrade: number = 0;
  private currentGrade: TGMGrade = '9';
  private gradeIndex: number = 0;  // Index into GRADE_POINT_TABLE
  private gameStartTime: number = 0;
  private gmFlags: GMFlags = { flag1: false, flag2: false, flag3: false };
  private level300Time: number | null = null;
  private level500Time: number | null = null;
  private level700Time: number | null = null;

  /**
   * Get combo multiplier based on combo count and line type
   */
  private getComboMultiplier(combo: number, lineCount: number): number {
    const multipliers = lineCount >= 3 ? COMBO_MULTIPLIERS_TRIPLE : COMBO_MULTIPLIERS_NORMAL;
    const index = Math.min(combo - 1, multipliers.length - 1);
    return multipliers[Math.max(0, index)];
  }

  /**
   * Award points for line clear (authentic TAP-style)
   */
  awardPoints(
    lineCount: number,
    combo: number,
    level: number,
    isTSpin: boolean = false
  ): void {
    if (lineCount === 0) return;

    // Get base points from grade point table
    const gradeRow = GRADE_POINT_TABLE[Math.min(this.gradeIndex, GRADE_POINT_TABLE.length - 1)];
    let points = gradeRow[Math.min(lineCount - 1, 3)];

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
   * Check and update GM condition flags
   * From HeborisCE: gmflag1 at 300, gmflag2 at 500, gmflag3 at 700
   */
  private checkGMFlags(level: number): void {
    const elapsed = (Date.now() - this.gameStartTime) / 1000;  // seconds

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
  hasAllGMFlags(): boolean {
    return this.gmFlags.flag1 && this.gmFlags.flag2 && this.gmFlags.flag3;
  }

  /**
   * Get GM flags status
   */
  getGMFlags(): GMFlags {
    return { ...this.gmFlags };
  }

  /**
   * Apply decay (called after each piece)
   */
  applyDecay(level: number): void {
    const requirement = this.getCurrentRequirement();
    if (requirement && requirement.decayRate > 0) {
      this.internalGrade -= requirement.decayRate;
      if (this.internalGrade < 0) {
        this.internalGrade = 0;
      }
    }

    // Check if grade should decrease
    this.updateGrade(level);
  }

  /**
   * Update current grade based on internal points and level
   */
  private updateGrade(level: number): void {
    // Find the highest grade we qualify for
    for (let i = GRADE_REQUIREMENTS.length - 1; i >= 0; i--) {
      const req = GRADE_REQUIREMENTS[i];

      if (
        this.internalGrade >= req.internalGradeRequired &&
        level >= req.minLevel
      ) {
        const newGrade = req.grade;
        if (this.compareGrades(newGrade, this.currentGrade) > 0) {
          this.currentGrade = newGrade;
          // Update grade index for point table lookup
          this.gradeIndex = GRADE_ORDER.indexOf(newGrade);
        }
        return;
      }
    }
  }

  /**
   * Get current requirement
   */
  private getCurrentRequirement(): GradeRequirement | null {
    return GRADE_REQUIREMENTS.find(r => r.grade === this.currentGrade) || null;
  }

  /**
   * Compare two grades (-1, 0, 1)
   */
  private compareGrades(a: TGMGrade, b: TGMGrade): number {
    const indexA = GRADE_ORDER.indexOf(a);
    const indexB = GRADE_ORDER.indexOf(b);
    return indexA - indexB;
  }

  /**
   * Get current grade
   */
  getGrade(): TGMGrade {
    return this.currentGrade;
  }

  /**
   * Get internal grade points
   */
  getInternalGrade(): number {
    return this.internalGrade;
  }

  /**
   * Check if grade is at least a certain level
   */
  isGradeAtLeast(grade: TGMGrade): boolean {
    return this.compareGrades(this.currentGrade, grade) >= 0;
  }

  /**
   * Check if qualified for M rank (credit roll)
   * Requires grade M AND all GM time gates passed
   */
  isQualifiedForM(): boolean {
    return this.isGradeAtLeast('M') && this.hasAllGMFlags();
  }

  /**
   * Get grade color for display
   */
  getGradeColor(): string {
    if (this.currentGrade === 'GMM') return 'rainbow';  // Grand Master Maru
    if (this.currentGrade === 'GM') return 'rainbow';
    if (this.currentGrade === 'MO') return 'orange';
    if (this.currentGrade === 'MV' || this.currentGrade === 'MK') return 'red';
    if (this.currentGrade === 'M') return 'yellow';
    if (this.currentGrade.startsWith('m')) return 'magenta';
    if (this.currentGrade.startsWith('S')) return 'cyan';
    return 'white';
  }

  /**
   * Reset grade system
   */
  reset(): void {
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
  setStartTime(startTime: number): void {
    this.gameStartTime = startTime;
  }
}
