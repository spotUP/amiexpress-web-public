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
}
/**
 * Default key bindings (Modern Tetris style)
 * - Arrow keys for movement
 * - Up for hard drop
 * - Z/X for rotation (CCW/CW)
 */
export declare const DEFAULT_KEYS: KeyConfig;
/**
 * Alternative key bindings (modern Tetris)
 */
export declare const MODERN_KEYS: KeyConfig;
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