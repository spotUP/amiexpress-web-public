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