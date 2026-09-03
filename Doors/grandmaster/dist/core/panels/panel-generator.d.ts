/**
 * PanelGenerator, ported from common/engine/PanelGenerator.lua (@ c80668e).
 *
 * Rows are generated as strings of digits, one character per cell, and every
 * cell is rerolled until it satisfies three rules:
 *
 *   1. never the same colour as the panel below it (so a vertical pair can
 *      never be generated, which makes a generated vertical triple impossible)
 *   2. never a third of the same colour in a row horizontally
 *   3. horizontally adjacent pairs only at a certain frequency, per level
 *
 * Rule 3 is where the subtleties live, and they matter because every reroll
 * consumes a random number: get the acceptance wrong once and every subsequent
 * panel in the game differs.
 *
 * TWO LUA SEMANTICS THAT DO NOT SURVIVE A NAIVE PORT:
 *
 *   `0/0` is NaN, and `NaN <= x` is false. Upstream relies on this: on the very
 *   first adjacent pair the running frequency is 0/0, the comparison is false,
 *   and the pair is ACCEPTED. The comment in the Lua calls it "a bit jank". JS
 *   agrees with Lua on both counts, so this ports as-is - but only if the
 *   division is left alone. Guarding the zero denominator would change the
 *   first roll of every game.
 *
 *   `tonumber("0")` is 0, and 0 is TRUTHY in Lua - only nil and false are
 *   falsy. assignMetalLocations loops `while not tonumber(char)`, which in Lua
 *   exits on "0" and continues on "A". Writing that as `while (!Number(char))`
 *   in JS would spin on "0", because 0 is falsy here. Hence luaToNumber below,
 *   which answers "is this numeric" separately from the value.
 */
/** Colour letter/digit to colour number. Upper and lower case are the two shock slots. */
export declare const PANEL_COLOR_TO_NUMBER: Readonly<Record<string, number>>;
/** Colour number to its uppercase marker - the FIRST potential shock slot in a row. */
export declare const PANEL_COLOR_NUMBER_TO_UPPER: Readonly<Record<number, string>>;
/** Colour number to its lowercase marker - the SECOND potential shock slot. */
export declare const PANEL_COLOR_NUMBER_TO_LOWER: Readonly<Record<number, string>>;
export declare class PanelGenerator {
    readonly seed: number;
    /** Upstream keeps this purely to see how often random was called. Kept for parity in tests. */
    generatedCount: number;
    adjacentDenialFrequency: number;
    adjacentAccepted: number;
    adjacentDenied: number;
    private readonly rng;
    constructor(seed: number, adjacentDenialFrequency: number);
    random(min: number, max: number): number;
    getState(): string;
    setState(state: string): void;
    /**
     * Generate one row of `rowWidth` panels, given the row below it.
     *
     * `previousRow` is the row this one will sit on top of; an empty string is
     * treated as a row of empties, exactly as upstream does.
     */
    generatePanels(rowWidth: number, ncolors: number, previousRow: string): string;
    /**
     * Mark two cells of a row as the potential shock positions.
     *
     * The first becomes uppercase, the second lowercase; whether either actually
     * becomes a shock panel is decided later by convertMetalPanels, from how many
     * the stack has queued. Positions are rerolled while the SAME position in the
     * row below is already a marker, so shock panels cannot ghost-match on their
     * own - the same reasoning as the colour rules above.
     */
    assignMetalLocations(rowString: string, previousRowString: string): string;
}
//# sourceMappingURL=panel-generator.d.ts.map