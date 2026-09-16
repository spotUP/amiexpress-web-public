"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settleOnto = settleOnto;
/**
 * Painting a table over its own placeholders, one settling frame at a time.
 *
 * Both widths do the same thing here: walk the cursor back over the rows that
 * are already on screen, and write the new ones on top. What this adds is
 * that the new ones arrive as NOISE and stop on their real characters, which
 * is what the sysop asked for.
 *
 * The whole table settles TOGETHER - every row advances a little per frame -
 * rather than row by row. A row-at-a-time reveal reads as a list being typed;
 * all at once reads as a signal resolving, which is what it is.
 */
const skeleton_1 = require("./skeleton");
const scramble_1 = require("./scramble");
/** One frame of every row, over the rows already on screen. */
function paintFrame(wire, lines, onScreen) {
    if (onScreen > 0)
        wire.emit('ansi-output', (0, skeleton_1.rewind)(onScreen));
    for (const line of lines)
        wire.emit('ansi-output', (0, skeleton_1.overwrite)(line) + '\r\n');
}
/**
 * Write `lines` over `onScreen` placeholder rows.
 *
 * Returns how many rows are on screen afterwards, so a caller can clear the
 * placeholders its shorter list did not reach.
 */
function settleOnto(wire, lines, onScreen, options) {
    const frames = Math.max(1, options.frames ?? 5);
    const random = options.random ?? Math.random;
    if (options.animate && lines.length > 0) {
        const masks = lines.map((line) => (0, scramble_1.nothingSettled)((0, scramble_1.visibleLength)(line)));
        const perFrame = Math.max(1, Math.ceil(Math.max(...masks.map((m) => m.length), 1) / frames));
        for (let frame = 0; frame < frames && masks.some(scramble_1.stillMoving); frame++) {
            for (let i = 0; i < masks.length; i++)
                masks[i] = (0, scramble_1.settleSome)(masks[i], perFrame, random);
            paintFrame(wire, lines.map((line, i) => (0, scramble_1.scrambleFrame)(line, masks[i], random)), onScreen);
            // Every frame after the first writes over the frame before it, not over
            // the placeholders.
            onScreen = lines.length;
        }
    }
    // The last write is always the real table, whatever the frames did.
    paintFrame(wire, lines, onScreen);
    return lines.length;
}
//# sourceMappingURL=settle-paint.js.map