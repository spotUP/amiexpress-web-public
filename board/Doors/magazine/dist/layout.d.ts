import { sourceName, type Desk, type MagazineIndexEntry, type Story } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { type ColumnGeometry } from './columns';
import { type FillerOptions } from './filler';
import { type ArticleMedia } from './pictures';
/** What a run of text MEANS; the app decides what that looks like in the theme. */
export type Role = 'plain' | 'dim' | 'accent' | 'head' | 'rule' | 'tag' | 'source' | 'unread' | 'selected' | 'warn';
export interface Seg {
    /** What a caller reads: width, tests and the glitch work from this. */
    text: string;
    role: Role;
    /** Art: painted as is (it already carries its own colours and escaped braces), `text` being its plain reading. */
    raw?: string;
}
export type PanelRow = Seg[];
/** The plain text of a row: what a C64 caller would read. */
export declare function rowText(row: PanelRow): string;
export interface MagLayout {
    width: number;
    height: number;
    geometry: ColumnGeometry;
    /** True when decoration may move: the ticker, the rail, the headline glitch. */
    effects: boolean;
    /** The 40-column tier: header and footer are one row each, no frames. */
    collapseChrome: boolean;
    headerRow: number;
    /** Rows of art above the panel (0 for none); the panel below it is that much shorter, plus BANNER_GAP_ROWS. */
    bannerRows: number;
    /** Null when the sysop turned the news wire off. Directly above the footer. */
    tickerRow: number | null;
    panelTop: number;
    panelHeight: number;
    progressRow: number;
    footerRow: number;
}
/** A banner may not leave the panel shorter than this: a page of text still has to read. */
export declare const MIN_PANEL_ROWS = 8;
/** Blank rows between a banner and the panel, so the logo never touches the text under it. */
export declare const BANNER_GAP_ROWS = 1;
export declare function buildLayout(width: number, height: number, options?: {
    ticker?: boolean;
    banner?: number;
}): MagLayout;
export interface ArticleLine {
    source: string;
    stamp: string;
}
export interface ListingItem {
    storyId: string;
    page: number;
    title: string;
    unread: boolean;
    bookmarked: boolean;
    /** The lead of the front page: the first story on it, tagged LEAD. */
    lead?: boolean;
    /** The source and age printed under the headline. */
    article?: ArticleLine;
}
export type ListingBlock = {
    kind: 'heading';
    label: string;
} | {
    kind: 'item';
    item: ListingItem;
};
export interface Listing {
    /** Each spread is exactly `panelHeight` rows. */
    spreads: PanelRow[][];
    /** The spread that holds the selected item (0 when none is selected). */
    selectedSpread: number;
    /** Items in reading order, for moving the selection. */
    itemIds: string[];
    /** The first item shown on each spread, for paging the cursor with the page. */
    spreadFirst: Array<string | null>;
    /**
     * Where every item sits: `grid[spread][column][row]` is the index into
     * `itemIds` of the entry that row belongs to, or null for a heading or a gap.
     * Left and Right read it to move to the same visual row in the next column.
     */
    grid: Array<Array<Array<number | null>>>;
}
/**
 * Left or Right in a list: the entry at the same visual row in the
 * neighbouring column, or the nearest entry when that row is a gap or a
 * heading (ties go up). `'edge'` when there is no neighbouring column with an
 * entry in it - the caller turns the page instead. `null` when the selected
 * entry is not on this spread.
 */
export declare function columnStep(columns: ReadonlyArray<ReadonlyArray<number | null>>, selectedIndex: number, delta: -1 | 1): number | 'edge' | null;
export { sourceName };
/** `TODAY`, `YESTERDAY`, `3D AGO`, else the date: how old a story is. */
export declare function ageStamp(date: string, now: Date): string;
/**
 * Blocks to spreads of rows. The first row of every spread is the view header
 * (`headerLeft` / `headerRight`), the rest is the newspaper flow.
 */
export declare function buildListing(blocks: readonly ListingBlock[], selectedStoryId: string | null, layout: MagLayout, header: {
    left: string;
    right: string;
}, fill?: FillerOptions): Listing;
/** `LEFT ........ RIGHT` across the set text. */
export declare function headerLine(left: string, right: string, width: number): string;
/** A centred notice that fills the panel: a title, then lines of detail. */
export declare function buildNotice(layout: MagLayout, title: string, detail: readonly string[]): PanelRow[];
export interface Article {
    /** Each spread is exactly `panelHeight` rows. */
    spreads: PanelRow[][];
    /** Row of the headline's first line inside spread 0, for the one-shot glitch. */
    headlineRow: number;
    /** How many rows the headline takes. */
    headlineRows: number;
    /** Per spread, the story's media indexes of the pictures set on it, in reading order. */
    pictures: number[][];
}
/** `[ NEWS // HACK // 2026-10-13 ]` - a signal tag, not a label. */
export declare function signalTag(story: Pick<Story, 'format' | 'desk' | 'date'>): string;
/** A row of the mark after an article: `raw` as painted, `text` as read (at most one column wide). */
export interface EndMarkRow {
    raw: string;
    text: string;
}
export declare function buildArticle(story: Story, layout: MagLayout, endMark?: readonly EndMarkRow[], fill?: FillerOptions, media?: ArticleMedia): Article;
/**
 * One row that fills as the reader moves through the spreads, with the
 * position written out at every width (`Page 2 of 5`). The bar alone is a
 * full-width rule on a one-spread story and reads as a divider, not progress.
 */
export declare function buildProgress(layout: MagLayout, position: number, total: number): PanelRow;
/** The wire's separator: U+25A0 is a solid block on a C64 (reverse space) and CP437 0xFE. */
export declare const NEWS_SEPARATOR = "  \u25A0  ";
export interface NewsItem {
    source: string;
    title: string;
}
/** `SOURCE // Headline`; just the headline when the feed named no source. */
export declare function newsRow(item: NewsItem): PanelRow;
/** The wire as rows, one per headline; a placeholder when there is none. */
export declare function newsRows(items: readonly NewsItem[]): PanelRow[];
/** A row cut to `width` columns, roles kept. */
export declare function clipRow(row: PanelRow, width: number): PanelRow;
/** The 40-column wire: headline number `n` (wrapping), one margin column, cut to the width. */
export declare function staticNewsRow(items: readonly NewsItem[], n: number, width: number): PanelRow;
/** `SIGNAL ` plus the sparkline, or '' when there is nothing to show. */
export declare function signalStrength(perDay: readonly number[], spark: (n: number[]) => string): string;
/** Section names for the section cycle, in reading order. */
export declare const SECTION_ORDER: readonly Desk[];
/**
 * ALL SECTIONS order: the desks that hold a story, the desk with the freshest
 * story first (ties keep SECTION_ORDER), and inside a desk the newest story
 * first, then page ascending.
 */
export declare function deskGroups(entries: readonly MagazineIndexEntry[]): Array<{
    desk: Desk;
    entries: MagazineIndexEntry[];
}>;
export declare function sectionLabel(desk: Desk | null): string;
//# sourceMappingURL=layout.d.ts.map