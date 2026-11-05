/**
 * Line Clear Tile Animation System
 *
 * Implements tile-by-tile line clear animations with 4 styles:
 * - Inward: Collapse from edges to center
 * - Outward: Explode from center to edges
 * - Instant: No animation, immediate clear
 * - Directional: Toggleable IN/OUT direction
 *
 * The animation defers actual line clearing until completion (20 frames = 333ms at 60 FPS).
 */
export type ClearStyle = 'inward' | 'outward' | 'instant' | 'directional';
export type ClearDirection = 'in' | 'out';
export interface LineClearAnimation {
    lines: number[];
    style: ClearStyle;
    timer: number;
    maxTimer: number;
    direction: ClearDirection;
    cellStates: Map<string, number>;
    speedMultiplier: number;
}
/**
 * Line Clear Animation Manager
 *
 * Manages tile-by-tile line clear animations with deferred line clearing.
 * The game engine should check if animation is active and call update() each frame.
 */
export declare class LineClearAnimationManager {
    private animation;
    private readonly BOARD_WIDTH;
    private enabled;
    /**
     * Enable or disable line clear animations
     */
    setEnabled(enabled: boolean): void;
    /**
     * Start line clear animation
     *
     * @param lines - Array of Y positions being cleared
     * @param style - Animation style
     * @param direction - Direction for 'directional' style (default: 'in')
     * @param speedMultiplier - Speed multiplier (0.5=slow, 1.0=normal, 2.0=fast)
     */
    startClearAnimation(lines: number[], style: ClearStyle, direction?: ClearDirection, speedMultiplier?: number): void;
    /**
     * Update animation state
     *
     * Call this every frame (60 FPS). Returns true when animation completes.
     *
     * @param deltaTime - Time since last update in milliseconds
     * @returns true if animation completed this frame
     */
    update(deltaTime: number): boolean;
    /**
     * Get fade progress for a specific cell
     *
     * @param x - Cell X position
     * @param y - Cell Y position
     * @returns Fade progress (0=visible, 1=cleared)
     */
    getCellFade(x: number, y: number): number;
    /**
     * Check if cell should render during animation
     *
     * @param x - Cell X position
     * @param y - Cell Y position
     * @returns true if cell should be rendered
     */
    shouldRenderCell(x: number, y: number): boolean;
    /**
     * Check if animation is currently active
     */
    isActive(): boolean;
    /**
     * Get current animation style (for debugging/UI)
     */
    getCurrentStyle(): ClearStyle | null;
    /**
     * Clear animation (force stop)
     */
    clear(): void;
    /**
     * Calculate fade progress for a cell based on animation style
     *
     * @param x - Cell X position
     * @param y - Cell Y position
     * @param progress - Global animation progress (0-1)
     * @returns Fade progress (0=visible, 1=cleared)
     */
    private calculateFade;
    /**
     * Inward collapse animation
     *
     * Cells closer to the center fade first, creating a collapse effect.
     */
    private calculateInwardFade;
    /**
     * Outward explosion animation
     *
     * Cells at the edges fade first, creating an explosion effect.
     */
    private calculateOutwardFade;
    /**
     * Directional animation (toggleable IN/OUT)
     *
     * @param x - Cell X position
     * @param progress - Global animation progress
     * @param direction - 'in' for inward, 'out' for outward
     */
    private calculateDirectionalFade;
    /**
     * Apply fade effect to cell character
     *
     * This is a helper for rendering - can be called from UI layer.
     *
     * @param baseChar - Base character (e.g., '██' with color tags)
     * @param fade - Fade progress (0-1)
     * @returns Faded character with appropriate styling
     */
    static applyFade(baseChar: string, fade: number): string;
    /**
     * Extract color from blessed-tagged string
     *
     * Example: "{cyan-fg}██{/cyan-fg}" → "cyan"
     */
    private static extractColor;
}
//# sourceMappingURL=line-clear-animation.d.ts.map