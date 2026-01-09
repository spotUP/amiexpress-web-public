/**
 * TGM3 Section System
 *
 * Tracks section timing and awards COOL/REGRET grades
 * Sections are 100 levels each (0-99, 100-199, etc.)
 */

/**
 * Section time result
 */
export type SectionResult = 'COOL' | 'REGRET' | 'NORMAL';

/**
 * Section data
 */
export interface SectionData {
  section: number;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  result: SectionResult | null;
  lines: number;
}

/**
 * Border time thresholds (frames per level) from HeborisCE gamestart.c
 * Used to calculate COOL/REGRET for each section
 *
 * HeborisCE border_time[20] array:
 * 17, 15, 14, 13, 10, 10, 12, 13, 13, 13, 13, 13, 13, 13, 13, 12, 12, 11, 11, 10
 *
 * Converting to section targets: frames_per_level * 100 levels / 60 fps = seconds
 */
const BORDER_TIME_FRAMES: Record<number, number> = {
  0: 17,   // Section 0: 0-99
  1: 15,   // Section 1: 100-199
  2: 14,   // Section 2: 200-299
  3: 13,   // Section 3: 300-399
  4: 10,   // Section 4: 400-499
  5: 10,   // Section 5: 500-599
  6: 12,   // Section 6: 600-699
  7: 13,   // Section 7: 700-799
  8: 13,   // Section 8: 800-899
  9: 13,   // Section 9: 900-999
};

/**
 * Target times for COOL grade (in seconds)
 * Calculated from HeborisCE border_time: frames_per_level * 100 / 60
 * With slight adjustment for realistic gameplay
 */
const COOL_TARGETS: Record<number, number> = {
  0: 52,    // Section 0: 0-99 (17 * 100 / 60 * 1.8 ≈ 52)
  1: 48,    // Section 1: 100-199
  2: 46,    // Section 2: 200-299
  3: 44,    // Section 3: 300-399
  4: 36,    // Section 4: 400-499 (speed ramps up here)
  5: 36,    // Section 5: 500-599
  6: 40,    // Section 6: 600-699
  7: 44,    // Section 7: 700-799
  8: 44,    // Section 8: 800-899
  9: 44,    // Section 9: 900-999
};

/**
 * Maximum allowed time for section (REGRET threshold)
 * Approximately 2.5x the COOL target
 */
const REGRET_THRESHOLD: Record<number, number> = {
  0: 90,
  1: 85,
  2: 80,
  3: 75,
  4: 65,
  5: 65,
  6: 70,
  7: 75,
  8: 75,
  9: 75,
};

/**
 * Get border time threshold (frames per level) for a section
 */
export function getBorderTimeFrames(section: number): number {
  return BORDER_TIME_FRAMES[section] || 13;  // Default to 13 frames/level
}

/**
 * Section manager
 */
export class SectionManager {
  private sections: SectionData[] = [];
  private currentSection: SectionData;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    this.currentSection = this.createSection(0);
  }

  /**
   * Create new section
   */
  private createSection(sectionNumber: number): SectionData {
    return {
      section: sectionNumber,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      result: null,
      lines: 0,
    };
  }

  /**
   * Update section progress
   */
  update(currentLevel: number, linesCleared: number): SectionResult | null {
    const sectionNumber = Math.floor(currentLevel / 100);

    // Check if we've moved to a new section
    if (sectionNumber > this.currentSection.section) {
      // Complete current section
      const result = this.completeSection();

      // Start new section
      this.currentSection = this.createSection(sectionNumber);

      return result;
    }

    // Update line count
    this.currentSection.lines += linesCleared;

    return null;
  }

  /**
   * Complete current section
   */
  private completeSection(): SectionResult {
    const endTime = Date.now();
    const duration = (endTime - this.currentSection.startTime) / 1000; // Convert to seconds

    this.currentSection.endTime = endTime;
    this.currentSection.duration = duration;

    // Determine result
    const result = this.evaluateSection(this.currentSection.section, duration);
    this.currentSection.result = result;

    // Add to history
    this.sections.push(this.currentSection);

    return result;
  }

  /**
   * Evaluate section performance
   */
  private evaluateSection(sectionNumber: number, duration: number): SectionResult {
    const coolTarget = COOL_TARGETS[sectionNumber];
    const regretThreshold = REGRET_THRESHOLD[sectionNumber];

    if (coolTarget && duration <= coolTarget) {
      return 'COOL';
    }

    if (regretThreshold && duration >= regretThreshold) {
      return 'REGRET';
    }

    return 'NORMAL';
  }

  /**
   * Get current section number
   */
  getCurrentSection(): number {
    return this.currentSection.section;
  }

  /**
   * Get current section time (seconds)
   */
  getCurrentSectionTime(): number {
    return (Date.now() - this.currentSection.startTime) / 1000;
  }

  /**
   * Get target time for current section
   */
  getTargetTime(): number | null {
    return COOL_TARGETS[this.currentSection.section] || null;
  }

  /**
   * Get section history
   */
  getSections(): SectionData[] {
    return [...this.sections];
  }

  /**
   * Get total COOL count
   */
  getCoolCount(): number {
    return this.sections.filter(s => s.result === 'COOL').length;
  }

  /**
   * Get total REGRET count
   */
  getRegretCount(): number {
    return this.sections.filter(s => s.result === 'REGRET').length;
  }

  /**
   * Check if all sections are COOL
   */
  isAllCool(): boolean {
    if (this.sections.length === 0) return false;
    return this.sections.every(s => s.result === 'COOL');
  }

  /**
   * Get average section time
   */
  getAverageSectionTime(): number {
    if (this.sections.length === 0) return 0;
    const total = this.sections.reduce((sum, s) => sum + (s.duration || 0), 0);
    return total / this.sections.length;
  }

  /**
   * Get section data by number
   */
  getSection(sectionNumber: number): SectionData | null {
    return this.sections.find(s => s.section === sectionNumber) || null;
  }

  /**
   * Reset section tracking
   */
  reset(): void {
    this.sections = [];
    this.startTime = Date.now();
    this.currentSection = this.createSection(0);
  }
}
