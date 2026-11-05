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
/**
 * What noise is made of.
 *
 * Uppercase, digits and a little punctuation: every one of them exists in
 * both PETSCII banks and in latin-1, so the same frames go to a C64 and to an
 * ANSI terminal without a translation table in between.
 */
export declare const SCRAMBLE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*+-=/\\<>";
/** Deterministic in a test, random on the board. */
export type Random = () => number;
/** How many printable characters a line has - the length of its settle mask. */
export declare function visibleLength(line: string): number;
/**
 * One frame: `line`'s escapes and settled characters, noise everywhere else.
 *
 * `settled[n]` is about the nth PRINTABLE character, not the nth byte, so a
 * mask outlives a change of pen.
 */
export declare function scrambleFrame(line: string, settled: readonly boolean[], random: Random): string;
/** Nothing settled yet, for a row of `length` printable characters. */
export declare function nothingSettled(length: number): boolean[];
/**
 * Settle `count` more characters, chosen at random from those still moving.
 *
 * Randomly rather than left to right: a wipe reads as a progress bar, and
 * this is meant to read as the value being FOUND. Returns a new mask; the old
 * one is left alone so a caller can keep the frames it has already sent.
 */
export declare function settleSome(settled: readonly boolean[], count: number, random: Random): boolean[];
/** Is there anything left moving? */
export declare function stillMoving(settled: readonly boolean[]): boolean;
/**
 * The whole settling of one row, frame by frame, ending on the row itself.
 *
 * `frames` is how many steps it takes; the last is always the real line,
 * because the mask is full by construction rather than by arithmetic.
 */
export declare function settleFrames(line: string, frames: number, random: Random): string[];
//# sourceMappingURL=scramble.d.ts.map