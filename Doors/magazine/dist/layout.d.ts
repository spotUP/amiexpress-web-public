import { sourceName, type Desk, type Story } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { type ColumnGeometry } from './columns';
/** What a run of text MEANS; the app decides what that looks like in the theme. */
export type Role = 'plain' | 'dim' | 'accent' | 'head' | 'rule' | 'tag' | 'source' | 'unread' | 'selected' | 'warn';
export interface Seg {
    text: string;
    role: Role;
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
    /** Null when the sysop turned the news wire off. Directly above the footer. */
    tickerRow: number | null;
    panelTop: number;
    panelHeight: number;
    progressRow: number;
    footerRow: number;
}
export declare function buildLayout(width: number, height: number, options?: {
    ticker?: boolean;
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
}
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
}): Listing;
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
export declare function buildArticle(story: Story, layout: MagLayout): Article;
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