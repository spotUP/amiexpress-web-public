/**
 * The LEGACY panel generator, ported from
 * common/compatibility/LegacyPanelGenerator.lua (@ c80668e).
 *
 * WHY THIS EXISTS. Replays recorded on engine versions 045-047 were played on
 * an older generator, and most of panel-attack's committed replay fixtures are
 * from those versions. Reproducing such a replay with the modern generator
 * produces a different board and therefore a different game - which is exactly
 * what happened here before this file existed: the smallest endless fixture
 * died at frame 336 instead of 402 because it was being played on a board it
 * was never recorded on.
 *
 * HOW IT DIFFERS from the modern generator:
 *
 *  - it fills the WHOLE buffer in one call rather than a row at a time, and
 *    appends to whatever it was given
 *  - "no horizontally adjacent colours" is a flat boolean, not a frequency, so
 *    there is no running-ratio bookkeeping and no NaN bootstrap
 *  - there is NO reject-and-regenerate pass for perfectly paired rows, so it
 *    spends fewer random numbers per row
 *  - shock positions are assigned over the entire buffer at the end, not per
 *    row as it is generated
 *
 * THE SCIENTIFIC-NOTATION BUG IS LOAD-BEARING. assignMetalLocations decides
 * whether a row still needs shock markers by asking whether the row parses as a
 * NUMBER. A row like "4043E0" already carries a marker - the E - but Lua reads
 * it as 4043 in scientific notation, so it is reprocessed and burns extra
 * random numbers. Upstream's own comment concludes that "for compatibility with
 * seeds in replays, these rows being reprocessed for metal has to be considered
 * correct behaviour". JavaScript's Number() agrees with Lua on "4043E0", so the
 * bug ports for free - but ONLY if numeric-ness is tested with isNaN. Testing
 * truthiness instead would treat a row of "000000" as non-numeric, because 0 is
 * falsy in JS and truthy in Lua, and every seeded board would drift.
 */
export declare class LegacyPanelGenerator {
    private readonly rng;
    generatedCount: number;
    seed: number;
    setSeed(seed: number): void;
    random(min: number, max: number): number;
    /**
     * Generate `rowsToMake` rows, appended to `previousPanels`.
     *
     * Three rejection rules, all evaluated together as one condition: no three in
     * a row horizontally, never the same colour as the panel below, and - when
     * `disallowAdjacentColors` is set - no horizontally adjacent pair at all.
     */
    generatePanels(rowsToMake: number, rowWidth: number, ncolors: number, previousPanels: string, disallowAdjacentColors: boolean): string;
    /**
     * Mark two cells per row as the potential shock positions.
     *
     * Works over the whole buffer, prepending a row of zeroes because the
     * algorithm needs a shock-free row beneath the first real one; that row is
     * sliced off again at the end.
     */
    assignMetalLocations(ret: string, rowWidth: number): string;
}
//# sourceMappingURL=legacy-panel-generator.d.ts.map