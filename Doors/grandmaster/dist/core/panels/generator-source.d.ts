/**
 * GeneratorSource, ported from common/engine/GeneratorSource.lua (@ c80668e).
 *
 * The seeded supply of panels: it keeps a buffer of generated rows, hands the
 * front of it to the stack as each new row enters at the bottom, and holds a
 * second, independently seeded generator for the colours that come out of
 * cleared garbage.
 *
 * Determinism lives here as much as in the PRNG. Three things consume random
 * numbers in ways that are easy to get subtly wrong, and each would silently
 * shift every later panel:
 *
 *   - `isBadRow` REGENERATES a row whose colours all appear exactly twice.
 *     The rejected row's rolls are still spent.
 *   - `assignMetalLocations` rerolls its two positions against the row below.
 *   - The starting board deletes 12 panels by repeatedly picking a random
 *     column; picks that land on an already-empty column are discarded but
 *     still advance the generator.
 *
 * The buffer's FRONT is the row that enters the stack next, and rows enter at
 * the bottom and push everything up - so the front of the string is the TOP of
 * the starting stack. The starting-board removal indexes accordingly.
 */
import { PanelGenerator } from './panel-generator';
import type { LevelData } from './level-data';
/** What the generator needs to know about the stack it is feeding. */
export interface PanelSourceStack {
    width: number;
    levelData: LevelData;
}
/**
 * Is every colour present in this row present exactly twice?
 *
 * Such a row is rejected and regenerated. Upstream iterates its count table
 * with `ipairs`, which starts at index 1 - so colour 0 (an empty cell) is not
 * considered, and a row of all empties is "bad". Kept as-is.
 */
export declare function isBadRow(rowString: string): boolean;
/**
 * Resolve a row's markers into colour numbers, promoting to shock where the
 * stack has shock panels queued.
 *
 * Uppercase is the first shock slot, lowercase the second; a marker that is
 * not promoted falls back to the colour it stands for.
 */
export declare function convertMetalPanels(rowString: string, metalPanelCount: number): number[];
export declare class GeneratorSource {
    readonly seed: number;
    readonly shockEnabled: boolean;
    panelBuffer: string;
    garbagePanelBuffer: string;
    /** Created by clone(), not by the constructor - as upstream does. */
    panelGenerator: PanelGenerator;
    garbagePanelGenerator: PanelGenerator;
    constructor(seed: number, shockEnabled: boolean);
    /** Append one freshly generated row to the buffer, rejecting bad rows. */
    growPanelBuffer(stack: PanelSourceStack): void;
    /**
     * Build the seven-row opening stack, then knock 12 panels out of it.
     *
     * Upstream calls the removal "arcane magic" and notes that it depends on a
     * dummy row being prepended - which is then sliced off - so the row indexing
     * works out. That crutch is reproduced exactly; without it the removal hits
     * different cells.
     */
    generateStartingBoard(stack: PanelSourceStack): string;
    /** Twenty rows of colours for garbage clears, from the second generator. */
    generateGarbagePanels(stack: PanelSourceStack): string;
    /** One row of colours for a garbage block that is turning into panels. */
    getGarbagePanelRowString(stack: PanelSourceStack): string;
    /**
     * Take the next row's colours off the front of the buffer.
     *
     * `metalPanelsQueued` is the stack's; it is decremented here, by two if more
     * than three are waiting, otherwise by one. Returns the colour numbers for
     * the caller to place - panel construction is the stack's job, not ours.
     */
    nextRowColors(stack: PanelSourceStack, metalPanelsQueued: number): {
        colors: number[];
        metalPanelsQueued: number;
    };
    /**
     * A standalone copy bound to this stack's level data.
     *
     * This is where the two generators come into existence, and where the second
     * one's derived seed is set: `floor((seed + 5) / 2)`, with adjacent denial
     * forced to 1 so garbage colours never come out in horizontal pairs.
     */
    clone(stack: PanelSourceStack): GeneratorSource;
}
//# sourceMappingURL=generator-source.d.ts.map