"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCK_FLASH_MS = exports.RENDER_INTERVAL_MS = exports.GHOST_CHAR = exports.TRAIL_LIFETIME_MS = void 0;
exports.lockFlashChar = lockFlashChar;
exports.overlaySignature = overlaySignature;
exports.boardNeedsRepaint = boardNeedsRepaint;
exports.brightColor = brightColor;
exports.hardDropTrailChar = hardDropTrailChar;
exports.buildHardDropTrail = buildHardDropTrail;
exports.expireTrails = expireTrails;
exports.trailCharAt = trailCharAt;
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
 *
 * The FADE MODEL - lifetime, intensity, the tiers a terminal can draw - now
 * lives in the SDK, because ARKANOID wanted the same streak for its paddle
 * and ball. What stays here is the mapping from a tier to GRANDMASTER's
 * blessed tags; Arkanoid maps the same tiers to raw ANSI. Only the drawing
 * differs, so only the drawing is duplicated.
 */
const motion_trail_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/motion-trail");
/** How long a trail cell stays on screen. Shared with every other door. */
exports.TRAIL_LIFETIME_MS = motion_trail_1.TRAIL_LIFETIME_MS;
/** The landing shadow. */
exports.GHOST_CHAR = '{gray-fg}░░{/gray-fg}';
/**
 * How often the playfield is actually painted (game-screen RENDER_FPS).
 *
 * Effects have to be authored against this, not against wall-clock taste: a
 * flash shorter than one interval is not a fast flash, it is a flash the
 * player sees or misses depending on where the frame boundary falls.
 */
exports.RENDER_INTERVAL_MS = 1000 / 20;
/** The lock flash is solid for one painted frame, then thins for two more. */
const LOCK_FLASH_SOLID_MS = exports.RENDER_INTERVAL_MS;
exports.LOCK_FLASH_MS = exports.RENDER_INTERVAL_MS * 3;
/**
 * The white flash over a piece that has just locked, or null once it is over.
 *
 * Driven straight off elapsed time in whole render frames rather than off a
 * fading curve. The curve version was visible for 56 ms of a 100 ms life, so
 * at 20 fps it was sampled once, never, or - when it landed inside the first
 * 20 ms - as a solid white block. Same landing, three different pictures.
 */
function lockFlashChar(elapsedMs) {
    if (elapsedMs < 0 || elapsedMs >= exports.LOCK_FLASH_MS)
        return null;
    if (elapsedMs < LOCK_FLASH_SOLID_MS)
        return '{white-fg}{bold}██{/bold}{/white-fg}';
    return '{white-fg}░░{/white-fg}';
}
/**
 * A cheap identity for an overlay frame.
 *
 * Only used to answer "did the effects change since the last paint", so it
 * compares content, not object identity - and an EMPTY overlay must be
 * distinguishable from a full one, which is the case that was missed.
 */
function overlaySignature(overlay) {
    let signature = '';
    for (let row = 0; row < overlay.length; row++) {
        const cells = overlay[row];
        if (!cells)
            continue;
        for (let col = 0; col < cells.length; col++) {
            const cell = cells[col];
            if (cell !== null && cell !== undefined)
                signature += `${row},${col},${cell};`;
        }
    }
    return signature;
}
/**
 * Whether the playfield has to be painted again this frame.
 *
 * `overlayChanged` is the one that was missing. The old gate asked whether
 * an effect was RUNNING, which is true on every frame of a flash and false
 * on the frame after it ends - so the last frame of the flash was never
 * cleared and stayed on the board until something unrelated moved. Asking
 * whether the overlay DIFFERS from what is on screen covers the appearance,
 * the animation and the disappearance with one question.
 */
function boardNeedsRepaint(state) {
    return state.boardChanged
        || state.overlayChanged
        || state.hasTrails
        || state.hadTrails
        || state.isShaking;
}
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
    switch ((0, motion_trail_1.trailTier)(strength)) {
        case 'solid': {
            const bright = brightColor(color);
            return `{${bright}-bg}  {/${bright}-bg}`;
        }
        case 'mid':
            return `{${color}-bg}  {/${color}-bg}`;
        default:
            return `{${color}-fg}░░{/${color}-fg}`;
    }
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
    const intensity = (0, motion_trail_1.trailIntensity)(trail, now, exports.TRAIL_LIFETIME_MS);
    if (intensity <= 0)
        return null;
    return hardDropTrailChar(trail.color, intensity);
}
//# sourceMappingURL=board-effects.js.map