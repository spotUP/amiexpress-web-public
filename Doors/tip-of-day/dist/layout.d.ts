import type { Tip } from './tips';
export interface TipFrame {
    /** Frame outer width, including borders where drawn. */
    frameWidth: number;
    /** Frame outer height, including borders where drawn. */
    frameHeight: number;
    /** False on the 40-column tier: no frames, chrome in one row. */
    bordered: boolean;
    /** Text width inside the frame: every content row fits exactly this. */
    innerWidth: number;
    /**
     * Columns of padding inside the frame, and so the LEFT of every content
     * row. Blessed child coordinates are already inner-relative (the parent's
     * border is added for them, sdk element.ts:572-576), so this must NOT
     * include the border - a door that added one pushed its rows off the
     * frame (2026-09-13).
     */
    padding: number;
    title: string;
    body: string[];
    hint: string;
}
/**
 * Where each content box sits INSIDE the frame, and how many rows it has
 * to sit in.
 *
 * Blessed child coordinates are inner-relative: the SDK adds the parent's
 * border offset itself (element.ts:572-576). The door added one on top of
 * that, which pushed the hint row onto the frame's own bottom border at 80
 * columns and one column past the right edge at 40 (2026-09-13). The
 * geometry is one function now, so the rows the app draws are the rows
 * this file's tests measure.
 */
export interface TipBoxRows {
    title: number;
    body: number;
    hint: number;
    /** Left of every content box, inner-relative. */
    left: number;
    /** Rows inside the frame: a box at or past this one is on the border. */
    innerRows: number;
}
export declare function tipBoxRows(frame: TipFrame): TipBoxRows;
export declare function wrapWords(text: string, width: number, maxLines: number): string[];
/**
 * Rows for this tip on a screen this wide. Inner text width is frame
 * minus borders and padding; on 40 columns the frame IS the screen
 * (minus padding) and the hint shortens to fit the cursor row.
 */
export declare function buildTipFrame(tip: Tip, screenWidth: number): TipFrame;
//# sourceMappingURL=layout.d.ts.map