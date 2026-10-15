/**
 * Game Animations
 *
 * Grade-up, COOL/REGRET, line clear flash, lock glow, etc.
 */
/**
 * Animation types
 */
export type AnimationType = 'gradeUp' | 'cool' | 'regret' | 'lineClearFlash' | 'lockGlow' | 'perfectClear' | 'comboCounter' | 'tSpin' | 'floatingText' | 'placementEffect' | 'backToBackGlow';
/**
 * Floating text mode configuration
 */
export type FloatTextMode = 'off' | 'offboard' | 'all';
/**
 * Animation state
 */
export interface Animation {
    type: AnimationType;
    elapsed: number;
    duration: number;
    data?: any;
}
/**
 * Grade-up animation data
 */
export interface GradeUpData {
    oldGrade: string;
    newGrade: string;
    x: number;
    y: number;
}
/**
 * Section result animation data
 */
export interface SectionResultData {
    result: 'COOL' | 'REGRET';
    section: number;
}
/**
 * Line clear flash data
 */
export interface LineClearFlashData {
    lines: number[];
    intensity: number;
}
/**
 * Lock glow data
 */
export interface LockGlowData {
    cells: Array<{
        x: number;
        y: number;
    }>;
    color: string;
}
/**
 * Floating text animation data
 */
export interface FloatingTextData {
    text: string[];
    x: number;
    y: number;
    originY: number;
    timer: number;
    maxTimer: number;
    color: string;
    size: 'small' | 'normal' | 'large';
    mode: 'offboard' | 'all';
}
/**
 * Piece placement effect data
 */
export interface PlacementEffectData {
    piece: string;
    cells: Array<{
        x: number;
        y: number;
    }>;
    rotation: 0 | 1 | 2 | 3;
    frame: number;
    color: string;
}
/**
 * Back-to-back glow data
 */
export interface BackToBackGlowData {
    cells: Array<{
        x: number;
        y: number;
    }>;
    count: number;
    type: 'tetris' | 'tspin';
}
/**
 * Animation manager
 */
export declare class AnimationManager {
    private animations;
    private placementEffects;
    private floatingTexts;
    private readonly MAX_PLACEMENT_EFFECTS;
    private readonly MAX_FLOATING_TEXTS;
    /**
     * Trigger grade-up animation
     */
    gradeUp(oldGrade: string, newGrade: string, x: number, y: number): void;
    /**
     * Trigger COOL animation
     */
    cool(section: number): void;
    /**
     * Trigger REGRET animation
     */
    regret(section: number): void;
    /**
     * Trigger line clear flash
     */
    lineClearFlash(lines: number[], intensity: number): void;
    /**
     * Trigger lock glow
     */
    lockGlow(cells: Array<{
        x: number;
        y: number;
    }>, color: string): void;
    /**
     * Trigger combo counter animation for milestone achievements
     */
    comboCounter(combo: number, milestone: number): void;
    /**
     * Trigger perfect clear animation
     */
    perfectClear(): void;
    /**
     * Trigger T-Spin animation
     */
    tSpin(x: number, y: number): void;
    /**
     * Trigger piece placement effect
     */
    placementEffect(piece: string, cells: Array<{
        x: number;
        y: number;
    }>, rotation: number, color: string): void;
    /**
     * Trigger floating text animation
     */
    floatingText(text: string | string[], x: number, y: number, color: string, mode: FloatTextMode): void;
    /**
     * Trigger back-to-back glow animation
     */
    backToBackGlow(cells: Array<{
        x: number;
        y: number;
    }>, count: number, type: 'tetris' | 'tspin'): void;
    /**
     * Update all animations
     */
    update(deltaTime: number): void;
    /**
     * Ease-out cubic function for floating text rise
     */
    private easeOutCubic;
    /**
     * Ease-in cubic function for floating text fall
     */
    private easeInCubic;
    /**
     * Get all active animations
     */
    getAnimations(): Animation[];
    /**
     * Get animations of specific type
     */
    getAnimationsByType(type: AnimationType): Animation[];
    /**
     * Check if animation type is active
     */
    hasAnimation(type: AnimationType): boolean;
    /**
     * Get all active placement effects
     */
    getPlacementEffects(): PlacementEffectData[];
    /**
     * Get all active floating texts
     */
    getFloatingTexts(): FloatingTextData[];
    /**
     * Clear all animations
     */
    clear(): void;
    /**
     * Clear animations of specific type
     */
    clearType(type: AnimationType): void;
}
/**
 * Animation rendering helpers
 */
export declare class AnimationRenderer {
    /**
     * Render grade-up animation
     */
    static renderGradeUp(anim: Animation): string;
    /**
     * Render COOL/REGRET banner
     */
    static renderSectionResult(anim: Animation): string;
    /**
     * Get line clear flash intensity
     */
    static getFlashIntensity(anim: Animation): number;
    /**
     * Get lock glow intensity
     */
    static getLockGlowIntensity(anim: Animation): number;
    /**
     * Get grade color
     */
    private static getGradeColor;
    /**
     * Render placement effect
     *
     * Returns the character to render for a specific cell in the placement effect.
     * Scale and alpha based on frame progression.
     */
    static renderPlacementEffect(effect: PlacementEffectData, x: number, y: number): string | null;
    /**
     * Calculate scale for placement effect
     *
     * Frames 0-4: Scale up 0.8 → 1.2
     * Frames 5-9: Hold at 1.2
     * Frames 10-14: Scale down 1.2 → 1.0
     */
    private static calculateScale;
    /**
     * Calculate alpha for placement effect
     *
     * Frames 0-9: Alpha 1.0
     * Frames 10-14: Fade out 1.0 → 0.0
     */
    private static calculateAlpha;
    /**
     * Render back-to-back glow overlay
     *
     * Returns the character to render for B2B glow effect.
     */
    static renderBackToBackGlow(data: BackToBackGlowData, elapsed: number, duration: number, x: number, y: number): string | null;
    /**
     * Get bright version of color for glow effects
     */
    private static getBrightColor;
    /**
     * Extract color from blessed-tagged string
     *
     * Example: "{cyan-fg}██{/cyan-fg}" → "cyan"
     */
    static extractColor(taggedString: string): string;
}
//# sourceMappingURL=animations.d.ts.map