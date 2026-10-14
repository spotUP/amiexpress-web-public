/**
 * The reader's screens as rows of text, pure.
 *
 * Nothing here knows about blessed, a theme or a socket. A view is built from
 * data and a screen width into rows of `{ text, role }` segments; the app
 * paints the roles with the active theme's tokens and the tests measure the
 * plain text. That split is what lets the three screens be proven without a
 * terminal: 80x24 pinned, 40x25 within its width, 132x40 in three columns.
 *
 * Regions top to bottom (row numbers from `buildLayout`):
 *   header     the door chrome's masthead (rail and title)
 *   panel      the ONLY region a page turn repaints
 *   progress   one row, filled in proportion to the spread being read
 *   ticker     the news wire, one row: it scrolls where effects are allowed,
 *              and at 40 columns it is one static headline
 *   footer     the door chrome's hint line
 */
import { effectsAllowed, getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { DESK_LABEL, sourceName, type Desk, type Story } from '@amiexpress/bbs-door-sdk/formats/magazine';
import {
  columnGeometry,
  flowColumns,
  setParagraphs,
  type ColumnGeometry,
} from './columns';
import { paintSafe } from './library';

// ---------------------------------------------------------------------------
// Rows and roles
// ---------------------------------------------------------------------------

/** What a run of text MEANS; the app decides what that looks like in the theme. */
export type Role =
  | 'plain'
  | 'dim'
  | 'accent'
  | 'head'
  | 'rule'
  | 'tag'
  | 'source'
  | 'unread'
  | 'selected'
  | 'warn';

export interface Seg {
  text: string;
  role: Role;
}

export type PanelRow = Seg[];

/** The plain text of a row: what a C64 caller would read. */
export function rowText(row: PanelRow): string {
  return row.map((s) => s.text).join('');
}

const seg = (text: string, role: Role = 'plain'): Seg => ({ text, role });

const RULE = '─';
const COLUMN_RULE = '│';

function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  if (width <= 2) return text.slice(0, Math.max(0, width));
  return `${text.slice(0, width - 2)}..`;
}

function padRight(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
}

function centre(text: string, width: number, fill = ' '): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return fill.repeat(left) + text + fill.repeat(width - text.length - left);
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

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

export function buildLayout(width: number, height: number, options: { ticker?: boolean } = {}): MagLayout {
  const w = Math.max(1, Math.floor(width) || 80);
  const h = Math.max(6, Math.floor(height) || 24);
  const effects = effectsAllowed(w);
  const hasTicker = options.ticker !== false;
  const footerRow = h - 1;
  const tickerRow = hasTicker ? footerRow - 1 : null;
  const progressRow = hasTicker ? footerRow - 2 : footerRow - 1;
  const panelTop = 1;
  return {
    width: w,
    height: h,
    geometry: columnGeometry(w),
    effects,
    collapseChrome: getCompactProfile(w).collapseChrome,
    headerRow: 0,
    tickerRow,
    panelTop,
    panelHeight: Math.max(1, progressRow - panelTop),
    progressRow,
    footerRow,
  };
}

// ---------------------------------------------------------------------------
// Composing a spread of cells into panel rows
// ---------------------------------------------------------------------------

interface Cell {
  text: string;
  role: Role;
  /** Which listing item this row belongs to (listings only). */
  item?: number;
  /** Not the last row of its entry: a column or page break may not fall after it. */
  keep?: boolean;
}

/** One panel row: margin, then each column padded to the measure, a rule between. */
function composeRow(geometry: ColumnGeometry, cells: Array<Cell | undefined>): PanelRow {
  const { colWidth, gutter, margin } = geometry;
  const row: PanelRow = [];
  if (margin > 0) row.push(seg(' '.repeat(margin)));
  cells.forEach((cell, c) => {
    if (c > 0 && gutter > 0) {
      const pad = Math.floor((gutter - 1) / 2);
      row.push(seg(`${' '.repeat(pad)}${COLUMN_RULE}${' '.repeat(gutter - 1 - pad)}`, 'dim'));
    }
    row.push(seg(padRight(cell?.text ?? '', colWidth), cell?.role ?? 'plain'));
  });
  return row;
}

