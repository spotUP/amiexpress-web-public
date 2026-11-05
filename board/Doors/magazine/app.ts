/**
 * MAG - the reader for THE UNKNOWN FREQUENCY.
 *
 * The screens are built as rows by the pure modules (columns.ts, layout.ts);
 * this file owns the terminal: the blessed boxes, the keys, the storage, and
 * the few moving parts. The one rule it is written around is that a page turn
 * repaints the PANEL and the progress row, nothing else (door-three-screens,
 * section 0): each region is a single box whose content is replaced, the
 * widget tree is never rebuilt, and blessed's differential rendering ships
 * only the cells that changed.
 *
 * Everything that moves is gated by `effectsAllowed(width)` through the
 * layout: the rail, the scrolling news wire and the headline glitch do not
 * exist at 40 columns, where the wire is one static headline that changes on
 * each view change or page turn.
 */
import { createScreen, createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
import * as path from 'path';
import { readDoorSettings, resolveDoorRoot } from '@amiexpress/bbs-door-sdk/settings';
import {
  themeById,
  themeStyles,
  attachDoorChrome,
  footerStyle,
  glitchLines,
  UPROUGH_NEON,
  type FooterHint,
  type Theme,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import {
  calculateDialogWidth,
  docModal,
  searchModal,
  sparklineText,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { FULLSCREEN_COLS, FULLSCREEN_ROWS, DESK_LABEL, FRONT_PAGE, FRONT_PAGE_LABEL, MAGAZINE_TITLE, PAGE_FAMILIES, coverEntries, type Desk, type MagazineIndexEntry, type Story, type StoryMediaSidecar } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { createScrollText } from '@amiexpress/bbs-door-sdk';
import { PageSearch, rangeSpace } from '@amiexpress/bbs-door-sdk/teletext/page-search';
import {
  SECTION_ART,
  artKindFor,
  artRowText,
  artRows,
  boardVariantDir,
  loadArt,
  slotFiles,
  shippedArtDir,
  type ArtSources,
} from './art';
import { loadFiller } from './filler';
import { frameRows, fullscreenRows, mediaCredit } from './pictures';
import { startPlayer, type Player } from './player';
import {
  loadSnapshot,
  loadTickerItems,
  loadSidecar,
  loadStory,
  magazineRoot,
  paintSafe,
  searchStories,
  storiesPerDay,
  type MagazineSnapshot,
} from './library';
import {
  SECTION_ORDER,
  deskGroups,
  buildArticle,
  buildLayout,
  buildListing,
  buildNotice,
  buildProgress,
  columnStep,
  rowText,
  sectionLabel,
  signalStrength,
  newsRows,
  staticNewsRow,
  ageStamp,
  NEWS_SEPARATOR,
  type NewsItem,
  type ListingBlock,
  type MagLayout,
  type PanelRow,
  type Seg,
} from './layout';

interface DoorSession {
  bbs: any;
  bbsSession?: { doorCommand?: string; texttvMode?: boolean };
  storage: { load<T>(key: string): Promise<T | null>; save(key: string, data: any): Promise<void> };
}

export const READ_KEY = 'read-story-ids';
export const BOOKMARK_KEY = 'bookmark-story-ids';
const STORED_CAP = 500;
const TICKER_HEADLINES = 8;
/** 8 cells per second: a readable marquee that costs one row per frame. */
const TICKER_STEP_MS = 125;
const SIGNAL_DAYS = 8;
/** The headline settles for this long before the one glitch lands. */
const GLITCH_DELAY_MS = 450;
const GLITCH_HOLD_MS = 160;
/** The goodbye is a glimpse: a key or this long, then the call ends. */
const GOODBYE_MS = 1500;
/** The mark after an article is small. */
const END_MARK_MAX_ROWS = 3;

export { MAGAZINE_TITLE };

export const HINTS: readonly FooterHint[] = [
  { key: 'Arrows', does: 'Page' },
  { key: 'C', does: 'Contents' },
  { key: 'F', does: 'Front' },
  { key: 'S', does: 'Section' },
  { key: 'B', does: 'Bookmark' },
  { key: 'V', does: 'View' },
  { key: '/', does: 'Search' },
  { key: '?', does: 'Help', keep: true },
  { key: 'Q', does: 'Quit', keep: true },
];

/** Forty columns: only what a caller cannot guess. */
export const COMPACT_HINTS: readonly FooterHint[] = [
  { key: 'C', does: 'Contents' },
  { key: '?', does: 'Help', keep: true },
  { key: 'Q', does: 'Quit', keep: true },
];

export const HELP_TEXT = [
  'Page Up, Page Down, Space               turn the page',
  'Arrow keys in a story                   turn the page',
  'Up and Down in a list                   move the cursor',
  'Left and Right in a list                move between columns',
  'Enter                                   open the story',
  'Escape                                  back, then quit',
  'C   contents of every section',
  'F   the front page (the newest stories)',
  'S   next section',
  'B   bookmark or unbookmark a story',
  'K   your bookmarks',
  '/   search headlines and summaries',
  'V   view the pictures on this page full screen',
  '    (Left and Right step through them; Escape or Q returns)',
  '0-9 type a page number (100-999); Escape cancels',
  'Q   quit',
].join('\n');


type View =
  | { kind: 'front' }
  | { kind: 'contents'; desk: Desk | null }
  | { kind: 'bookmarks' }
  | { kind: 'article'; storyId: string; list: string[]; back: View };

export interface Reader {
  screen: any;
  /** The layout now: it changes with the banner each view carries. */
  readonly layout: MagLayout;
  /** The plain text of the banner above the panel now ([] for none). */
  bannerText(): string[];
  /** The plain text of the full-screen art on top of everything ([] when none is up). */
  overlayText(): string[];
  /** Resolves when the caller leaves. */
  done: Promise<void>;
  /** Feed a key as the terminal would: `press('down')`, `press('c', 'c')`. */
  press(name: string, ch?: string): void;
  /** The plain text of the panel rows on screen now. */
  panelRows(): string[];
  /** The plain text of the progress row. */
  progressRow(): string;
  /** The plain text of the footer row (hints and status), tags stripped. */
  footerRow(): string;
  /** The plain text of the news wire row now, tags stripped ('' when the sysop turned it off). */
  tickerRow(): string;
  /** The kind of view on screen. */
  viewKind(): View['kind'];
  /** The viewer's rows as text (the last one is the status row), or null when it is closed. */
  viewerRows(): string[] | null;
  /** The reader's current spread. */
  spreadNo(): number;
  /** What actually ran: sentinels for the tests that prove the effects are wired. */
  stats(): { glitches: number; tickerSteps: number; intervals: number; banners: number; searchTicks: number; lands: number };
  /** The plain text of the row the page counter rolls in (the progress row), tags stripped. */
  counterRow(): string;
  stop(): void;
}

function escapeTags(text: string): string {
  return text.replace(/[{}]/g, (c) => (c === '{' ? '{open}' : '{close}'));
}

function readEdition(index: readonly MagazineIndexEntry[]): string {
  let latest = '';
  for (const e of index) if (e.date > latest) latest = e.date;
  return latest.slice(0, 10);
}

export interface ReaderOptions {
  /** Where the shipped placeholder art is; null for none. Default: the door's own art/ directory. */
  shippedArtDir?: string | null;
  /** Slot name to file, as `slotFiles` makes it. Default: from the door's saved settings (only with the default art folder). */
  slots?: Record<string, string>;
  /** Where the Studio's C64 drawings are. Default: the board's `Screens/doors/MAG` (only with the default art folder). */
  variantDir?: string | null;
}

export async function startReader(session: DoorSession, options: ReaderOptions = {}): Promise<Reader> {
  const { bbs, storage } = session;
  const theme: Theme = bbs?.getTheme ? bbs.getTheme() : (themeById('uprough-neon') ?? UPROUGH_NEON);
  const t = theme.tokens;
  const s = themeStyles(theme);

  let showTicker = true;
  try {
    const v = readDoorSettings(__dirname) as Record<string, unknown>;
    if (v.show_ticker === false) showTicker = false;
  } catch { /* defaults stand */ }

  const loadList = async (key: string): Promise<Set<string>> => {
    try {
      const stored = await storage.load<string[]>(key);
      return new Set(Array.isArray(stored) ? stored.filter((x) => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  };
  const read = await loadList(READ_KEY);
  const bookmarks = await loadList(BOOKMARK_KEY);
  const persist = (key: string, set: Set<string>) => {
    storage.save(key, [...set].slice(-STORED_CAP)).catch(() => { /* kept in memory for this visit */ });
  };

  const screen = createScreen(bbs, { title: MAGAZINE_TITLE }) as any;
  const width = (screen.width as number) || 80;
  const height = (screen.height as number) || 24;
  let layout = buildLayout(width, height, { ticker: showTicker });
  // Which alphabet this caller reads: the session knows (createScreen asks it too).
  const petscii = typeof bbs?.isPetsciiMode === 'function' && bbs.isPetsciiMode() === true;
  // A test that points the reader at its own art folder gets no slots and no C64 drawings unless it passes them.
  const ownArt = options.shippedArtDir !== undefined;
  let slots: Record<string, string> = options.slots ?? {};
  if (!ownArt) {
    try { slots = slotFiles(readDoorSettings(__dirname) as Record<string, unknown>, resolveDoorRoot(__dirname)); } catch { /* every slot keeps its default file */ }
  }
  const artSources: ArtSources = {
    shippedDir: ownArt ? (options.shippedArtDir ?? null) : shippedArtDir(),
    slots,
    // Where the Studio's C64 tab saves a drawing: <board root>/Screens/doors/MAG.
    variantDir: options.variantDir !== undefined
      ? options.variantDir
      : ownArt ? null : boardVariantDir(__dirname),
    // A caller who answered T: the session says so, as it does for GLC's logo.
    teletext: session.bbsSession?.texttvMode === true,
  };
  const artKind = artKindFor(petscii, width);
  /** Mortimer's clipart for empty column space; a caller that reads PETSCII only gets pieces that map. */
  const fillerPieces = loadFiller(artSources, artKind === 'seq');
  /** One piece of art as rows of content for this caller, [] when there is none. */
  const artFor = (name: string, maxRows: number, maxCols: number = width): string[] => {
    const art = loadArt(name, artKind, artSources);
    return art ? artRows(art, maxRows, artKind === 'seq' ? Math.min(maxCols, 40) : maxCols) : [];
  };

  const input = new DoorInputManager(session as any, screen, {
    enableGameMode: false,
    enableGrabKeys: false,
    enableMouse: false,
    // Ctrl+C and a Ctrl+K palette pick end the call at once through the
    // same teardown Q reaches after its goodbye art.
    onClose: () => finish(),
  });
  input.enable();

  const row = (top: number, extra: Record<string, unknown> = {}) => createBox({
    parent: screen,
    top,
    left: 0,
    width: '100%',
    height: 1,
    border: undefined,
    focusable: false,
    clickable: false,
    mouse: false,
    tags: true,
    content: '',
    style: { fg: t.dim, bg: t.ground },
    ...extra,
  } as never) as any;

  const mastheadRow = row(layout.headerRow);
  const tickerBox = layout.tickerRow === null ? null : row(layout.tickerRow);
  const panel = createBox({
    parent: screen,
    top: layout.panelTop,
    left: 0,
    width: '100%',
    height: layout.panelHeight,
    border: undefined,
    focusable: false,
    clickable: false,
    mouse: false,
    tags: true,
    content: '',
    style: { fg: t.ink, bg: t.ground },
  } as never) as any;
  // The banner: art above the panel, drawn when a view is entered and never again.
  const bannerBox = row(1);
  bannerBox.hide();
  let bannerKey = '';
  let bannerLines: string[] = [];
  const progressBox = row(layout.progressRow);
  const footerRow = createBox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    border: undefined,
    focusable: false,
    clickable: false,
    mouse: false,
    style: footerStyle(theme),
    content: '',
  } as never) as any;

  const render = () => screen.render();
  const chrome = attachDoorChrome(theme, {
    width,
    title: layout.collapseChrome ? MAGAZINE_TITLE : `${MAGAZINE_TITLE} // SIGNAL TERMINAL`,
    masthead: mastheadRow,
    footer: footerRow,
    hints: HINTS,
    compactHints: COMPACT_HINTS,
    footerPad: ' ',
    styles: s,
    render,
  } as never);

  // ---- painting --------------------------------------------------------

  const paintSeg = (seg: Seg): string => {
    if (seg.raw !== undefined) return seg.raw;
    if (!seg.text) return '';
    const text = escapeTags(seg.text);
    switch (seg.role) {
      case 'dim': return s.dim(text);
      case 'accent': case 'rule': case 'unread': return s.accent(text);
      case 'tag': case 'source': return s.accentAlt(text);
      case 'head': return `{bold}${s.ink(text)}{/bold}`;
      case 'warn': return s.warn(text);
      case 'selected':
        return `{${t.selectionBg}-bg}{${t.selectionInk}-fg}${text}{/${t.selectionInk}-fg}{/${t.selectionBg}-bg}`;
      default: return text;
    }
  };
  const paintRow = (r: PanelRow): string => r.map(paintSeg).join('');

  // ---- state -----------------------------------------------------------

  let snapshot: MagazineSnapshot = { index: [] };
  let view: View = { kind: 'front' };
  let spreads: PanelRow[][] = [[]];
  let spreadNo = 0;
  /** The open article's pictures per spread, and what the viewer needs to show them. */
  let articlePictures: number[][] = [];
  let articleStory: Story | null = null;
  let articleSidecar: StoryMediaSidecar | null = null;
  let listIds: string[] = [];
  let spreadFirst: Array<string | null> = [];
  let listGrid: Array<Array<Array<number | null>>> = [];
  let selected: string | null = null;
  let headline: { row: number; rows: number } | null = null;
  let panelText = '';
  let glitchTimer: ReturnType<typeof setTimeout> | null = null;
  let repairTimer: ReturnType<typeof setTimeout> | null = null;
  let modalOpen = false;
  const counters = { glitches: 0, tickerSteps: 0, intervals: 0, banners: 0, searchTicks: 0, lands: 0 };
  let stopped = false;
  let finish: () => void = () => { /* replaced below */ };

  const byId = (id: string) => snapshot.index.find((e) => e.storyId === id);

  // One read per story per visit to a view: a cursor move rebuilds the list.
  const storyCache = new Map<string, Story | null>();
  const storyOf = (id: string): Story | null => {
    if (!storyCache.has(id)) storyCache.set(id, loadStory(id, magazineRoot(__dirname)));
    return storyCache.get(id) ?? null;
  };

  const listingBlocks = (entries: readonly MagazineIndexEntry[], headings: boolean): ListingBlock[] => {
    const leadId = view.kind === 'front' ? coverEntries(snapshot.index)[0]?.storyId : undefined;
    const blocks: ListingBlock[] = [];
    const item = (e: MagazineIndexEntry): ListingBlock => {
      // Every listed story is an article (the snapshot holds nothing else): a
      // headline row tagged ARTICLE with its source and age.
      const st = storyOf(e.storyId);
      const stamp = st ? ageStamp(st.date || e.date, new Date()) : '';
      const article = st && st.source
        ? { source: st.source, stamp }
        : undefined;
      return {
        kind: 'item',
        item: {
          storyId: e.storyId,
          page: e.page,
          title: e.title,
          unread: !read.has(e.storyId),
          bookmarked: bookmarks.has(e.storyId),
          lead: view.kind === 'front' && leadId === e.storyId,
          article,
        },
      };
    };
    if (!headings) return entries.map(item);
    for (const { desk, entries: group } of deskGroups(entries)) {
      blocks.push({ kind: 'heading', label: DESK_LABEL[desk] });
      blocks.push(...group.map(item));
    }
    return blocks;
  };

  const spark = (entries: readonly MagazineIndexEntry[]) =>
    layout.effects ? signalStrength(storiesPerDay(entries, SIGNAL_DAYS), sparklineText) : '';

  const headerRight = (entries: readonly MagazineIndexEntry[]) =>
    [spark(entries), readEdition(snapshot.index)].filter(Boolean).join('  ');

  const showListing = (blocks: ListingBlock[], left: string, entries: readonly MagazineIndexEntry[]) => {
    const header = { left, right: headerRight(entries) };
    const fill = { pieces: fillerPieces, key: left };
    let l = buildListing(blocks, selected, layout, header, fill);
    if (selected === null || !l.itemIds.includes(selected)) {
      selected = l.itemIds[0] ?? null;
      l = buildListing(blocks, selected, layout, header, fill);
    }
    listIds = l.itemIds;
    spreadFirst = l.spreadFirst;
    listGrid = l.grid;
    spreads = l.spreads;
    spreadNo = l.selectedSpread;
  };

  const build = () => {
    headline = null;
    if (view.kind === 'front') {
      const entries = coverEntries(snapshot.index);
      if (entries.length === 0) {
        listIds = [];
        selected = null;
        spreads = [buildNotice(layout, 'NO STORIES YET', ['Nothing has been published.'])];
        spreadNo = 0;
        return;
      }
      showListing(
        [{ kind: 'heading', label: FRONT_PAGE_LABEL }, ...listingBlocks(entries, false)],
        'FRONT PAGE - THE NEWEST STORIES',
        entries,
      );
    } else if (view.kind === 'contents') {
      const entries = snapshot.index.filter((e) => view.kind === 'contents' && (!view.desk || e.desk === view.desk));
      if (entries.length === 0) {
        listIds = [];
        selected = null;
        spreads = [buildNotice(layout, 'NO STORIES YET', ['Nothing has been published.'])];
        spreadNo = 0;
        return;
      }
      showListing(listingBlocks(entries, true), `CONTENTS - ${sectionLabel(view.desk)}`, entries);
    } else if (view.kind === 'bookmarks') {
      const entries = [...bookmarks].map(byId).filter((e): e is MagazineIndexEntry => Boolean(e));
      if (entries.length === 0) {
        listIds = [];
        selected = null;
        spreads = [buildNotice(layout, 'NO BOOKMARKS YET', ['Press B on a story to keep it here.'])];
        spreadNo = 0;
        return;
      }
      showListing(listingBlocks(entries, false), 'BOOKMARKS', entries);
    } else {
      const story = loadStory(view.storyId, magazineRoot(__dirname));
      if (!story) {
        spreads = [buildNotice(layout, 'STORY NOT FOUND', ['It has left the archive.'])];
        spreadNo = 0;
        return;
      }
      const mark = artFor('mag_article_end', END_MARK_MAX_ROWS, layout.geometry.colWidth).map((raw) => ({ raw, text: artRowText(raw) }));
      articleSidecar = story.media?.length ? loadSidecar(story.id, magazineRoot(__dirname)) : null;
      const article = buildArticle(story, layout, mark, { pieces: fillerPieces, key: story.id }, {
        sidecar: articleSidecar,
        petscii: artKind === 'seq',
      });
      articleStory = story;
      articlePictures = article.pictures;
      spreads = article.spreads;
      headline = { row: article.headlineRow, rows: article.headlineRows };
      spreadNo = 0;
    }
  };

  const clearGlitch = () => {
    if (glitchTimer) { clearTimeout(glitchTimer); glitchTimer = null; }
    if (repairTimer) { clearTimeout(repairTimer); repairTimer = null; }
  };

  /** Repaint the panel and the progress row. The only thing a page turn does. */
  const paint = () => {
    clearGlitch();
    const rows = spreads[Math.min(spreadNo, spreads.length - 1)] ?? [];
    panelText = rows.map(paintRow).join('\n');
    panel.setContent(panelText);
    progressBox.setContent(paintRow(buildProgress(layout, spreadNo, spreads.length)));
    render();
    scheduleGlitch(rows);
  };

  /** One glitch on the headline as an article opens, then it holds still. */
  const scheduleGlitch = (rows: PanelRow[]) => {
    if (!headline || spreadNo !== 0 || !layout.effects || !theme.glitches) return;
    const target = headline;
    glitchTimer = setTimeout(() => {
      glitchTimer = null;
      const lines = rows.map(paintRow);
      const kinds = ['scramble', 'shift', 'tear', 'invert', 'blocks'] as const;
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const at = target.row + Math.floor(Math.random() * target.rows);
      counters.glitches += 1;
      const damaged = glitchLines(lines, { row: at, kind }, theme, Math.random);
      const truth = panelText;
      panel.setContent(damaged.join('\n'));
      render();
      repairTimer = setTimeout(() => {
        repairTimer = null;
        if (panelText === truth) { panel.setContent(truth); render(); }
      }, GLITCH_HOLD_MS);
    }, GLITCH_DELAY_MS);
  };

  const setStatus = (text: string) => chrome.setFooterSuffix(text ? `  ${text}` : '');

  /** The banner a view carries: the front page and contents have their own, a section its desk's. */
  const bannerNameFor = (v: View): string => {
    if (v.kind === 'front') return 'mag_front';
    if (v.kind === 'contents') return v.desk ? SECTION_ART[v.desk] : 'mag_contents';
    return '';
  };

  /**
   * Put the view's banner up. Called on view entry only: if the same art is
   * already there nothing is touched, and the panel is resized only when the
   * number of banner rows changes. The layout (and so every page break the
   * views compute) takes the rows from the panel.
   */
  const applyBanner = (name: string) => {
    if (name === bannerKey) return;
    bannerKey = name;
    // The banner is as tall as its art; buildLayout drops it when the panel could not keep MIN_PANEL_ROWS.
    const wanted = name ? artFor(name, height) : [];
    const next = buildLayout(width, height, { ticker: showTicker, banner: wanted.length });
    layout = next;
    bannerLines = next.bannerRows > 0 ? wanted.slice(0, next.bannerRows) : [];
    panel.top = next.panelTop;
    panel.height = next.panelHeight;
    if (bannerLines.length === 0) { bannerBox.hide(); return; }
    bannerBox.height = bannerLines.length;
    bannerBox.setContent(bannerLines.join('\n'));
    bannerBox.show();
    counters.banners += 1;
  };

  const go = (next: View, keepSelection = false) => {
    const before = view;
    const beforeSelected = selected;
    try {
      snapshot = loadSnapshot(magazineRoot(__dirname));
      storyCache.clear();
      view = next;
      applyBanner(bannerNameFor(next));
      if (!keepSelection && next.kind !== 'article') selected = null;
      build();
      advanceNews();
      if (next.kind === 'article') {
        read.add(next.storyId);
        persist(READ_KEY, read);
      }
      paint();
    } catch (err) {
      // A view that cannot be built leaves the caller where they were, with the screen they had.
      view = before;
      selected = beforeSelected;
      try { applyBanner(bannerNameFor(before)); build(); paint(); } catch { /* the original error is the one to report */ }
      throw err;
    }
  };

  // ---- ticker ----------------------------------------------------------

  let tickerTimer: ReturnType<typeof setInterval> | null = null;
  let newsItems: NewsItem[] = [];
  let newsAt = -1;
  const loadNews = () => {
    const root = magazineRoot(__dirname);
    newsItems = loadTickerItems(TICKER_HEADLINES, root);
  };
  /** 40 columns: the next headline, painted into the ticker row (flushed by the caller's render). */
  const showStaticNews = () => {
    if (tickerBox) tickerBox.setContent(paintRow(staticNewsRow(newsItems, newsAt, layout.width)));
  };
  const advanceNews = () => {
    if (layout.effects) return;
    newsAt += 1;
    showStaticNews();
  };
  const startTicker = () => {
    if (!tickerBox) return;
    loadNews();
    if (!layout.effects) { showStaticNews(); return; }
    const sep = s.dim(NEWS_SEPARATOR);
    const text = newsRows(newsItems).map(paintRow).join(sep);
    const scroll = createScrollText({ text, width: Math.max(1, layout.width - 2), gap: sep });
    let step = 0;
    const frame = () => tickerBox.setContent(` ${scroll.frame(step)}`);
    frame();
    if (scroll.overflows) {
      counters.intervals += 1;
      // The tick touches the ticker row alone: setContent + the differential
      // render. It must never call paint(), go() or forceFullRedraw().
      tickerTimer = setInterval(() => { step += 1; counters.tickerSteps += 1; frame(); render(); }, TICKER_STEP_MS);
      // A running marquee must not keep the door process alive.
      tickerTimer.unref?.();
    }
  };

  // ---- actions ---------------------------------------------------------

  const move = (delta: number) => {
    if (listIds.length === 0) return;
    const at = Math.max(0, Math.min(listIds.length - 1, (selected ? listIds.indexOf(selected) : 0) + delta));
    selected = listIds[at];
    build();
    paint();
  };

  /**
   * Left and Right in a list: the entry at the same visual row in the next
   * column. At the first or last column (and at 40 columns, which has one) the
   * key turns the page, as it does inside an article.
   */
  const columnMove = (delta: -1 | 1) => {
    const at = selected ? listIds.indexOf(selected) : -1;
    const step = at < 0 ? null : columnStep(listGrid[spreadNo] ?? [], at, delta);
    if (typeof step !== 'number') { page(delta); return; }
    selected = listIds[step];
    build();
    paint();
  };

  const page = (delta: number) => {
    if (view.kind === 'article') {
      const next = spreadNo + delta;
      if (next >= 0 && next < spreads.length) { spreadNo = next; advanceNews(); paint(); return; }
      const at = view.list.indexOf(view.storyId) + delta;
      if (at >= 0 && at < view.list.length) {
        go({ ...view, storyId: view.list[at] });
        if (delta < 0) { spreadNo = spreads.length - 1; paint(); }
      }
      return;
    }
    const next = spreadNo + delta;
    if (next < 0 || next >= spreads.length) return;
    // The cursor goes with the page, so the next key still acts on what is in view.
    const first = spreadFirst[next];
    if (first) selected = first;
    build();
    spreadNo = next;
    advanceNews();
    paint();
  };

  const openStory = (storyId: string, list: string[]) => {
    go({ kind: 'article', storyId, list: list.length ? list : [storyId], back: view.kind === 'article' ? view.back : view });
  };

  const openSelected = () => {
    if (view.kind === 'article' || !selected) return;
    openStory(selected, listIds);
  };

  const back = () => {
    if (view.kind === 'article') { go(view.back, true); return; }
    finish();
  };

  const cycleSection = () => {
    const present = SECTION_ORDER.filter((d) => snapshot.index.some((e) => e.desk === d));
    const order: Array<Desk | null> = [null, ...present];
    const current = view.kind === 'contents' ? view.desk : null;
    const next = order[(order.indexOf(current) + 1) % order.length];
    go({ kind: 'contents', desk: next });
  };

  const toggleBookmark = () => {
    const id = view.kind === 'article' ? view.storyId : selected;
    if (!id) return;
    if (bookmarks.has(id)) { bookmarks.delete(id); setStatus('Bookmark removed'); }
    else { bookmarks.add(id); setStatus('Bookmarked'); }
    persist(BOOKMARK_KEY, bookmarks);
    if (view.kind !== 'article') { build(); paint(); } else render();
  };

  // ---- page numbers ----------------------------------------------------

  /**
   * What a page number is in this magazine: 100 is the front page, a story
   * sits on the page index.json gave it, and the first page of a desk's
   * family (120 for hacking) is that desk's contents when no story took it.
   */
  type PageTarget =
    | { kind: 'front' }
    | { kind: 'story'; storyId: string }
    | { kind: 'desk'; desk: Desk };

  const resolvePage = (n: number): PageTarget | null => {
    if (n === FRONT_PAGE) return { kind: 'front' };
    const entry = snapshot.index.find((e) => e.page === n);
    if (entry) return { kind: 'story', storyId: entry.storyId };
    const desk = (Object.keys(PAGE_FAMILIES) as Desk[]).find((d) => PAGE_FAMILIES[d].first === n);
    return desk ? { kind: 'desk', desk } : null;
  };

  /** The number the caller is on now: where the counter starts rolling from. */
  const currentPage = (): number => {
    if (view.kind === 'article') return byId(view.storyId)?.page ?? FRONT_PAGE;
    if (view.kind === 'contents' && view.desk) return PAGE_FAMILIES[view.desk].first;
    return FRONT_PAGE;
  };

  const showPage = (n: number) => {
    const target = resolvePage(n);
    if (!target) { render(); return; }
    counters.lands += 1;
    if (target.kind === 'front') { go({ kind: 'front' }); return; }
    if (target.kind === 'desk') { go({ kind: 'contents', desk: target.desk }); return; }
    openStory(target.storyId, view.kind === 'article' ? view.list : listIds.length ? listIds : snapshot.index.map((e) => e.storyId));
  };

  /**
   * The header counter is the progress row: one row, replaced in place, so a
   * tick of the search repaints that row and nothing else.
   */
  const restoreProgress = () => {
    progressBox.setContent(paintRow(buildProgress(layout, spreadNo, spreads.length)));
    render();
  };

  const pageSearch = new PageSearch({
    space: rangeSpace(100, 999, String),
    width,
    parse: (typed) => (/^[1-9][0-9]{2}$/.test(typed) ? Number(typed) : null),
    exists: (n) => resolvePage(n) !== null,
    current: currentPage,
    header: (text, phase) => {
      if (phase === 'searching') counters.searchTicks += 1;
      progressBox.setContent(paintSeg({ text, role: phase === 'notfound' ? 'warn' : 'accent' }));
      render();
    },
    restore: restoreProgress,
    land: showPage,
  });

  const modalDone = () => {
    modalOpen = false;
    render();
  };

  const openHelp = () => {
    modalOpen = true;
    const modal = docModal({
      parent: screen,
      title: `${MAGAZINE_TITLE} help`,
      content: HELP_TEXT,
      contentStyle: { fg: t.ink, bg: t.ground },
      footerStyle: { fg: t.ground, bg: t.accent },
      zIndex: 9990,
      onClose: modalDone,
    } as never) as any;
    modal.display();
  };

  const openSearch = () => {
    modalOpen = true;
    let found: MagazineIndexEntry[] = [];
    const modal = searchModal({
      parent: screen,
      title: 'Search the magazine',
      searchLabel: 'Words',
      borderColor: t.accent,
      width: calculateDialogWidth(width),
      zIndex: 9990,
      helpText: 'Enter: search   Tab: results   Escape: close',
      onSearch: (query: string) => {
        found = searchStories(snapshot.index, query);
        modal.setResults(found.map((e) => ({ id: e.storyId, content: `${String(e.page).padStart(3, ' ')} ${escapeTags(paintSafe(e.title))}` })));
      },
      onSelect: (r: { id: string }) => {
        modal.hide();
        modalDone();
        openStory(r.id, found.map((e) => e.storyId));
      },
      onClose: modalDone,
    } as never) as any;
    modal.display();
  };

  // ---- full-screen art: the goodbye on Q ---------------------------------

  let overlayLines: string[] = [];
  let overlayTimer: ReturnType<typeof setTimeout> | null = null;
  let closing = false;

  const clearOverlayTimer = () => {
    if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; }
  };

  /** Art over the whole screen, until the door closes. Returns false when there is no art. */
  const raiseOverlay = (name: string): boolean => {
    const rows = artFor(name, height);
    if (rows.length === 0) return false;
    overlayLines = rows;
    const overlay = createBox({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      border: undefined,
      focusable: false,
      clickable: false,
      mouse: false,
      tags: true,
      content: rows.join('\n'),
      style: { fg: t.ink, bg: t.ground },
    } as never) as any;
    overlay.setFront?.();
    render();
    return true;
  };

  /** Q: a glimpse of the goodbye art where there is some, then the call ends. */
  const quit = () => {
    if (closing) return;
    if (!raiseOverlay('mag_goodbye')) { finish(); return; }
    closing = true;
    clearOverlayTimer();
    overlayTimer = setTimeout(() => finish(), GOODBYE_MS);
    overlayTimer.unref?.();
  };

  // ---- fullscreen viewer (D11) -----------------------------------------

  /** The pictures of the page the caller was reading, and which one is on screen. */
  let viewer: {
    items: number[];
    at: number;
    box: any;
    /** The running video (M10b), and the rows of the frame on screen; null shows the poster. */
    player: Player | null;
    frame: { lines: string[]; plain: string[] } | null;
  } | null = null;

  /** The status row: credit, n/m, keys. One row, cut to the screen. */
  const viewerStatus = (items: readonly number[], at: number): string => {
    const media = articleStory?.media?.[items[at]];
    const credit = media ? mediaCredit(media) : '';
    const replay = media && media.kind !== 'image' && !viewer?.player ? '  Enter' : '';
    return `${credit}  ${at + 1}/${items.length}  <- -> Esc${replay}`.slice(0, layout.width);
  };

  /**
   * The rows of one viewer item. M10b seam: an image shows its fullscreen
   * rendering; a video shows its poster (also a fullscreen rendering) and is
   * where playback will start, so this is the one place a frame source plugs in.
   */
  const viewerItemRows = (mediaIndex: number): { lines: string[]; plain: string[] } => {
    const full = fullscreenRows(articleSidecar, mediaIndex, artKind === 'seq');
    const room = Math.max(0, height - 1);
    const rows = (full?.rows ?? []).slice(0, room);
    const lead = full ? ' '.repeat(Math.max(0, Math.floor((layout.width - full.cols) / 2))) : '';
    return { lines: rows.map((r) => lead + r.raw), plain: rows.map((r) => lead + r.text) };
  };

  let viewerPlain: string[] = [];

  const paintViewer = () => {
    if (!viewer) return;
    const item = viewer.frame ?? viewerItemRows(viewer.items[viewer.at]);
    const status = escapeTags(viewerStatus(viewer.items, viewer.at));
    const blank = Math.max(0, height - 1 - item.lines.length);
    viewer.box.setContent([...item.lines, ...Array(blank).fill(''), s.accentAlt(status)].join('\n'));
    viewerPlain = [...item.plain, ...Array(blank).fill(''), viewerStatus(viewer.items, viewer.at)];
    render();
  };

  /** V: open on the first picture of the current page. No picture here: nothing happens. */
  const openViewer = () => {
    if (view.kind !== 'article') return;
    const items = (articlePictures[spreadNo] ?? []).filter((i) => fullscreenRows(articleSidecar, i, artKind === 'seq'));
    if (items.length === 0) return;
    clearGlitch();
    const box = createBox({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      border: undefined,
      focusable: false,
      clickable: false,
      mouse: false,
      tags: true,
      content: '',
      style: { fg: t.ink, bg: t.ground },
    } as never) as any;
    box.setFront?.();
    viewer = { items, at: 0, box, player: null, frame: null };
    paintViewer();
    startPlayback();
  };

  /** A video auto-plays when shown (D8): live or from the cache, painting a frame only when it changed. */
  const startPlayback = () => {
    if (!viewer) return;
    const media = articleStory?.media?.[viewer.items[viewer.at]];
    if (!media || media.kind === 'image') return;
    const pet = artKind === 'seq';
    const terminal = pet ? 'petscii' : 'ansi';
    const cols = FULLSCREEN_COLS[terminal];
    const lead = Math.max(0, Math.floor((layout.width - cols) / 2));
    const room = Math.max(0, height - 1);
    const mine = viewer;
    const player: Player | null = startPlayer(
      { url: media.url, kind: media.kind === 'embed' ? 'embed' : 'video', cols, rows: FULLSCREEN_ROWS, palette: pet ? 'c64' : 'amiga16', fps: pet ? 5 : 10 },
      {
        onFrame: (cells) => {
          if (viewer !== mine || mine.player !== player) return;
          const rows = frameRows(cells, pet, lead).slice(0, room);
          const next = { lines: rows.map((r) => r.raw), plain: rows.map((r) => r.text) };
          if (mine.frame && mine.frame.lines.join('\n') === next.lines.join('\n')) return;
          mine.frame = next;
          paintViewer();
        },
        onEnd: () => {
          if (viewer !== mine || mine.player !== player) return;
          mine.player = null;
          mine.frame = null;
          paintViewer();
        },
      },
    );
    mine.player = player;
  };

  /** Stepping away, Esc and leaving the door all end playback and its timer. */
  const stopPlayback = () => {
    if (!viewer) return;
    viewer.player?.stop();
    viewer.player = null;
    viewer.frame = null;
  };

  /** Left and Right step through the page's pictures and wrap. */
  const stepViewer = (delta: number) => {
    if (!viewer) return;
    stopPlayback();
    viewer.at = (viewer.at + delta + viewer.items.length) % viewer.items.length;
    paintViewer();
    startPlayback();
  };

  /** Esc or Q: the same reader page comes back (the panel under the box was never touched). */
  const closeViewer = () => {
    if (!viewer) return;
    stopPlayback();
    try { viewer.box.destroy(); } catch { /* leaving anyway */ }
    viewer = null;
    viewerPlain = [];
    paint();
  };

  // ---- keys ------------------------------------------------------------

  /** The key as the page-number machine reads it: a digit, one of three named keys, or anything else. */
  const searchKey = (name: string, c: string): string => {
    if (/^[0-9]$/.test(c)) return c;
    if (name === 'escape') return 'escape';
    if (name === 'backspace') return 'backspace';
    if (name === 'enter' || name === 'return') return 'enter';
    return name || c;
  };

  const dispatchKey = (name: string, ch?: string) => {
    if (!stopped && closing) { finish(); return; }
    const c = (ch ?? '').toLowerCase();
    if (stopped || modalOpen) return;
    if (viewer) {
      if (name === 'left') stepViewer(-1);
      else if (name === 'right') stepViewer(1);
      else if (name === 'enter' || name === 'return') {
        if (!viewer.player) { startPlayback(); paintViewer(); }
      } else if (name === 'escape' || c === 'q') closeViewer();
      return;
    }
    if (pageSearch.feed(searchKey(name, c))) return;
    setStatus('');
    switch (name) {
      case 'up': if (view.kind === 'article') page(-1); else move(-1); return;
      case 'down': if (view.kind === 'article') page(1); else move(1); return;
      case 'left': if (view.kind === 'article') page(-1); else columnMove(-1); return;
      case 'right': if (view.kind === 'article') page(1); else columnMove(1); return;
      case 'pageup': page(-1); return;
      case 'pagedown': case 'space': page(1); return;
      case 'enter': case 'return': openSelected(); return;
      case 'escape': case 'backspace': back(); return;
      default: break;
    }
    switch (c) {
      case 'q': quit(); return;
      case 'c': go({ kind: 'contents', desk: null }); return;
      case 'f': go({ kind: 'front' }); return;
      case 'k': go({ kind: 'bookmarks' }); return;
      case 's': cycleSection(); return;
      case 'b': toggleBookmark(); return;
      case 'v': openViewer(); return;
      case '/': openSearch(); return;
      case '?': case 'h': openHelp(); return;
      default: break;
    }
  };

  /**
   * A key that throws must not vanish: the SDK swallows errors out of a screen
   * handler, so a stale build or a bad story used to leave the caller pressing
   * a key that did nothing. The error goes to the board's log with the key and
   * the view, and the footer says so in one line.
   */
  const press = (name: string, ch?: string) => {
    try {
      dispatchKey(name, ch);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`[MAG] key handler failed: key=${JSON.stringify(ch ?? name)} view=${view.kind}: ${err instanceof Error && err.stack ? err.stack : message}`);
      if (stopped) return;
      try {
        setStatus('That key failed - see the board log');
        render();
      } catch { /* the notice is best effort; the log has the error */ }
    }
  };

  screen.on('keypress', (ch: string | undefined, key: { name?: string } | undefined) => {
    press(String(key?.name ?? ''), typeof ch === 'string' ? ch : undefined);
  });

  // ---- lifecycle -------------------------------------------------------

  const done = new Promise<void>((resolve) => {
    finish = () => {
      if (stopped) return;
      stopped = true;
      clearGlitch();
      clearOverlayTimer();
      stopPlayback();
      pageSearch.dispose();
      if (tickerTimer) clearInterval(tickerTimer);
      try { chrome.stop(); } catch { /* leaving anyway */ }
      try { input.disable(); } catch { /* leaving anyway */ }
      try { screen.destroy(); } catch { /* leaving anyway */ }
      try { bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h'); } catch { /* leaving anyway */ }
      resolve();
    };
  });

  snapshot = loadSnapshot(magazineRoot(__dirname));
  startTicker();
  go({ kind: 'front' });

  return {
    screen,
    get layout() { return layout; },
    bannerText: () => bannerLines.map(artRowText),
    overlayText: () => overlayLines.map(artRowText),
    done,
    press,
    panelRows: () => (spreads[spreadNo] ?? []).map(rowText),
    progressRow: () => rowText(buildProgress(layout, spreadNo, spreads.length)),
    counterRow: () => String(progressBox.getContent()).replace(/\{[^{}]*\}/g, ''),
    footerRow: () => chrome.footerContent().replace(/\{[^{}]*\}/g, ''),
    tickerRow: () => (tickerBox ? String(tickerBox.getContent()).replace(/\{[^{}]*\}/g, '') : ''),
    viewKind: () => view.kind,
    viewerRows: () => (viewer ? [...viewerPlain] : null),
    spreadNo: () => spreadNo,
    stats: () => ({ ...counters }),
    stop: () => finish(),
  };
}

export async function createApp(session: DoorSession): Promise<void> {
  const reader = await startReader(session);
  await reader.done;
}
