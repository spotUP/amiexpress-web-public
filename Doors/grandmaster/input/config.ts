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
// Default: TGM-influenced layout.
// Space = rotate 180 (big key, easy to hit).
// Up = hard drop (modern addition; TGM3 has sonic drop, not hard drop, but
// we expose hard drop as a feature so map it to the natural key).
// X/Z = rotate CW/CCW (TGM standard).
export const DEFAULT_KEYS: KeyConfig = {
  left:      ['left', 'a'],
  right:     ['right', 'd'],
  rotateCW:  ['x', 'pageup'],
  rotateCCW: ['z', 'lcontrol', 'rcontrol'],
  rotate180: ['space'],
  softDrop:  ['down', 's'],
  hardDrop:  ['up', 'return', 'enter'],
  sonicDrop: [],
  hold:      ['c', 'lshift', 'rshift'],
  pause:     ['p'],
  // TetriNET specials, in the SAME layout as everything else - the door has
  // one key map, not one per mode. The reference client puts discard on D
  // and use-on-self on Enter, but both are taken here (D moves right, Enter
  // hard drops), so those two move to keys that are free everywhere.
  useSpecialOn: [['1'], ['2'], ['3'], ['4'], ['5'], ['6']],
  useSpecialSelf: ['0'],
  useSpecialRandom: ['tab'],
  discardSpecial: ['backspace', 'delete'],
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
    // Jstris/TETR.IO style: Space=hard drop, Up=rotate CW, Z=rotate CCW.
    // Rotate 180 is left unbound (not a Jstris default — user can bind manually).
    name: 'Modern (Jstris/TETR.IO)',
    left:      ['left', 'a'],
    right:     ['right', 'd'],
    rotateCW:  ['up', 'x'],     // Up arrow = rotate CW (Jstris standard)
    rotateCCW: ['z', 'lcontrol'],
    rotate180: [],              // Not bound by default in Jstris
    softDrop:  ['down', 's'],
    hardDrop:  ['space'],       // Space = hard drop (Jstris standard)
    sonicDrop: [],
    hold:      ['c', 'lshift'],
    pause:     ['p', 'escape'],
  },
};

/**
 * Map key name to game action
 */
export function keyToAction(key: string, config: KeyConfig = DEFAULT_KEYS): GameAction | null {
  // TetriNET's special keys first: in that profile 1-6 must beat any other
  // meaning a digit might have.
  if (config.useSpecialOn) {
    for (let slot = 0; slot < config.useSpecialOn.length && slot < 6; slot++) {
      if (config.useSpecialOn[slot]?.includes(key)) {
        return `use_special_${slot + 1}` as GameAction;
      }
    }
  }
  if (config.useSpecialSelf?.includes(key)) return 'use_special_self';
  if (config.useSpecialRandom?.includes(key)) return 'use_special_random';
  if (config.discardSpecial?.includes(key)) return 'discard_special';

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
