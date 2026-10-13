import { type MagazineIndexEntry, type Story } from '@amiexpress/bbs-door-sdk/formats/magazine';
/** `<bbsRoot>/Magazine`, found the way every other board path is found. */
export declare function magazineRoot(startDir?: string): string;
/** What the reader needs from one read of the magazine. */
export interface MagazineSnapshot {
    /** Every published story, in page order. */
    index: MagazineIndexEntry[];
    /** Story ids a human approved for the front page, in the editor's order. */
    front: string[];
}
/** `index.json`, entries that do not have the shape dropped. */
export declare function loadIndex(root?: string): MagazineIndexEntry[];
/** `frontpage.json`: the editor's order, and only the editor's. */
export declare function loadFront(root?: string): string[];
export declare function loadSnapshot(root?: string): MagazineSnapshot;
/** One story, or null when it is gone or unreadable. */
export declare function loadStory(storyId: string, root?: string): Story | null;
/**
 * Typographic characters feeds love, folded to what an Amiga and a C64 can
 * show, then anything left outside Latin-1 becomes `?`. The reader prints
 * other people's text, so this is the paint boundary (the TIP door does the
 * same for the same reason).
 */
export declare function paintSafe(text: string): string;
/** Stories per calendar day, oldest first: the data behind the desk sparkline. */
export declare function storiesPerDay(entries: readonly MagazineIndexEntry[], days: number): number[];
/**
 * Stories whose headline or summary contain every word of the query, in the magazine's own page order.
 */
export declare function searchStories(entries: readonly MagazineIndexEntry[], query: string, load?: (storyId: string) => Story | null, limit?: number): MagazineIndexEntry[];
//# sourceMappingURL=library.d.ts.map