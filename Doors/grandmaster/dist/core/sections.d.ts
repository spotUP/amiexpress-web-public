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
 * Section manager
 */
export declare class SectionManager {
    private sections;
    private currentSection;
    private startTime;
    private borderRank;
    constructor();
    /**
     * Create new section
     */
    private createSection;
    /**
     * Update section progress
     */
    update(currentLevel: number, linesCleared: number): SectionResult | null;
    /**
     * Complete current section and check for REGRET
     */
    private completeSection;
    /**
     * Get current section number
     */
    getCurrentSection(): number;
    /**
     * Get current section time (seconds)
     */
    getCurrentSectionTime(): number;
    /**
     * Get section history
     */
    getSections(): SectionData[];
    /**
     * Get total COOL count
     */
    getCoolCount(): number;
    /**
     * Get total REGRET count
     */
    getRegretCount(): number;
    /**
     * Check if all sections are COOL
     */
    isAllCool(): boolean;
    /**
     * Get average section time
     */
    getAverageSectionTime(): number;
    /**
     * Get section data by number
     */
    getSection(sectionNumber: number): SectionData | null;
    /**
     * Reset section tracking
     */
    reset(): void;
}
//# sourceMappingURL=sections.d.ts.map