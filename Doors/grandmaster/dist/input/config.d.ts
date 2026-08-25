/**
 * Input Configuration and Key Bindings
 *
 * Defines key mappings for game controls
 */
import type { GameAction } from '../core/types';
/**
 * Key binding configuration
 */
export interface KeyConfig {
    left: string[];
    right: string[];
    rotateCW: string[];
    rotateCCW: string[];
    rotate180: string[];
    softDrop: string[];
    hardDrop: string[];
    sonicDrop: string[];
    hold: string[];
    pause: string[];
    /** TetriNET only: use the first special on the player in slot 1-6. */
    useSpecialOn?: string[][];
    /** TetriNET only: use the first special on yourself. */
    useSpecialSelf?: string[];
    /** TetriNET only: use the first special on a random opponent. */
    useSpecialRandom?: string[];
    /** TetriNET only: throw the first special away. */
    discardSpecial?: string[];
}
/**
 * Default key bindings (Modern Tetris style)
 * - Arrow keys for movement
 * - Up for hard drop
 * - Z/X for rotation (CCW/CW)
 */
export declare const DEFAULT_KEYS: KeyConfig;
/**
 * Key binding presets — named layouts the player can pick in settings.
 * Each preset resets ALL bindings so the player starts clean.
 */
export declare const KEY_PRESETS: Record<string, {
    name: string;
} & KeyConfig>;
/**
 * Map key name to game action
 */
export declare function keyToAction(key: string, config?: KeyConfig): GameAction | null;
/**
 * DAS/ARR timing constants (in milliseconds)
 */
export declare const TIMING: {
    DAS_DELAY: number;
    ARR_RATE: number;
    SOFT_DROP_RATE: number;
};
//# sourceMappingURL=config.d.ts.map