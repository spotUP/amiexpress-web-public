/**
 * One payload, word-wrapped to the caller's width.
 *
 * This door writes through BBSApi.write(), which emits straight to the socket
 * and never passes the backend's wrapForSession - so a status line carrying a
 * filename ("Stripped archive written to <name> (portable ZIP format).", 66
 * columns) does not soft-wrap on a C64, it hard-wraps mid-word and eats the
 * row beneath. The wrap is the SDK's `wrapLineToWidth`, the same primitive
 * wrapForSession is built on, so the door and the board break lines the same
 * way.
 *
 * At 80 columns and wider this is a straight pass-through: the board's bytes
 * are exactly what they were.
 */
export declare function fitToWidth(text: string, width: number): string;
/** The banner: title on the left, the pattern count on the right. */
export declare function stripperHeader(patternCount: string, width: number): string;
/** The rule under the listing, as wide as the screen and no wider. */
export declare function stripperRule(width: number): string;
/**
 * How many characters the path column may use.
 * Wide keeps the literals the door has always used (38 stripped, 40 kept);
 * narrow leaves room for the two-space indent, the size and a gap.
 */
export declare function pathColumn(wide: number, width: number): number;
/** True when the `[reason]` tail has nowhere to go. */
export declare function showsReason(width: number): boolean;
//# sourceMappingURL=layout.d.ts.map