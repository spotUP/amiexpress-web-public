"use strict";
/**
 * The list arriving, rather than appearing.
 *
 * The sysop, 2026-09-16: "it would be cool if the skeleton loaders animated
 * scrambled text while waiting for the data that gradually stopped on the real
 * characters randomly".
 *
 * So the placeholder rows are not dots any more while the scenewall is being
 * asked - they are noise, and when the answer lands each CHARACTER stops on
 * its real value at its own moment. The row settles the way a departure board
 * does, which is the point: a caller can see that something is happening and
 * roughly how far along it is.
 *
 * TWO RULES THIS MODULE OBEYS, and both are why it is pure:
 *
 *  - ESCAPES ARE NEVER SCRAMBLED. A row is `ESC[36m` + text + `ESC[34m:` + ...;
 *    scrambling the bytes of a colour code paints the screen a random colour
 *    or worse, leaves a half-written sequence on the wire. Only PRINTABLE
 *    characters are replaced, and the pens land exactly where they landed.
 *  - THE LAST FRAME IS THE REAL ROW, byte for byte. An animation that ends
 *    near the answer is a bug that looks like a feature; `isSettled` filling
 *    up is the only way it can finish.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCRAMBLE_ALPHABET = void 0;
exports.visibleLength = visibleLength;
exports.scrambleFrame = scrambleFrame;
exports.nothingSettled = nothingSettled;
exports.settleSome = settleSome;
exports.stillMoving = stillMoving;
exports.settleFrames = settleFrames;
/**
 * What noise is made of.
 *
 * Uppercase, digits and a little punctuation: every one of them exists in
 * both PETSCII banks and in latin-1, so the same frames go to a C64 and to an
 * ANSI terminal without a translation table in between.
 */
exports.SCRAMBLE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*+-=/\\<>';
/** A CSI sequence: `ESC[`, parameters, one final letter. */
const CSI = /^\x1b\[[0-9;?]*[A-Za-z]/;
function glyph(random) {
    const index = Math.floor(random() * exports.SCRAMBLE_ALPHABET.length) % exports.SCRAMBLE_ALPHABET.length;
    return exports.SCRAMBLE_ALPHABET[index] ?? '#';
}
/** How many printable characters a line has - the length of its settle mask. */
function visibleLength(line) {
    let count = 0;
    for (let i = 0; i < line.length;) {
        const escape = CSI.exec(line.slice(i));
        if (escape) {
            i += escape[0].length;
            continue;
        }
        count++;
        i++;
    }
    return count;
}
/**
 * One frame: `line`'s escapes and settled characters, noise everywhere else.
 *
 * `settled[n]` is about the nth PRINTABLE character, not the nth byte, so a
 * mask outlives a change of pen.
 */
function scrambleFrame(line, settled, random) {
    const out = [];
    let visible = 0;
    for (let i = 0; i < line.length;) {
        const escape = CSI.exec(line.slice(i));
        if (escape) {
            out.push(escape[0]);
            i += escape[0].length;
            continue;
        }
        const character = line[i];
        // A space stays a space: scrambling the gaps between columns turns a
        // table into a wall and the caller loses the shape he is waiting for.
        if (character === ' ' || settled[visible])
            out.push(character);
        else
            out.push(glyph(random));
        visible++;
        i++;
    }
    return out.join('');
}
/** Nothing settled yet, for a row of `length` printable characters. */
function nothingSettled(length) {
    return Array.from({ length }, () => false);
}
/**
 * Settle `count` more characters, chosen at random from those still moving.
 *
 * Randomly rather than left to right: a wipe reads as a progress bar, and
 * this is meant to read as the value being FOUND. Returns a new mask; the old
 * one is left alone so a caller can keep the frames it has already sent.
 */
function settleSome(settled, count, random) {
    const next = [...settled];
    const moving = [];
    for (let i = 0; i < next.length; i++)
        if (!next[i])
            moving.push(i);
    for (let n = 0; n < count && moving.length > 0; n++) {
        const pick = Math.floor(random() * moving.length) % moving.length;
        next[moving[pick]] = true;
        moving.splice(pick, 1);
    }
    return next;
}
/** Is there anything left moving? */
function stillMoving(settled) {
    return settled.some((done) => !done);
}
/**
 * The whole settling of one row, frame by frame, ending on the row itself.
 *
 * `frames` is how many steps it takes; the last is always the real line,
 * because the mask is full by construction rather than by arithmetic.
 */
function settleFrames(line, frames, random) {
    const length = visibleLength(line);
    let settled = nothingSettled(length);
    const perFrame = Math.max(1, Math.ceil(length / Math.max(1, frames)));
    const out = [];
    for (let frame = 0; frame < frames && stillMoving(settled); frame++) {
        settled = settleSome(settled, perFrame, random);
        out.push(scrambleFrame(line, settled, random));
    }
    // Whatever the arithmetic did, the caller ends up looking at the truth.
    if (out.length === 0 || out[out.length - 1] !== line)
        out.push(line);
    return out;
}
//# sourceMappingURL=scramble.js.map