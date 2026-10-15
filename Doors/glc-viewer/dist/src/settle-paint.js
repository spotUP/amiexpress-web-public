"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETTLE_FRAMES = exports.SCRAMBLE_FRAME_MS = void 0;
exports.settleOnto = settleOnto;
exports.waitingScramble = waitingScramble;
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
/**
 * HOW OFTEN A SCRAMBLED FRAME GOES OUT - one number for both animations.
 *
 * The waiting noise ran on a 125ms interval and the settling on 60ms
 * frames, so the reveal churned at twice the speed of the wait and the
 * change of pace read as a glitch: "when it switches from scrambling to the
 * revealing scrambling it scrambles faster" (sysop, 2026-09-16). It is one
 * animation to a caller - noise that resolves - so it is one cadence here.
 *
 * Eight frames a second: enough to read as movement, and forty columns of
 * ten rows is under four hundred bytes a frame, which a 19200 line carries
 * without noticing.
 */
exports.SCRAMBLE_FRAME_MS = 125;
/**
 * HOW MANY FRAMES THE TABLE TAKES TO SETTLE - the whole reveal, not its speed.
 *
 * Ten frames at the shared cadence is a second and a quarter of watching a
 * list one already has: "it can be snappier so we dont waste peoples time"
 * (sysop, 2026-09-16). Five is a little over half a second, which still
 * reads as a fade - each frame settles a fifth of the row, at random - and
 * costs a caller half of what it did.
 *
 * The SPEED is `SCRAMBLE_FRAME_MS` and stays where it is: dropping frames
 * shortens the reveal, dropping the gap would make the noise churn faster
 * than the wait does and bring back the lurch at the join.
 */
exports.SETTLE_FRAMES = 5;
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
    const frames = Math.max(1, options.frames ?? exports.SETTLE_FRAMES);
    const frameMs = Math.max(0, options.frameMs ?? exports.SCRAMBLE_FRAME_MS);
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
/**
 * NOISE WHILE THE SCENEWALL IS ASKED.
 *
 * The placeholder rows are redrawn as scrambled characters until the answer
 * lands, so a caller can see the door is working rather than guessing at a
 * still screen. Nothing settles during the wait - every frame is noise, and
 * the settling happens once, onto the real rows, in `settleOnto`. The rows
 * marked `still` (the rules, the legend) are drawn as themselves: the page's
 * frame holds while the values inside it churn.
 *
 * Shares `paintFrame` and the cadence with the settling, because to a caller
 * it is the same animation either side of the answer.
 *
 * Returns the stop function. The timer is unref'd - a door must not hold the
 * process open - and stopping it is the CALLER's job in a `finally`, or a
 * frame arriving after the table would overwrite it.
 */
function waitingScramble(wire, placeholders, still, options = {}) {
    if (placeholders.length === 0)
        return () => { };
    const random = options.random ?? Math.random;
    const masks = placeholders.map((row) => (0, scramble_1.nothingSettled)((0, scramble_1.visibleLength)(row)));
    const timer = setInterval(() => {
        paintFrame(wire, placeholders.map((row, i) => (still[i] ? row : (0, scramble_1.scrambleFrame)(row, masks[i], random))), placeholders.length);
    }, Math.max(0, options.frameMs ?? exports.SCRAMBLE_FRAME_MS));
    if (typeof timer.unref === 'function')
        timer.unref();
    return () => clearInterval(timer);
}
//# sourceMappingURL=settle-paint.js.map