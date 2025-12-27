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
 * Points awarded for line clears
 */
const LINE_CLEAR_POINTS: Record<number, number> = {
  0: 0,      // No lines
  1: 10,     // Single
  2: 25,     // Double
  3: 40,     // Triple
  4: 100,    // Tetris
};

/**
 * Grade manager
 */
export class GradeManager {
  private internalGrade: number = 0;
  private currentGrade: TGMGrade = '9';

  /**
   * Award points for line clear
   */
  awardPoints(
    lineCount: number,
    combo: number,
    level: number,
    isTSpin: boolean = false
  ): void {
    let points = LINE_CLEAR_POINTS[lineCount] || 0;

    // Combo bonus
    if (combo > 1) {
      points += (combo - 1) * 10;
    }

    // T-Spin bonus
    if (isTSpin && lineCount > 0) {
      points += 100;
    }

    // Tetris bonus
    if (lineCount === 4) {
      points += 50;
    }

    // Level multiplier (higher levels = more points)
    const levelMultiplier = 1 + Math.floor(level / 250) * 0.5;
    points = Math.floor(points * levelMultiplier);

    // Add to internal grade
    this.internalGrade += points;

    // Check for grade up
    this.updateGrade(level);
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
   */
  isQualifiedForM(): boolean {
    return this.isGradeAtLeast('M');
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
  }
}
