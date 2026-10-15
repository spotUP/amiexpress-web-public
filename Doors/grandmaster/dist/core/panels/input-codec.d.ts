/**
 * The input codec: one character per frame.
 * Ports common/data/KeyDataEncoding.lua and common/data/InputCompression.lua.
 *
 * Every frame of a game is one printable character holding a 6-bit button
 * mask. This is what crosses the wire in netplay and what a replay stores, so
 * it has to be exact in both directions or a replay simply plays a different
 * game.
 *
 * THE ALPHABET IS NOT STANDARD BASE64. It is
 *     A-Z a-z 1234567890 + /
 * with the digits starting at ONE, so '0' sits at index 62 rather than 52.
 * Using a stock base64 alphabet would decode every replay slightly wrong.
 *
 * Bit values, from the same source:
 *     raise 32, swap 16, up 8, down 4, left 2, right 1
 * so idle is 'A', right 'B', left 'C', down 'E', up 'I', swap 'Q', raise 'g'.
 *
 * The run-length layer has one real subtlety: digits are legal input
 * characters, so a digit run cannot be written as "char + count" - it would be
 * ambiguous with the count itself. Those are wrapped in parentheses and
 * written out literally instead: "(555)" is three frames of '5'.
 */
/** Button bit values. */
export declare const INPUT_BITS: {
    readonly RIGHT: 1;
    readonly LEFT: 2;
    readonly DOWN: 4;
    readonly UP: 8;
    readonly SWAP: 16;
    readonly RAISE: 32;
};
/** The single characters for each action on its own. */
export declare const INPUT_CHARS: {
    readonly idle: string;
    readonly right: string;
    readonly left: string;
    readonly down: string;
    readonly up: string;
    readonly swap: string;
    readonly raise: string;
};
export interface InputState {
    right: boolean;
    left: boolean;
    down: boolean;
    up: boolean;
    swap: boolean;
    raise: boolean;
}
/** The button mask for one frame, as a character. */
export declare function encodeInput(mask: number): string;
/** The mask a character holds. */
export declare function decodeInput(char: string): number;
export declare function inputStateToMask(state: Partial<InputState>): number;
export declare function maskToInputState(mask: number): InputState;
/**
 * Run-length compress a frame-per-character input string.
 *
 * Non-digit characters become `char` followed by a decimal count; digit runs
 * are written literally inside parentheses, because a digit followed by digits
 * could not be told from a count.
 */
export declare function compressInputString(inputs: string): string;
/**
 * Expand a compressed input string.
 *
 * Iterates CODEPOINTS, not bytes: some committed replays carry multi-byte
 * characters in their input strings, and a byte-wise loop mangles them.
 *
 * If the string turns out not to be compressed at all - signalled by two
 * identical non-digit characters where a count was expected - it is returned
 * unchanged, which is what upstream does.
 */
export declare function decompressInputString(inputs: string): string;
//# sourceMappingURL=input-codec.d.ts.map