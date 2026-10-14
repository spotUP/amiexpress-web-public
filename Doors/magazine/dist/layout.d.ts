import { sourceName, type Desk, type Story } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { type ColumnGeometry } from './columns';
import { type FillerOptions } from './filler';
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
    /** Rows of art above the panel (0 for none); the panel below it is that much shorter. */
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
export declare function buildLayout(width: number, height: number, options?: {
    ticker?: boolean;
    banner?: number;
}): MagLayout;
/**
 * What a feed story shows in a list besides its headline: the cleaned teaser,
 * the site it came from and how old it is. A story that carries this is a WIRE
 * row; one that does not is a plain headline row (an authored story).
 */
export interface WireLine {
    teaser: string;
    source: string;
    stamp: string;
}
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
    /** Shown to the sysop only, in the lists that are not the front page: this story is on it. */
    front?: boolean;
    wire?: WireLine;
    /** A story with real full text: tagged ARTICLE so the list tells it from the wire. */
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
/** One line cut at a word boundary to `width`; `..` marks a cut. */
export declare function trimAtWord(text: string, width: number): string;
export { sourceName };
/** `TODAY`, `YESTERDAY`, `3D AGO`, else the date: how old a wire row is. */
export declare function wireStamp(date: string, now: Date): string;
/**
 * The detail panel of a wire row, as plain lines: the cleaned teaser in full,
 * the site and the date. No address: the reader never shows a raw URL (the
 * story keeps it in the data).
 */
export declare function wireDetail(story: Pick<Story, 'headline' | 'summary' | 'source' | 'date'>, now: Date): string[];
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
/** The front page when no human has approved anything yet. Never a guess. */
export declare function buildAwaitingEditor(layout: MagLayout): PanelRow[];
export interface Article {
    /** Each spread is exactly `panelHeight` rows. */
    spreads: PanelRow[][];
    /** Row of the headline's first line inside spread 0, for the one-shot glitch. */
    headlineRow: number;
    /** How many rows the headline takes. */
    headlineRows: number;
}
/** `[ NEWS // HACK // 2026-10-13 ]` - a signal tag, not a label. */
export declare function signalTag(story: Pick<Story, 'format' | 'desk' | 'date'>): string;
/** A row of the mark after an article: `raw` as painted, `text` as read (at most one column wide). */
export interface EndMarkRow {
    raw: string;
    text: string;
}
export declare function buildArticle(story: Story, layout: MagLayout, endMark?: readonly EndMarkRow[], fill?: FillerOptions): Article;
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
export declare function sectionLabel(desk: Desk | null): string;
//# sourceMappingURL=layout.d.ts.map