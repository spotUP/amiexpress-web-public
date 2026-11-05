import { type MagazineIndexEntry, type Story, type StoryMediaSidecar } from '@amiexpress/bbs-door-sdk/formats/magazine';
/** `<bbsRoot>/Magazine`, found the way every other board path is found. */
export declare function magazineRoot(startDir?: string): string;
/** What the reader needs from one read of the magazine. */
export interface MagazineSnapshot {
    /** Every published story, in page order. */
    index: MagazineIndexEntry[];
}
/**
 * Is this story shown to a caller? Only an article is: the SDK's `isArticle`,
 * the same predicate the board's publisher uses to give a story a page. A
 * story that is gone, a teaser, or one still waiting for its text is hidden.
 */
export declare function isListed(storyId: string, root?: string): boolean;
/** `index.json`, entries that do not have the shape dropped and stories that are not articles hidden. */
export declare function loadIndex(root?: string): MagazineIndexEntry[];
/**
 * The ticker's material: the newest headlines of EVERY story in the store,
 * teasers included. A ticker scrolls past; it is not a list a caller opens, so
 * a headline with no article behind it is still news worth a glance.
 */
export declare function loadTickerItems(limit: number, root?: string): Array<{
    source: string;
    title: string;
}>;
export declare function loadSnapshot(root?: string): MagazineSnapshot;
/** One story, or null when it is gone or unreadable. */
export declare function loadStory(storyId: string, root?: string): Story | null;
/** The story's picture sidecar (`<id>.media.json`), or null when it has none or it is unreadable. */
export declare function loadSidecar(storyId: string, root?: string): StoryMediaSidecar | null;
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