function composeSpread(geometry: ColumnGeometry, columns: Cell[][], rows: number): PanelRow[] {
  const out: PanelRow[] = [];
  for (let r = 0; r < rows; r++) out.push(composeRow(geometry, columns.map((col) => col[r])));
  return out;
}

/** A row that spans every column: kicker, headline, rule. */
function spanRow(geometry: ColumnGeometry, text: string, role: Role): PanelRow {
  const row: PanelRow = [];
  if (geometry.margin > 0) row.push(seg(' '.repeat(geometry.margin)));
  row.push(seg(padRight(text, geometry.contentWidth), role));
  return row;
}

function blankRows(n: number): PanelRow[] {
  return Array.from({ length: Math.max(0, n) }, () => []);
}

// ---------------------------------------------------------------------------
// Listings: Front page, Contents, Section, Bookmarks
// ---------------------------------------------------------------------------

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

export type ListingBlock =
  | { kind: 'heading'; label: string }
  | { kind: 'item'; item: ListingItem };

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

/** Digits a page number is right-aligned in. */
const PAGE_DIGITS = 3;

function itemCells(item: ListingItem, index: number, selected: boolean, colWidth: number): Cell[] {
  const titleWidth = Math.max(1, colWidth - 1 - 1 - PAGE_DIGITS);
  const prefix = `${item.lead ? 'LEAD ' : item.front ? '^ ' : ''}${item.bookmarked ? '* ' : ''}`;
  const lines = wrapTitle(prefix + paintSafe(item.title), titleWidth, 2);
  const role: Role = selected ? 'selected' : item.unread ? 'unread' : 'plain';
  const mark = selected ? '>' : ' ';
  const page = String(item.page).padStart(PAGE_DIGITS, ' ');
  const cells: Cell[] = [];
  const wire = item.wire;
  lines.forEach((line, i) => {
    const left = padRight(line, titleWidth);
    cells.push({
      text: i === 0 ? `${mark}${left} ${page}` : ` ${left}`,
      role,
      item: index,
      keep: wire !== undefined || item.article !== undefined || i < lines.length - 1,
    });
  });
  if (wire) {
    // A wire row: headline, one teaser line cut at a word, then where and when.
    const inner = Math.max(1, colWidth - 1);
    const teaser = trimAtWord(paintSafe(wire.teaser), inner);
    if (teaser) cells.push({ text: ` ${teaser}`, role: 'plain', item: index, keep: true });
    const origin = `${paintSafe(sourceName(wire.source)).toUpperCase()} // ${wire.stamp}`;
    cells.push({ text: ` ${truncate(origin, inner)}`, role: 'dim', item: index });
  }
  if (item.article) {
    const inner = Math.max(1, colWidth - 1);
    const tag = `ARTICLE // ${paintSafe(sourceName(item.article.source)).toUpperCase()} // ${item.article.stamp}`;
    cells.push({ text: ` ${truncate(tag, inner)}`, role: 'dim', item: index });
  }
  return cells;
}

/** One line cut at a word boundary to `width`; `..` marks a cut. */
export function trimAtWord(text: string, width: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= width) return flat;
  const room = Math.max(1, width - 2);
  const cut = flat.slice(0, room + 1);
  const at = cut.lastIndexOf(' ');
  const head = at > 0 ? cut.slice(0, at) : flat.slice(0, room);
  return `${head.replace(/[\s,;:.-]+$/, '')}..`;
}

export { sourceName };

/** `TODAY`, `YESTERDAY`, `3D AGO`, else the date: how old a wire row is. */
export function wireStamp(date: string, now: Date): string {
  const day = date.slice(0, 10);
  const then = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(then)) return 'UNDATED';
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - then) / 86_400_000);
  if (days < 0) return day;
  if (days === 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  return days < 7 ? `${days}D AGO` : day;
}

