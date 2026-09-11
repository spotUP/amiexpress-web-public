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
/** Installed TypeScript doors, in-house originals first. */
export declare function loadDoorCatalog(boardRoot: string | null): DoorEntry[];
//# sourceMappingURL=catalog.d.ts.map