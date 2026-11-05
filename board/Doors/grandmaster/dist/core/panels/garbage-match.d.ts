/**
 * Clearing garbage, and sending it.
 * Ports the garbage half of common/engine/checkMatches.lua (@ c80668e).
 *
 * A garbage block is matched by CONTACT, not by colour: any panel of a real
 * match that is orthogonally touching the block's bounding box clears it. The
 * clear then spreads transitively to touching blocks OF THE SAME KIND - normal
 * garbage chains to normal, shock to shock, and the two never mix.
 *
 * ONLY THE BOTTOM ROW OF A BLOCK CONVERTS. Each match strips one row, which
 * turns into real panels of freshly generated colours; the rows above go back
 * to being garbage and wait for the next match. That is why digging out a tall
 * block is a chain rather than a single clear.
 *
 * The off-screen rule is subtle and is upstream's, kept verbatim in spirit: a
 * block may only be matched if its lowest row is on screen OR it has been
 * matched before. Without the second half, a chain that pushes its own garbage
 * off the top would stop being clearable halfway through. Without the first, a
 * block that spawned above the playfield and was never seen could be cleared by
 * a match the player had no way to know would reach it.
 */
import { Panel, PanelGrid } from './panel';
import type { LevelData } from './level-data';
import type { GarbageQueue } from './garbage-queue';
import type { Coordinate } from './check-matches';
/** A garbage block reduced to its bounding box. */
interface AABBGarbage {
    left: number;
    right: number;
    top: number;
    bottom: number;
    metal: boolean;
}
/** What the garbage routines need of a stack. */
export interface GarbageStack {
    panels: PanelGrid;
    width: number;
    height: number;
    levelData: LevelData;
    stopWatch: number;
    /** The highest garbage id ever matched, which is how off-screen blocks stay clearable. */
    highestGarbageIdMatched: number;
    outgoingGarbage: GarbageQueue;
    panelSource: {
        getGarbagePanelRowString(stack: GarbageStack): string;
    };
    onGarbageMatched?: (panelCount: number, onScreenCount: number) => void;
}
/**
 * Would these two blocks clear each other on contact?
 *
 * Only if they are the same kind - shock never spreads a clear into normal
 * garbage or the reverse - and only if their bounding boxes actually touch
 * edge-to-edge rather than merely overlapping in one axis.
 */
export declare function matchOnContact(a: AABBGarbage, b: AABBGarbage): boolean;
/**
 * Every garbage panel cleared by this frame's match, or null if none.
 *
 * Three passes: reduce every eligible block to a bounding box, find the ones a
 * matching panel is touching, then spread transitively to blocks touching
 * those.
 */
export declare function getConnectedGarbagePanels(stack: GarbageStack, matchingPanels: Panel[]): Panel[] | null;
/**
 * Put matched garbage panels into their clear.
 *
 * Each loses a row from the BOTTOM - yOffset and height both drop - so the row
 * that reaches -1 is the one that converts to real panels. Garbage pops bottom
 * to top and right to left, the opposite of an ordinary match.
 */
export declare function matchGarbagePanels(stack: GarbageStack, garbagePanels: Panel[], garbageMatchTime: number, isChain: boolean, onScreenCount: number): void;
/**
 * Give the about-to-convert row its colours.
 *
 * Colours come from the garbage generator, one row string at a time, so a block
 * converts into the same colours on both players' screens. Panels out of a
 * chain's garbage always carry the chaining flag - which is what lets digging
 * one out continue the chain.
 */
export declare function convertGarbagePanels(stack: GarbageStack, isChain: boolean): void;
/**
 * Send garbage for a match.
 *
 * Shock garbage first: three matched shock panels send one 6-wide block, four
 * send two, and so on. Combo garbage is sent IN ADDITION, never instead - a
 * combo full of shock panels sends both.
 */
export declare function pushGarbage(stack: GarbageStack, origin: Coordinate, isChain: boolean, comboSize: number, metalCount: number): void;
export {};
//# sourceMappingURL=garbage-match.d.ts.map