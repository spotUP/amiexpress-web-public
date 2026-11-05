"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WASH_STEP_MS = void 0;
exports.washColour = washColour;
/** The wash runs through the piece colours, in spectrum order. */
const WASH = ['Z', 'L', 'O', 'S', 'I', 'J', 'T'];
/** One step of the roll, in milliseconds. The reference rolls once a frame. */
exports.WASH_STEP_MS = 1000 / 60;
/**
 * The colour a cell is washed with.
 *
 * `width` is the board's, so the mirrored column term folds about the middle
 * of whatever field it is given rather than the reference's fixed ten.
 */
function washColour(x, y, width, now) {
    const half = Math.floor(width / 2);
    // `if (color >= 5) color = 9 - color` - mirrored about the middle column.
    const column = x >= half ? (width - 1) - x : x;
    const roll = Math.floor(now / exports.WASH_STEP_MS);
    const band = ((20 - y) + column) * 4 + roll;
    return WASH[((band % WASH.length) + WASH.length) % WASH.length];
}
//# sourceMappingURL=color-wash.js.map