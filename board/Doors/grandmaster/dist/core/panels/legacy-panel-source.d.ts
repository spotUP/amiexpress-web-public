/**
 * The LEGACY panel source, ported from
 * common/compatibility/LegacyPanelSource.lua (@ c80668e).
 *
 * The supply side of the pre-048 engine, and the counterpart to
 * LegacyPanelGenerator. Replays from engine versions 045-047 need it or they
 * are simulated on a board they were never recorded on.
 *
 * FOUR DIFFERENCES from GeneratorSource, all of which move the RNG:
 *
 *  1. The generator is RESEEDED every time the buffer is extended, with
 *     `seed + panelGenCount`. It is not one continuous stream.
 *  2. Rows are generated a HUNDRED at a time, not one at a time.
 *  3. The buffer is topped up when it falls to 10 rows, not 2.
 *  4. assignMetalLocations is called on the starting board even though a
 *     starting board can never carry shock panels - purely to advance the RNG.
 *     Upstream's comment says exactly that, and dropping the call would shift
 *     every subsequent panel.
 *
 * It also carries a documented garbage-colour bug that upstream kept for
 * compatibility and calls out as part of why this source was replaced: the
 * garbage buffer is topped up in a way that makes ten rows of garbage repeat
 * the colours of the following ten.
 */
import type { PanelSource, PanelSourceStack } from './generator-source';
export declare class LegacyPanelSource implements PanelSource {
    readonly seed: number;
    readonly shockEnabled: boolean;
    panelBuffer: string;
    garbagePanelBuffer: string;
    /** How often the panel buffer has been extended; part of the reseed. */
    panelGenCount: number;
    garbageGenCount: number;
    allowAdjacentColors: boolean;
    allowAdjacentColorsOnStartingBoard: boolean;
    private readonly generator;
    constructor(seed: number, shockEnabled: boolean);
    setAllowAdjacentColorsOnStartingBoard(allow: boolean): void;
    getStartingBoardHeight(): number;
    /**
     * The seven-row opening board, with twelve panels knocked out of it.
     *
     * Same "arcane magic" removal as the modern source - a dummy row prepended so
     * the indexing works, then sliced off - but reached through the legacy
     * generator and its reseeding.
     */
    generateStartingBoard(stack: PanelSourceStack): string;
    /** Top up the buffer by a hundred rows, reseeding as it goes. */
    generatePanels(stack: PanelSourceStack): string;
    generateGarbagePanels(stack: PanelSourceStack): string;
    /**
     * The colours for the next row entering at the bottom.
     *
     * The very first call builds the starting board; later ones top the buffer up
     * once it falls to ten rows.
     */
    nextRowColors(stack: PanelSourceStack, metalPanelsQueued: number): {
        colors: number[];
        metalPanelsQueued: number;
    };
    getGarbagePanelRowString(stack: PanelSourceStack): string;
    /**
     * A copy bound to this stack's level data.
     *
     * Unlike the modern source this does NOT build the starting board here - the
     * legacy path builds it on the first row request instead.
     */
    clone(stack: PanelSourceStack): LegacyPanelSource;
}
//# sourceMappingURL=legacy-panel-source.d.ts.map