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
const wait = (ms) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function')
        timer.unref();
});
/**
 * Write `lines` over `onScreen` placeholder rows, settling as they go.
 *
 * ASYNCHRONOUS, and that is the whole difference between an animation and a
 * redraw. The first cut emitted every frame in one synchronous loop: the
 * terminal received them back to back and painted the last, so the table
 * appeared all at once and the sysop said so - "the scramble animation reveals
 * all real characters at the same time". A frame is only a frame if there is
 * time between them.
 *
 * Returns how many rows are on screen afterwards, so a caller can clear the
 * placeholders its shorter list did not reach.
 */
async function settleOnto(wire, lines, onScreen, options) {
    const frames = Math.max(1, options.frames ?? 10);
    const frameMs = Math.max(0, options.frameMs ?? 60);
    const random = options.random ?? Math.random;
    const sleep = options.sleep ?? wait;
    if (options.animate && lines.length > 0) {
        const masks = lines.map((line, i) => (options.still?.[i]
            ? (0, scramble_1.nothingSettled)((0, scramble_1.visibleLength)(line)).map(() => true)
            : (0, scramble_1.nothingSettled)((0, scramble_1.visibleLength)(line))));
        const longest = Math.max(...masks.map((m, i) => (options.still?.[i] ? 0 : m.length)), 1);
        /*
         * A FEW CHARACTERS PER FRAME, not a share of the row.
         *
         * Settling `length / frames` at a time finishes every row on the same
         * frame, however long it is, which is the "all at once" the sysop saw in
         * miniature: the last frame does most of the work. Settling a small
         * constant share means a short cell finishes early and a long one goes on
         * moving - which is what makes it read as a cross-fade rather than a wipe.
         */
        const perFrame = Math.max(1, Math.round(longest / frames));
        for (let frame = 0; frame < frames && masks.some(scramble_1.stillMoving); frame++) {
            for (let i = 0; i < masks.length; i++)
                masks[i] = (0, scramble_1.settleSome)(masks[i], perFrame, random);
            paintFrame(wire, lines.map((line, i) => (0, scramble_1.scrambleFrame)(line, masks[i], random)), onScreen);
            // Every frame after the first writes over the frame before it, not over
            // the placeholders.
            onScreen = lines.length;
            await sleep(frameMs);
        }
    }
    // The last write is always the real table, whatever the frames did.
    paintFrame(wire, lines, onScreen);
    return lines.length;
}
//# sourceMappingURL=settle-paint.js.map