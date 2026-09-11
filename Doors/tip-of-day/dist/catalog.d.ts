export interface DoorEntry {
    /** Directory under Doors/, e.g. "whip". */
    name: string;
    /** The command a caller types, e.g. "WHIP". */
    command: string;
    description: string;
    author: string;
    /** True for the board's own TypeScript originals (REBEL/QTX E ports, classic ports excluded). */
    inHouse: boolean;
}
export declare function resolveBoardRoot(startDir: string): string | null;
/**
 * The board speaks Amiga Latin-1 both directions now, so U+0020-U+00FF
 * paints. Anything above (em dashes, ellipses, emoji a sysop pasted
 * into a description) does not - one '?' each, never a crash, never a
 * silent drop of the whole tip.
 */
export declare function amigaSafe(text: string): string;
/** Installed TypeScript doors, in-house originals first. */
export declare function loadDoorCatalog(boardRoot: string | null): DoorEntry[];
//# sourceMappingURL=catalog.d.ts.map