/**
 * The detail panel of a wire row, as plain lines: the cleaned teaser in full,
 * the site and the date. No address: the reader never shows a raw URL (the
 * story keeps it in the data).
 */
export function wireDetail(story: Pick<Story, 'headline' | 'summary' | 'source' | 'date'>, now: Date): string[] {
  const teaser = paintSafe(story.summary).replace(/\s+/g, ' ').trim();
  return [
    paintSafe(story.headline),
    '',
    teaser || '(no summary)',
    '',
    `Source: ${paintSafe(sourceName(story.source)) || 'unknown'}`,
    `Date: ${story.date ? story.date.slice(0, 10) : 'UNDATED'} (${wireStamp(story.date ?? '', now).toLowerCase()})`,
  ];
}

/** Wrap a title onto at most `maxLines` rows; the last is cut with `..` if there is more. */
function wrapTitle(text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) { line = next; continue; }
    if (line) lines.push(line);
    line = word.length > width ? word.slice(0, width) : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = truncate(`${kept[maxLines - 1]} ${lines[maxLines]}`, width);
    return kept;
  }
  return lines.length ? lines : [''];
}

/** `--- LABEL ---` centred across one column. */
function headingCell(label: string, colWidth: number): Cell {
  const inner = ` ${truncate(label, Math.max(1, colWidth - 6))} `;
  return { text: centre(inner, colWidth, RULE), role: 'accent' };
}

/**
 * Blocks to spreads of rows. The first row of every spread is the view header
 * (`headerLeft` / `headerRight`), the rest is the newspaper flow.
 */
export function buildListing(
  blocks: readonly ListingBlock[],
  selectedStoryId: string | null,
  layout: MagLayout,
  header: { left: string; right: string },
): Listing {
  const { geometry } = layout;
  const itemIds: string[] = [];
  const cells: Cell[] = [];
  // The one place entry rows are built: a blank row sits between two entries
  // that follow each other directly (sysop 2026-10-13: "too busy"). The gap is
  // an ordinary blank cell, so the flow drops it at the top of a column and a
  // heading keeps its own spacing.
  let afterItem = false;
  for (const block of blocks) {
    if (block.kind === 'heading') {
      cells.push({ ...headingCell(block.label, geometry.colWidth), item: -1 });
      afterItem = false;
      continue;
    }
    if (afterItem) cells.push({ text: '', role: 'plain' });
    afterItem = true;
    const index = itemIds.length;
    itemIds.push(block.item.storyId);
    cells.push(...itemCells(block.item, index, block.item.storyId === selectedStoryId, geometry.colWidth));
  }

  const bodyHeight = Math.max(1, layout.panelHeight - 1);
  const flowed = flowColumns<Cell>(cells, geometry.cols, { first: bodyHeight, rest: bodyHeight }, {
    isBlank: (c) => c.text === '' && c.item === undefined,
    keepWithNext: (c) => c.item === -1 || c.keep === true,
  });

  const selectedIndex = selectedStoryId ? itemIds.indexOf(selectedStoryId) : -1;
  let selectedSpread = 0;
  const spreadFirst: Array<string | null> = [];
  const spreads = flowed.map((spread, n) => {
    const firstCell = spread.columns.flat().find((c) => c.item !== undefined && c.item >= 0);
    spreadFirst.push(firstCell?.item !== undefined ? itemIds[firstCell.item] : null);
    if (selectedIndex >= 0 && spread.columns.some((col) => col.some((c) => c.item === selectedIndex))) {
      selectedSpread = n;
    }
    const head = spanRow(geometry, headerLine(header.left, header.right, geometry.contentWidth), 'dim');
    return [head, ...composeSpread(geometry, spread.columns, bodyHeight)];
  });
  return { spreads, selectedSpread, itemIds, spreadFirst };
}

