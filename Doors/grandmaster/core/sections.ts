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
 * Target times for COOL grade (in seconds)
 * Based on TGM3 Master mode targets
 */
const COOL_TARGETS: Record<number, number> = {
  0: 50,    // Section 0: 0-99
  1: 45,    // Section 1: 100-199
  2: 45,    // Section 2: 200-299
  3: 45,    // Section 3: 300-399
  4: 45,    // Section 4: 400-499
  5: 40,    // Section 5: 500-599
  6: 40,    // Section 6: 600-699
  7: 40,    // Section 7: 700-799
  8: 40,    // Section 8: 800-899
  9: 35,    // Section 9: 900-999
};

/**
 * Maximum allowed time for section (REGRET threshold)
 */
const REGRET_THRESHOLD: Record<number, number> = {
  0: 90,
  1: 80,
  2: 75,
  3: 70,
  4: 65,
  5: 60,
  6: 55,
  7: 50,
  8: 45,
  9: 40,
};

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
