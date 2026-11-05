/**
 * Screen Transition System
 *
 * Provides fade, wipe, and slide transitions between screens
 */
/**
 * Transition types
 */
export type TransitionType = 'fade' | 'wipe' | 'slide' | 'none';
/**
 * Transition direction (for wipe/slide)
 */
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';
/**
 * Transition configuration
 */
export interface TransitionConfig {
    type: TransitionType;
    duration: number;
    direction?: TransitionDirection;
    easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}
/**
 * Transition presets
 */
export declare const TRANSITION_PRESETS: Record<string, TransitionConfig>;
/**
 * Transition instance
 */
export declare class Transition {
    private elapsed;
    private config;
    private direction;
    constructor(config: TransitionConfig, direction?: 'in' | 'out');
    /**
     * Update transition
     */
    update(deltaTime: number): void;
    /**
     * Get current progress (0-1)
     */
    getProgress(): number;
    /**
     * Apply easing function to progress
     */
    private applyEasing;
    /**
     * Get fade alpha (0-1)
     */
    getFadeAlpha(): number;
    /**
     * Get wipe position (0-100, percentage of screen)
     */
    getWipePosition(): number;
    /**
     * Get slide offset (pixels)
     */
    getSlideOffset(screenWidth: number, screenHeight: number): {
        x: number;
        y: number;
    };
    /**
     * Check if transition is complete
     */
    isDone(): boolean;
    /**
     * Get transition type
     */
    getType(): TransitionType;
    /**
     * Get transition direction
     */
    getDirection(): 'in' | 'out';
}
/**
 * Transition manager
 */
export declare class TransitionManager {
    private currentTransition;
    private onComplete;
    /**
     * Start a transition
     */
    start(preset: keyof typeof TRANSITION_PRESETS, direction?: 'in' | 'out', onComplete?: () => void): void;
    /**
     * Start a custom transition
     */
    startCustom(config: TransitionConfig, direction?: 'in' | 'out', onComplete?: () => void): void;
    /**
     * Update current transition
     */
    update(deltaTime: number): void;
    /**
     * Get current transition
     */
    getTransition(): Transition | null;
    /**
     * Check if transitioning
     */
    isTransitioning(): boolean;
    /**
     * Stop current transition
     */
    stop(): void;
}
//# sourceMappingURL=transitions.d.ts.map