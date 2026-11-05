"use strict";
/**
 * In-game control hints, built from what the player ACTUALLY bound.
 *
 * The hint bar used to be a hardcoded string - "1-6 special on player 0 self
 * TAB random BS discard P pause" - so it lied to anyone who rebound a key
 * and lied to everyone playing on a joypad, where none of those labels mean
 * anything (reported 2026-08-26). It now reads the live bindings and the
 * device in use.
 *
 * Pure: bindings in, text out, so the wording can be tested without a game.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatKeyName = formatKeyName;
exports.formatTriggerName = formatTriggerName;
exports.keyFor = keyFor;
exports.padFor = padFor;
exports.buildHintLine = buildHintLine;
exports.tetrinetHints = tetrinetHints;
/** Human-readable name for a key as the door names it internally. */
function formatKeyName(key) {
    const NAMES = {
        left: '<-',
        right: '->',
        up: 'UP',
        down: 'DOWN',
        space: 'SPACE',
        enter: 'ENTER',
        escape: 'ESC',
        tab: 'TAB',
        backspace: 'BS',
        delete: 'DEL',
        pageup: 'PGUP',
        pagedown: 'PGDN',
    };
    return NAMES[key] ?? key.toUpperCase();
}
/** Human-readable name for a gamepad trigger string, e.g. "button:a". */
function formatTriggerName(trigger) {
    if (trigger.startsWith('button:')) {
        const button = trigger.slice(7).toUpperCase();
        const NAMES = {
            SELECT: 'SEL', START: 'START', HOME: 'HOME',
        };
        return NAMES[button] ?? button;
    }
    if (trigger.startsWith('dpad:')) {
        const direction = trigger.slice(5);
        return `D-${direction.charAt(0).toUpperCase()}${direction.slice(1)}`;
    }
    if (trigger.startsWith('axis:')) {
        const [, axis, direction] = trigger.split(':');
        // A raw axis NUMBER is honest on a pad the browser cannot map; a stick
        // name would be fiction there.
        const label = /^\d+$/.test(axis) ? `AX${axis}` : axis.toUpperCase();
        return `${label}${direction === 'negative' ? '-' : '+'}`;
    }
    return trigger;
}
/** The key bound to an action, or null when the player has none. */
function keyFor(action, keys) {
    const MAP = {
        left: 'left',
        right: 'right',
        rotate_cw: 'rotateCW',
        rotate_ccw: 'rotateCCW',
        rotate_180: 'rotate180',
        soft_drop: 'softDrop',
        hard_drop: 'hardDrop',
        hold: 'hold',
        pause: 'pause',
        use_special_self: 'useSpecialSelf',
        use_special_random: 'useSpecialRandom',
        discard_special: 'discardSpecial',
    };
    const field = MAP[action];
    if (!field)
        return null;
    const bound = keys[field];
    if (!bound || bound.length === 0)
        return null;
    return formatKeyName(bound[0]);
}
/** The pad control bound to an action, or null when there is none. */
function padFor(action, bindings) {
    const bound = bindings[action];
    if (!bound || bound.length === 0)
        return null;
    return formatTriggerName(bound[0]);
}
/**
 * The hint line for a set of actions.
 *
 * Actions the player has not bound are LEFT OUT rather than shown with a
 * blank - a hint for a control that does nothing is worse than no hint.
 */
function buildHintLine(entries, source, keys, padBindings) {
    const parts = [];
    for (const entry of entries) {
        const control = source === 'gamepad'
            ? padFor(entry.action, padBindings)
            : keyFor(entry.action, keys);
        if (!control)
            continue;
        parts.push(`${control} ${entry.label}`);
    }
    return parts.join('   ');
}
/**
 * The TetriNET hint line.
 *
 * The number keys that target opponent slots are fixed in the reference
 * client and have no pad equivalent, so they are described only when playing
 * on the keyboard.
 */
function tetrinetHints(source, keys, padBindings) {
    const entries = [
        { action: 'use_special_self', label: 'self' },
        { action: 'use_special_random', label: 'random' },
        { action: 'discard_special', label: 'discard' },
        { action: 'pause', label: 'pause' },
    ];
    const slots = source === 'keyboard' && (keys.useSpecialOn?.length ?? 0) > 0
        ? '1-6 special on player   '
        : '';
    const line = `${slots}${buildHintLine(entries, source, keys, padBindings)}`.trim();
    // Never NOTHING. The hint bar occupies the terminal's last row, and an
    // empty string leaves it unpainted - which is the black band the layout
    // tests exist to catch. A player with nothing bound still gets told where
    // to fix that.
    if (line.length === 0) {
        return source === 'gamepad'
            ? 'No joypad controls bound - see Settings'
            : 'No keys bound - see Settings';
    }
    return line;
}
//# sourceMappingURL=input-hints.js.map