/**
 * Per-Block Glow System
 *
 * Manages persistent glow effects on locked pieces and cleared lines.
 * Implements radial glow patterns (Manhattan for T-spins, Euclidean for combos).
 */
export type GlowType = 'primary' | 'b2b';
export type GlowPattern = 'linear' | 'manhattan' | 'euclidean';
export interface BlockGlow {
    x: number;
    y: number;
    timer: number;
    intensity: number;
    type: GlowType;
    pattern: GlowPattern;
    centerX?: number;
    centerY?: number;
    color: string;
}
/**
 * Block Glow Manager
 *
 * Uses sparse Map storage for performance (~5ms per frame for 20 glowing cells).
 * Manages multiple glow layers (primary + back-to-back bonus).
 */
export declare class BlockGlowManager {
    private glows;
    private readonly BASE_DURATION;
    private readonly B2B_MULTIPLIER;
    private enabled;
    private intensityMultiplier;
    /**
     * Enable or disable the glow system
     */
    setEnabled(enabled: boolean): void;
    /**
     * Set global intensity multiplier (0.0-1.0)
     */
    setIntensityMultiplier(multiplier: number): void;
    /**
     * Add glow for cleared lines
     *
     * @param lines - Array of Y positions being cleared
     * @param type - Clear type: 'normal', 'tspin', or 'tetris'
     * @param centerX - Center X for radial patterns (optional)
     * @param centerY - Center Y for radial patterns (optional)
     */
    addLineClearGlow(lines: number[], type: 'normal' | 'tspin' | 'tetris', centerX?: number, centerY?: number): void;
    /**
     * Add glow for locked piece (combo/T-spin radial patterns)
     *
     * @param cells - Array of {x, y} cell positions
     * @param isCombo - Whether this is a combo (uses Euclidean pattern)
     * @param isTSpin - Whether this is a T-spin (uses Manhattan pattern)
     */
    addLockGlow(cells: Array<{
        x: number;
        y: number;
    }>, isCombo: boolean, isTSpin: boolean): void;
    /**
     * Add back-to-back bonus glow (secondary glow layer)
     *
     * @param cells - Array of {x, y} cell positions
     */
    addBackToBackGlow(cells: Array<{
        x: number;
        y: number;
    }>): void;
    /**
     * Update all glow timers
     *
     * Call this every frame (60 FPS). Removes expired glows.
     *
     * @param deltaTime - Time since last update in milliseconds
     */
    update(deltaTime: number): void;
    /**
     * Get glow intensity for a specific cell
     *
     * Combines primary and back-to-back glow if both present.
     *
     * @param x - Cell X position
     * @param y - Cell Y position
     * @returns Intensity value (0.0-1.0), or 0 if no glow
     */
    getGlowIntensity(x: number, y: number): number;
    /**
     * Get glow color for a specific cell
     *
     * @param x - Cell X position
     * @param y - Cell Y position
     * @returns Color string (e.g., 'yellow', 'magenta', 'cyan'), or null if no glow
     */
    getGlowColor(x: number, y: number): string | null;
    /**
     * Calculate radial intensity based on distance from center
     *
     * @param glow - Glow data with pattern and center coordinates
     * @param x - Target cell X
     * @param y - Target cell Y
     * @returns Intensity multiplier (0.0-1.0)
     */
    private calculateRadialIntensity;
    /**
     * Clear all glows (useful for game reset)
     */
    clear(): void;
    /**
     * Get count of active glows (for debugging/monitoring)
     */
    getActiveGlowCount(): number;
    /**
     * Check if a cell has any glow
     */
    hasGlow(x: number, y: number): boolean;
}
//# sourceMappingURL=block-glow.d.ts.map