/** `LEFT ........ RIGHT` across the set text. */
export function headerLine(left: string, right: string, width: number): string {
  // `right` is the door's own (the sparkline is not Latin-1); only `left` can carry story text.
  const l = paintSafe(left);
  const r = right;
  if (l.length + r.length + 1 > width) return truncate(l, width);
  return l + ' '.repeat(width - l.length - r.length) + r;
}

/** A centred notice that fills the panel: a title, then lines of detail. */
export function buildNotice(layout: MagLayout, title: string, detail: readonly string[]): PanelRow[] {
  const { geometry, panelHeight } = layout;
  const w = geometry.contentWidth;
  const rows: PanelRow[] = blankRows(panelHeight);
  const top = Math.max(0, Math.floor(panelHeight / 2) - 2);
  const put = (r: number, text: string, role: Role) => {
    if (r >= 0 && r < panelHeight) rows[r] = spanRow(geometry, centre(truncate(text, w), w), role);
  };
  put(top, RULE.repeat(Math.min(w, 24)), 'rule');
  put(top + 1, title, 'warn');
  detail.forEach((line, i) => put(top + 2 + i, line, 'dim'));
  return rows;
}

/** The front page when no human has approved anything yet. Never a guess. */
export function buildAwaitingEditor(layout: MagLayout): PanelRow[] {
  return buildNotice(layout, 'AWAITING EDITOR', [
    'No story has been approved',
    'for the front page.',
    'Press C for the full contents.',
  ]);
}

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

export interface Article {
  /** Each spread is exactly `panelHeight` rows. */
  spreads: PanelRow[][];
  /** Row of the headline's first line inside spread 0, for the one-shot glitch. */
  headlineRow: number;
  /** How many rows the headline takes. */
  headlineRows: number;
}

/** `[ NEWS // HACK // 2026-10-13 ]` - a signal tag, not a label. */
export function signalTag(story: Pick<Story, 'format' | 'desk' | 'date'>): string {
  const date = story.date ? story.date.slice(0, 10) : 'UNDATED';
  return `[ ${story.format} // ${deskCode(story.desk)} // ${date} ]`;
}

function deskCode(desk: Desk): string {
  return desk.toUpperCase();
}

const HEADLINE_MAX_ROWS = 3;

export function buildArticle(story: Story, layout: MagLayout): Article {
  const { geometry, panelHeight } = layout;
  const w = geometry.contentWidth;

  const kicker = spanRow(geometry, truncate(signalTag(story), w), 'tag');
  const headLines = wrapTitle(paintSafe(story.headline).toUpperCase(), w, HEADLINE_MAX_ROWS);
  const head: PanelRow[] = [
    kicker,
    ...headLines.map((line) => spanRow(geometry, line, 'head')),
    spanRow(geometry, RULE.repeat(w), 'rule'),
  ];

  // A story with full text is set from its body; the summary is the teaser the
  // body replaces, not a standfirst printed above it.
  const paragraphs = paintSafe(story.body || story.summary).split(/\n+/);
  const body = setParagraphs(paragraphs, geometry.colWidth);
  const cells: Cell[] = body.map((text) => ({ text, role: 'plain' }));
  // The site name only: the reader never prints an address.
  const source = paintSafe(sourceName(story.source)).trim();
  const trailer: Cell[] = [];
  if (source) trailer.push({ text: truncate(`>> SRC ${source}`, geometry.colWidth), role: 'source' });
  if (cells.length === 0) cells.push({ text: '(no summary)', role: 'dim' });
  if (trailer.length) cells.push({ text: '', role: 'plain' }, ...trailer);

  const firstHeight = Math.max(1, panelHeight - head.length);
  const restHeight = Math.max(1, panelHeight - 1);
  const flowed = flowColumns<Cell>(cells, geometry.cols, { first: firstHeight, rest: restHeight }, {
    isBlank: (c) => c.text === '',
  });

  const running = truncate(paintSafe(story.headline).toUpperCase(), w);
  const spreads = flowed.map((spread, n) => {
    if (n === 0) {
      const rows = [...head, ...composeSpread(geometry, spread.columns, firstHeight)];
      return rows.slice(0, panelHeight);
    }
    return [spanRow(geometry, running, 'dim'), ...composeSpread(geometry, spread.columns, restHeight)]
      .slice(0, panelHeight);
  });
  return { spreads, headlineRow: 1, headlineRows: headLines.length };
}

