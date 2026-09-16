/** Cursor up one row, and clear it before drawing over it. */
export declare const CURSOR_UP = "\u001B[A";
export declare const CLEAR_ROW = "\u001B[K";
/**
 * A row of placeholder rules, in the real row's colours and widths.
 *
 * Dots rather than blanks: a blank row reads as "there are no callers", and
 * this is "there are callers and they have not arrived yet". The dimmest pen
 * on the row, so it recedes against the real thing.
 */
export declare function skeletonRow(): string;
/** `count` placeholder rows - one per call the door is about to ask for. */
export declare function skeletonRows(count: number): string[];
/**
 * Walk back over `count` rows so the next writes land on top of them.
 *
 * One `ESC[A` per row rather than `ESC[<n>A`: the C64 adapter reconstructs a
 * frame from what it is sent, and a PETSCII caller's cursor-up is a single
 * byte with no parameter - the repeated form is what both transports already
 * agree on.
 */
export declare function rewind(count: number): string;
/** Draw `line` over whatever is on the current row. */
export declare function overwrite(line: string): string;
//# sourceMappingURL=skeleton.d.ts.map