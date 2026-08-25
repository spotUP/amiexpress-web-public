"use strict";
/**
 * Input Configuration and Key Bindings
 *
 * Defines key mappings for game controls
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMING = exports.KEY_PRESETS = exports.TETRINET_KEYS = exports.DEFAULT_KEYS = void 0;
exports.keyToAction = keyToAction;
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
exports.DEFAULT_KEYS = {
    left: ['left', 'a'],
    right: ['right', 'd'],
    rotateCW: ['x', 'pageup'],
    rotateCCW: ['z', 'lcontrol', 'rcontrol'],
    rotate180: ['space'],
    softDrop: ['down', 's'],
    hardDrop: ['up', 'return', 'enter'],
    sonicDrop: [],
    hold: ['c', 'lshift', 'rshift'],
    pause: ['p'],
};
/**
 * TetriNET layout, copied from the reference client
 * (TetriNET2.Client.ConsoleApp): arrows to move, Up to rotate, Space to
 * drop, H to hold, D to discard a special, 1-6 to use one on that slot,
 * Enter on yourself, Tab on a random opponent.
 *
 * It replaces the TGM layout while a TetriNET game is running, because the
 * two collide: TGM binds Space to rotate-180, Enter to hard drop and D to
 * move right, so the reference's special keys had nowhere to live.
 */
exports.TETRINET_KEYS = {
    left: ['left'],
    right: ['right'],
    rotateCW: ['up', 'x'],
    rotateCCW: ['z', 'lcontrol', 'rcontrol'],
    rotate180: [],
    softDrop: ['down'],
    hardDrop: ['space'],
    sonicDrop: [],
    hold: ['h', 'c'],
    pause: ['p'],
    useSpecialOn: [['1'], ['2'], ['3'], ['4'], ['5'], ['6']],
    useSpecialSelf: ['return', 'enter'],
    useSpecialRandom: ['tab'],
    discardSpecial: ['d'],
};
/**
 * Key binding presets — named layouts the player can pick in settings.
 * Each preset resets ALL bindings so the player starts clean.
 */
exports.KEY_PRESETS = {
    tgm: {
        name: 'TGM Classic',
        left: ['left'],
        right: ['right'],
        rotateCW: ['x', 'pageup'],
        rotateCCW: ['z', 'lcontrol', 'rcontrol'],
        rotate180: ['space'],
        softDrop: ['down'],
        hardDrop: ['up'],
        sonicDrop: [],
        hold: ['c', 'lshift'],
        pause: ['p'],
    },
    wasd: {
        name: 'WASD',
        left: ['a'],
        right: ['d'],
        rotateCW: ['e', 'x'],
        rotateCCW: ['q', 'z'],
        rotate180: ['r'],
        softDrop: ['s'],
        hardDrop: ['w'],
        sonicDrop: [],
        hold: ['lshift', 'c'],
        pause: ['p'],
    },
    modern: {
        // Jstris/TETR.IO style: Space=hard drop, Up=rotate CW, Z=rotate CCW.
        // Rotate 180 is left unbound (not a Jstris default — user can bind manually).
        name: 'Modern (Jstris/TETR.IO)',
        left: ['left', 'a'],
        right: ['right', 'd'],
        rotateCW: ['up', 'x'], // Up arrow = rotate CW (Jstris standard)
        rotateCCW: ['z', 'lcontrol'],
        rotate180: [], // Not bound by default in Jstris
        softDrop: ['down', 's'],
        hardDrop: ['space'], // Space = hard drop (Jstris standard)
        sonicDrop: [],
        hold: ['c', 'lshift'],
        pause: ['p', 'escape'],
    },
};
/**
 * Map key name to game action
 */
function keyToAction(key, config = exports.DEFAULT_KEYS) {
    // TetriNET's special keys first: in that profile 1-6 must beat any other
    // meaning a digit might have.
    if (config.useSpecialOn) {
        for (let slot = 0; slot < config.useSpecialOn.length && slot < 6; slot++) {
            if (config.useSpecialOn[slot]?.includes(key)) {
                return `use_special_${slot + 1}`;
            }
        }
    }
    if (config.useSpecialSelf?.includes(key))
        return 'use_special_self';
    if (config.useSpecialRandom?.includes(key))
        return 'use_special_random';
    if (config.discardSpecial?.includes(key))
        return 'discard_special';
    if (config.left.includes(key))
        return 'left';
    if (config.right.includes(key))
        return 'right';
    if (config.rotateCW.includes(key))
        return 'rotate_cw';
    if (config.rotateCCW.includes(key))
        return 'rotate_ccw';
    if (config.rotate180.includes(key))
        return 'rotate_180';
    if (config.softDrop.includes(key))
        return 'soft_drop';
    if (config.hardDrop.includes(key))
        return 'hard_drop';
    if (config.sonicDrop?.includes(key))
        return 'sonic_drop';
    if (config.hold.includes(key))
        return 'hold';
    if (config.pause.includes(key))
        return 'pause';
    return null;
}
/**
 * DAS/ARR timing constants (in milliseconds)
 */
exports.TIMING = {
    DAS_DELAY: 133, // Delayed Auto-Shift (ms before repeat starts)
    ARR_RATE: 10, // Auto-Repeat Rate (ms between repeats)
    SOFT_DROP_RATE: 50, // Soft drop repeat rate (ms)
};
//# sourceMappingURL=config.js.map