// ---------------------------------------------------------------------------
// Progress, ticker, desk signal
// ---------------------------------------------------------------------------

/**
 * One row that fills as the reader moves through the spreads, with the
 * position written out at every width (`Page 2 of 5`). The bar alone is a
 * full-width rule on a one-spread story and reads as a divider, not progress.
 */
export function buildProgress(layout: MagLayout, position: number, total: number): PanelRow {
  const w = layout.width;
  const safeTotal = Math.max(1, total);
  const at = Math.min(Math.max(0, position), safeTotal - 1);
  const counter = ` Page ${at + 1} of ${safeTotal}`;
  const line = Math.max(1, w - 1 - counter.length);
  const filled = Math.max(1, Math.round((line * (at + 1)) / safeTotal));
  const row: PanelRow = [seg(RULE.repeat(filled), 'accent')];
  if (line - filled > 0) row.push(seg(RULE.repeat(line - filled), 'dim'));
  if (counter) row.push(seg(counter, 'dim'));
  return row;
}

/** The wire's separator: U+25A0 is a solid block on a C64 (reverse space) and CP437 0xFE. */
export const NEWS_SEPARATOR = '  \u25A0  ';

export interface NewsItem {
  source: string;
  title: string;
}

const cleanNews = (text: string): string =>
  paintSafe(text).replace(/\s+/g, ' ').trim().replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'));

/** `SOURCE // Headline`; just the headline when the feed named no source. */
export function newsRow(item: NewsItem): PanelRow {
  const source = cleanNews(item.source).toUpperCase();
  const title = cleanNews(item.title);
  return source ? [seg(source, 'source'), seg(' // ', 'dim'), seg(title, 'dim')] : [seg(title, 'dim')];
}

/** The wire as rows, one per headline; a placeholder when there is none. */
export function newsRows(items: readonly NewsItem[]): PanelRow[] {
  const rows = items.map(newsRow).filter((r) => rowText(r).trim() !== '');
  return rows.length ? rows : [[seg('NO TRANSMISSIONS', 'dim')]];
}

/** A row cut to `width` columns, roles kept. */
export function clipRow(row: PanelRow, width: number): PanelRow {
  const out: PanelRow = [];
  let left = Math.max(0, width);
  for (const part of row) {
    if (left <= 0) break;
    out.push(part.text.length <= left ? part : seg(part.text.slice(0, left), part.role));
    left -= part.text.length;
  }
  return out;
}

/** The 40-column wire: headline number `n` (wrapping), one margin column, cut to the width. */
export function staticNewsRow(items: readonly NewsItem[], n: number, width: number): PanelRow {
  const rows = newsRows(items);
  const at = ((n % rows.length) + rows.length) % rows.length;
  return clipRow([seg(' '), ...rows[at]], width);
}

/** `SIGNAL ` plus the sparkline, or '' when there is nothing to show. */
export function signalStrength(perDay: readonly number[], spark: (n: number[]) => string): string {
  return perDay.length > 1 ? `SIGNAL ${spark([...perDay])}` : '';
}

/** Section names for the section cycle, in reading order. */
export const SECTION_ORDER: readonly Desk[] = [
  'hack', 'scene', 'graffiti', 'music', 'people', 'archive', 'stream', 'general',
];

export function sectionLabel(desk: Desk | null): string {
  return desk ? DESK_LABEL[desk] : 'ALL SECTIONS';
}
