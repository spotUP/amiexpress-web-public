"use strict";
/**
 * The live preview: one frame of one animation as blessed-tag lines.
 *
 * Pure in (sprite, animation, tick, scale). The playback loop upstairs
 * only advances the tick; everything visible is decided - and tested -
 * here. Scale 2 doubles each cell horizontally: half-block art reads as
 * fat pixels, the way a sprite editor should show it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewLines = previewLines;
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
function previewLines(sprite, animation, tick, scale) {
    const anim = sprite.animations[animation];
    if (!anim) {
        throw new Error(`sprite ${sprite.name} has no animation '${animation}' ` +
            `(has: ${Object.keys(sprite.animations).join(', ')})`);
    }
    const frame = (0, cell_art_1.frameAt)(anim, tick);
    return frame.map(row => {
        const out = [];
        for (const cell of row) {
            out.push(cell ? { ...cell } : null);
            if (scale === 2)
                out.push(cell ? { ...cell } : null);
        }
        return (0, cell_art_1.rowToTags)(out);
    });
}
