"use strict";
/**
 * Shared playfield effects
 *
 * The landing shadow and the hard-drop motion blur belong to GRANDMASTER's
 * look, not to one screen: the main modes had them, TetriNET grew a
 * lookalike ghost of its own ('::' in grey) and no blur at all. Both screens
 * now draw them from here, so they cannot drift apart again.
 *
 * Kept deliberately free of engine types - it takes a shape and a colour and
 * returns characters, so the TGM engine and the TetriNET engine can both
 * feed it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GHOST_CHAR = exports.TRAIL_LIFETIME_MS = void 0;
exports.brightColor = brightColor;
exports.hardDropTrailChar = hardDropTrailChar;
exports.buildHardDropTrail = buildHardDropTrail;
exports.expireTrails = expireTrails;
exports.trailCharAt = trailCharAt;
/** How long a trail cell stays on screen. */
exports.TRAIL_LIFETIME_MS = 160;
/** The landing shadow. */
exports.GHOST_CHAR = '{gray-fg}░░{/gray-fg}';
const BRIGHT = {
    red: 'lightred',
    green: 'lightgreen',
    yellow: 'lightyellow',
    blue: 'lightblue',
    magenta: 'lightmagenta',
    cyan: 'lightcyan',
    white: 'lightwhite',
    orange: 'yellow',
};
function brightColor(color) {
    return BRIGHT[color] || color;
}
/**
 * A trail cell, solid while fresh and thinning as it fades.
 */
function hardDropTrailChar(color, strength) {
    if (strength > 0.66) {
        const bright = brightColor(color);
        return `{${bright}-bg}  {/${bright}-bg}`;
    }
    if (strength > 0.33) {
        return `{${color}-bg}  {/${color}-bg}`;
    }
    return `{${color}-fg}░░{/${color}-fg}`;
}
/**
 * The streak a piece leaves when it is slammed down.
 *
 * @param shape        piece shape, rows of 0/1
 * @param pieceX       piece column before the drop
 * @param pieceY       piece row before the drop
 * @param dropDistance rows travelled
 * @param color        colour name to fade out
 * @param bounds       rows outside [minY, maxY) are not drawn (the TGM board
 *                     hides its four spawn rows; TetriNET shows everything)
 */
function buildHardDropTrail(shape, pieceX, pieceY, dropDistance, color, bounds, now) {
    if (dropDistance <= 0)
        return [];
    const trails = [];
    const maxSteps = Math.max(1, dropDistance);
    for (let py = 0; py < shape.length; py++) {
        for (let px = 0; px < shape[py].length; px++) {
            if (!shape[py][px])
                continue;
            const x = pieceX + px;
            for (let step = 0; step < dropDistance; step++) {
                const y = pieceY + step + py;
                if (y < bounds.minY || y >= bounds.maxY)
                    continue;
                trails.push({ x, y, color, strength: (step + 1) / maxSteps, createdAt: now });
            }
        }
    }
    return trails;
}
/** Drop trail cells that have finished fading. */
function expireTrails(trails, now) {
    return trails.filter(trail => now - trail.createdAt < exports.TRAIL_LIFETIME_MS);
}
/** The character for a trail cell at this moment, or null once it is gone. */
function trailCharAt(trails, x, y, now) {
    const trail = trails.find(t => t.x === x && t.y === y);
    if (!trail)
        return null;
    const fade = Math.max(0, 1 - (now - trail.createdAt) / exports.TRAIL_LIFETIME_MS);
    if (fade <= 0)
        return null;
    return hardDropTrailChar(trail.color, trail.strength * fade);
}
//# sourceMappingURL=board-effects.js.map