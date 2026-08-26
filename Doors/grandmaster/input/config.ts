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
/**
 * What the touch layer sends, and what it means.
 *
 * A phone has no keyboard to bind, so the gesture surface sends fixed keys
 * (web/frontend/src/components/mobile/gesture-scheme.ts) and they are read
 * through the player's key map like anything else. That is fine until a
 * player's map gives one of them a different job - and the DEFAULT map gives
 * space to rotate-180, so a hard-drop swipe used to spin the piece.
 *
 * These are consulted only when the player's own map claims nothing, so a
 * keyboard player who deliberately binds one of these keeps their binding.
 */
const TOUCH_FALLBACK: Record<string, GameAction> = {
  enter: 'hard_drop',
  return: 'hard_drop',
};

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
  // Nothing in the player's map wanted this key - see TOUCH_FALLBACK.
  const fallback = TOUCH_FALLBACK[key];
  if (fallback) return fallback;

  return null;
}

/**
 * DAS/ARR timing constants (in milliseconds)
 */
export const TIMING = {
  // TGM3 - the reference this door follows - charges DAS over 16 frames and
  // then slides ONE CELL PER FRAME. At the arcade's 60fps that is 267ms and
  // 16.7ms; this door renders at 20fps (game-screen RENDER_FPS), so one cell
  // per VISIBLE frame is 50ms.
  //
  // These were 133 and 10. Ten milliseconds is a hundred cells a second:
  // the piece sat still through DAS and then crossed the board instantly,
  // which reads as accelerating (reported live 2026-08-26). They are only
  // the DEFAULT now - the player's own settings override them, which they
  // could not do before because this handler never read them.
  DAS_DELAY: 267,        // Delayed Auto-Shift (ms before repeat starts)
  ARR_RATE: 50,          // Auto-Repeat Rate (ms between repeats)
  SOFT_DROP_RATE: 50,    // Soft drop repeat rate (ms)
};
