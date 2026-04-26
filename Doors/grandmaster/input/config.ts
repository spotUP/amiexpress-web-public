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
export const DEFAULT_KEYS: KeyConfig = {
  left: ['left', 'a'],
  right: ['right', 'd'],
  rotateCW: ['x', 'pageup'],       // X = rotate clockwise
  rotateCCW: ['z', 'lcontrol', 'rcontrol'],  // Z = rotate counter-clockwise
  rotate180: ['space'],
  softDrop: ['down', 's'],
  hardDrop: ['up', 'return', 'enter'],  // Up arrow = hard drop
  sonicDrop: [],
  hold: ['c', 'lshift', 'rshift'],
  pause: ['p'],
};

/**
 * Key binding presets — named layouts the player can pick in settings.
 * Each preset resets ALL bindings so the player starts clean.
 */
export const KEY_PRESETS: Record<string, { name: string } & KeyConfig> = {
  tgm: {
    name: 'TGM Classic',
    left:      ['left'],
    right:     ['right'],
    rotateCW:  ['x', 'pageup'],
    rotateCCW: ['z', 'lcontrol', 'rcontrol'],
    rotate180: ['space'],
    softDrop:  ['down'],
    hardDrop:  ['up'],
    sonicDrop: [],
    hold:      ['c', 'lshift'],
    pause:     ['p'],
  },
  wasd: {
    name: 'WASD',
    left:      ['a'],
    right:     ['d'],
    rotateCW:  ['e', 'x'],
    rotateCCW: ['q', 'z'],
    rotate180: ['r'],
    softDrop:  ['s'],
    hardDrop:  ['w'],
    sonicDrop: [],
    hold:      ['lshift', 'c'],
    pause:     ['p'],
  },
  modern: {
    name: 'Modern (Jstris)',
    left:      ['left', 'a'],
    right:     ['right', 'd'],
    rotateCW:  ['up', 'x'],
    rotateCCW: ['z', 'lcontrol'],
    rotate180: ['space'],
    softDrop:  ['down', 's'],
    hardDrop:  ['return'],
    sonicDrop: [],
    hold:      ['c', 'lshift'],
    pause:     ['p'],
  },
};

/**
 * Map key name to game action
 */
export function keyToAction(key: string, config: KeyConfig = DEFAULT_KEYS): GameAction | null {
  if (config.left.includes(key)) return 'left';
  if (config.right.includes(key)) return 'right';
  if (config.rotateCW.includes(key)) return 'rotate_cw';
  if (config.rotateCCW.includes(key)) return 'rotate_ccw';
  if (config.rotate180.includes(key)) return 'rotate_180';
  if (config.softDrop.includes(key)) return 'soft_drop';
  if (config.hardDrop.includes(key)) return 'hard_drop';
  if (config.sonicDrop?.includes(key)) return 'sonic_drop';
  if (config.hold.includes(key)) return 'hold';
  if (config.pause.includes(key)) return 'pause';
  return null;
}

/**
 * DAS/ARR timing constants (in milliseconds)
 */
export const TIMING = {
  DAS_DELAY: 133,        // Delayed Auto-Shift (ms before repeat starts)
  ARR_RATE: 10,          // Auto-Repeat Rate (ms between repeats)
  SOFT_DROP_RATE: 50,    // Soft drop repeat rate (ms)
};
