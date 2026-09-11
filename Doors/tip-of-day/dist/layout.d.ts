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
    title: string;
    body: string[];
    hint: string;
}
export declare function wrapWords(text: string, width: number, maxLines: number): string[];
/**
 * Rows for this tip on a screen this wide. Inner text width is frame
 * minus borders and padding; on 40 columns the frame IS the screen
 * (minus padding) and the hint shortens to fit the cursor row.
 */
export declare function buildTipFrame(tip: Tip, screenWidth: number): TipFrame;
//# sourceMappingURL=layout.d.ts.map