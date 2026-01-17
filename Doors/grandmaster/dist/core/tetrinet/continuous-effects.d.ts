/**
 * TetriNET Continuous Effects Manager
 *
 * Manages timed effects that last for a duration or piece count:
 * - Immunity: Protected from specials for 5 seconds
 * - Darkness: Piece preview hidden for 5 seconds
 * - Confusion: Left/right controls reversed for 5 seconds
 * - Mutation: Next 5 pieces are randomized
 */
import type { SpecialType } from './specials';
/**
 * Active continuous effect
 */
export interface ActiveEffect {
    type: SpecialType;
    startTime: number;
    duration: number;
    piecesRemaining?: number;
    sourcePlayerId?: string;
}
/**
 * Continuous effect types
 */
export type ContinuousEffectType = 'immunity' | 'darkness' | 'confusion' | 'mutation';
/**
 * Check if a special type is a continuous effect
 */
export declare function isContinuousEffect(type: SpecialType): type is ContinuousEffectType;
/**
 * Manager for continuous effects
 */
export declare class ContinuousEffectManager {
    private activeEffects;
    private onEffectStartCallbacks;
    private onEffectEndCallbacks;
    /**
     * Start a continuous effect
     */
    startEffect(type: ContinuousEffectType, sourcePlayerId?: string): void;
    /**
     * End a continuous effect early
     */
    endEffect(type: ContinuousEffectType): void;
    /**
     * Update effects (call every frame)
     * Returns array of effects that just ended
     */
    update(): ContinuousEffectType[];
    /**
     * Called when a piece is placed (for Mutation counter)
     */
    onPiecePlaced(): void;
    /**
     * Check if an effect is currently active
     */
    isActive(type: ContinuousEffectType): boolean;
    /**
     * Check if player has immunity (blocks incoming specials)
     */
    hasImmunity(): boolean;
    /**
     * Check if player has darkness (hides preview)
     */
    hasDarkness(): boolean;
    /**
     * Check if player has confusion (reversed controls)
     */
    hasConfusion(): boolean;
    /**
     * Check if player has mutation (randomized pieces)
     */
    hasMutation(): boolean;
    /**
     * Get remaining time for an effect (ms)
     */
    getTimeRemaining(type: ContinuousEffectType): number;
    /**
     * Get remaining pieces for Mutation
     */
    getMutationRemaining(): number;
    /**
     * Get all active effects
     */
    getActiveEffects(): ActiveEffect[];
    /**
     * Get active effect types
     */
    getActiveEffectTypes(): ContinuousEffectType[];
    /**
     * Clear all effects
     */
    clearAll(): void;
    /**
     * Register callback for when effect starts
     */
    onEffectStart(callback: (type: ContinuousEffectType) => void): () => void;
    /**
     * Register callback for when effect ends
     */
    onEffectEnd(callback: (type: ContinuousEffectType) => void): () => void;
    /**
     * Get display string for active effects
     */
    getDisplay(): string;
    /**
     * Serialize state
     */
    getState(): ActiveEffect[];
    /**
     * Load state
     */
    loadState(effects: ActiveEffect[]): void;
}
//# sourceMappingURL=continuous-effects.d.ts.map