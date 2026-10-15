/**
 * The order of the installed-doors list.
 *
 * Three orders, cycled by one key: the board's own order (the .info files
 * as the backend lists them), then minimum access level ascending - the
 * doors every caller can run first - then descending. A disabled door
 * carries the DISABLED sentinel as its level (32767, see
 * door-info-file.service.ts) and therefore sorts last ascending, which is
 * what a sysop scanning for "who can run what" wants: the doors nobody can
 * run at the bottom. Stable: two doors at one level keep their board order.
 */
export type InstalledSortMode = 'default' | 'access-asc' | 'access-desc';
export declare const SORT_MODES: readonly InstalledSortMode[];
export declare function nextSortMode(mode: InstalledSortMode): InstalledSortMode;
/** What the list label says about the order. Empty for the board's own. */
export declare function sortLabel(mode: InstalledSortMode): string;
export declare function sortInstalled<T extends {
    accessLevel?: number;
}>(doors: readonly T[], mode: InstalledSortMode): T[];
//# sourceMappingURL=installed-sort.d.ts.map