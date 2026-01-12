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
 * Border time thresholds (average frames per level) from HeborisCE gamestart.c
 * Used to calculate COOL!! for each section (80-98 level check)
 */
const BORDER_TIME_FRAMES: Record<number, number> = {
  0: 17, 1: 15, 2: 14, 3: 13, 4: 10, 
  5: 10, 6: 12, 7: 13, 8: 13, 9: 13,
  10: 13, 11: 13, 12: 13, 13: 13, 14: 13,
  15: 12, 16: 12, 17: 11, 18: 11, 19: 10
};

/**
 * Section manager
 */
export class SectionManager {
  private sections: SectionData[] = [];
  private currentSection: SectionData;
  private startTime: number;
  private borderRank: number = 0; // border_rank in HeborisCE

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
    const levelInSection = currentLevel % 100;

    // HeborisCE: Quality COOL check between level 80 and 98
    if (levelInSection >= 80 && levelInSection <= 98 && this.currentSection.result === null) {
      const elapsedFrames = ((Date.now() - this.currentSection.startTime) / 1000) * 60;
      const avgFramesPerLevel = elapsedFrames / levelInSection;
      
      const targetFrames = BORDER_TIME_FRAMES[this.borderRank] || 13;
      if (avgFramesPerLevel < targetFrames) {
        this.currentSection.result = 'COOL';
        this.borderRank = Math.min(19, this.borderRank + 1);
        return 'COOL';
      }
    }

    // Check if we've moved to a new section
    if (sectionNumber > this.currentSection.section) {
      // Complete current section
      const result = this.completeSection(currentLevel);

      // Start new section
      this.currentSection = this.createSection(sectionNumber);

      return result;
    }

    // Update line count
    this.currentSection.lines += linesCleared;

    return null;
  }

  /**
   * Complete current section and check for REGRET
   */
  private completeSection(currentLevel: number): SectionResult {
    const endTime = Date.now();
    const duration = (endTime - this.currentSection.startTime) / 1000;
    const frames = duration * 60;
    const avgFramesPerLevel = frames / 100;

    this.currentSection.endTime = endTime;
    this.currentSection.duration = duration;

    // Check for REGRET
    // border_time[rank] + 6 + (tr2/40)
    const targetFrames = (BORDER_TIME_FRAMES[this.borderRank] || 13) + 6;
    
    if (avgFramesPerLevel > targetFrames && this.currentSection.result !== 'COOL') {
      this.currentSection.result = 'REGRET';
      this.borderRank = Math.max(0, this.borderRank - 1);
    } else if (this.currentSection.result === null) {
      this.currentSection.result = 'NORMAL';
    }

    this.sections.push(this.currentSection);
    return this.currentSection.result;
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
