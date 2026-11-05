/**
 * A board that was AUTHORED rather than generated.
 * Ports common/engine/PuzzleSource.lua.
 *
 * Every other source in this door invents panels; this one reads them out of a
 * string somebody wrote down. That makes it the only source whose rows cannot
 * be described as six colours, because an authored board can contain garbage,
 * and a garbage panel belongs to a BLOCK - which block, where inside it, how
 * wide and how tall - that a single digit has no room for.
 *
 * The notation, and the reason the walk below looks inside out:
 *
 *     [====]     one garbage block, one row tall, six wide
 *     {====}     the same, but metal
 *     [=====     a block spanning two rows: it opens on the row ABOVE
 *     =====]     and closes on the row below, because the string is read
 *                bottom-up and right-to-left
 *
 * So `]` and `}` OPEN a block (they are met first, at its bottom right) and `[`
 * and `{` close it at its top left. Every panel between them belongs to it. The
 * horizontal offset cannot be known until the closing marker is reached, so
 * upstream parks the column index in x_offset and subtracts afterwards; that is
 * kept, because it is also what makes irregular blocks come out the way the
 * original draws them.
 *
 * The panels are produced in one pass over the WHOLE string rather than row by
 * row, for the same reason: a block that spans rows cannot be resolved from one
 * row in isolation.
 */
import type { PanelSource, PanelSourceStack, PanelSpec } from './generator-source';
/** The stack fields a puzzle source needs beyond the generic ones. */
export interface PuzzleSourceStack extends PanelSourceStack {
    height: number;
    nextGarbageId(): number;
}
export declare class PuzzleSource implements PanelSource {
    /** The authored board, top row first. Consumed once, at startup. */
    private puzzleString;
    /** Panels the player raises into view after the board is exhausted. */
    private panelBuffer;
    /** Colours cleared garbage turns into. */
    private garbagePanelBuffer;
    /** Panels already built and not yet handed to the stack, TOP row first. */
    private pending;
    private panelGenCount;
    constructor(puzzleString: string, panelBuffer?: string, garbageBuffer?: string);
    clone(): PuzzleSource;
    /** How many rows the authored board is; the stack builds exactly that many. */
    getStartingBoardHeight(): number;
    /**
     * The next row to commit at the bottom of the board.
     *
     * TOP ROW FIRST, which reads backwards until you follow what newRow does:
     * every committed row is pushed up by the one after it, so the row handed
     * over first ends up highest. Hand them out bottom-first and the authored
     * board is built upside down - a mirror that every other test would still
     * pass, because it is a perfectly valid board.
     *
     * The board is built once, in full, the first time a row is asked for -
     * multi-row garbage cannot be resolved any other way - and then handed out
     * six panels at a time.
     */
    nextRowPanels(stack: PanelSourceStack): PanelSpec[];
    /**
     * Never called: nextRowPanels answers instead, and a source is asked for one
     * or the other. Present because the interface is shared with the generators.
     */
    nextRowColors(stack: PanelSourceStack, metalPanelsQueued: number): {
        colors: number[];
        metalPanelsQueued: number;
    };
    getGarbagePanelRowString(stack: PanelSourceStack): string;
    /** One row of the raise buffer, padded with colourless panels when it runs dry. */
    private takeBufferRow;
}
/**
 * Turn an authored string into panels, TOP row first.
 *
 * Exported because it is the whole of the notation and deserves to be tested
 * without a stack around it.
 */
export declare function buildPanels(puzzleString: string, stack: Pick<PuzzleSourceStack, 'width' | 'height' | 'nextGarbageId'>): PanelSpec[];
//# sourceMappingURL=puzzle-source.d.ts.map