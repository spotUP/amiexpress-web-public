/**
 * Screen Shake Engine
 *
 * Provides dynamic screen shake effects for various game events
 */
/**
 * Shake decay types
 */
export type ShakeDecay = 'linear' | 'exponential' | 'bounce';
/**
 * Shake direction
 */
export type ShakeDirection = 'horizontal' | 'vertical' | 'circular' | 'random';
/**
 * Shake configuration
 */
export interface ShakeConfig {
    intensity: number;
    duration: number;
    decay: ShakeDecay;
    direction: ShakeDirection;
}
/**
 * Shake presets for common events
 */
export declare const SHAKE_PRESETS: Record<string, ShakeConfig>;
/**
 * Screen shake manager
 */
export declare class ScreenShaker {
    private offsetX;
    private offsetY;
    private shakeQueue;
    private enabled;
    /**
     * Trigger a shake effect
     */
    shake(preset: keyof typeof SHAKE_PRESETS): void;
    /**
     * Trigger a custom shake
     */
    shakeCustom(config: ShakeConfig): void;
    /**
     * Update all active shakes
     */
    update(deltaTime: number): void;
    /**
     * Get current shake offset
     */
    getOffset(): {
        x: number;
        y: number;
    };
    /**
     * Check if currently shaking
     */
    isShaking(): boolean;
    /**
     * Stop all shakes immediately
     */
    stop(): void;
    /**
     * Enable/disable shake effects
     */
    setEnabled(enabled: boolean): void;
    /**
     * Check if shake is enabled
     */
    isEnabled(): boolean;
}
//# sourceMappingURL=screen-shake.d.ts.map