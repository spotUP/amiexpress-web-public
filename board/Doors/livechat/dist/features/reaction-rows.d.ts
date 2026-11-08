/** The glyph for a reaction name; an unknown name shows as itself. */
export declare function reactionGlyph(name: string): string;
/** Picker line: glyph padded to 3, a space, the word (`:)  Thumbs Up`). */
export declare function reactionPickerLabel(i: number): string;
/**
 * The rows for one message: [] when no reaction has a count, else one string
 * per row, each already indented. Rows are plain text (no colour tags).
 */
export declare function reactionRowTexts(counts: Readonly<Record<string, number>>, indent: number, width: number): string[];
/** Columns before the message text: `[time] <nick> ` read off the first painted row. */
export declare function textIndent(firstRow: string): number;
export interface DisplayRows {
    raw: string[];
    rendered: string[];
    ids: (string | null)[];
    /** Display index of each source row: reaction rows push later rows down. */
    at: number[];
}
/**
 * The log as painted: every message row, with its reaction rows after the
 * message's last row. Reaction rows carry the message id, so a click on one
 * names its message, and every consumer that counts rows (scroll, the message
 * picker, right-click) reads this one list.
 */
export declare function withReactionRows(raw: readonly string[], rendered: readonly string[], ids: readonly (string | null)[], width: number, accent: string): DisplayRows;
/** ` [<3 2] [:) 1]` one-line form for the /reactions answer; empty when none. */
export declare function formatReactionCounts(messageId: string | number): string;
