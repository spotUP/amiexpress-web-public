"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prefsSender = prefsSender;
exports.applyServerPrefs = applyServerPrefs;
/**
 * Sends the full prefs to the server (chat:prefs-set); they are stored per
 * user there and come back on the next open as chat:prefs.
 */
function prefsSender(socket) {
    return (prefs) => { socket?.emit('chat:prefs-set', { prefs: { ...prefs } }); };
}
/**
 * Merges the server's stored prefs into `target`. Keys the server did not
 * send keep their current (default) value; unknown keys and values of the
 * wrong type are ignored. Returns true when anything changed.
 */
function applyServerPrefs(target, stored) {
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored))
        return false;
    const src = stored;
    const dst = target;
    let changed = false;
    for (const key of Object.keys(target)) {
        if (key === 'pinnedChannels')
            continue;
        if (typeof src[key] === 'boolean' && dst[key] !== src[key]) {
            dst[key] = src[key];
            changed = true;
        }
    }
    const pins = src.pinnedChannels;
    if (Array.isArray(pins) && pins.every((n) => typeof n === 'string')) {
        target.pinnedChannels = [...pins];
        changed = true;
    }
    return changed;
}
