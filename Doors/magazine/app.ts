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
import { readDoorSettings } from '@amiexpress/bbs-door-sdk/settings';
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
import { DESK_LABEL, MAGAZINE_TITLE, frontLead, frontMove, frontToggle, isArticle, type Desk, type MagazineIndexEntry, type Story } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { createScrollText } from '@amiexpress/bbs-door-sdk';
import {
  editFront,
  isSysopCaller,
  loadSnapshot,
  loadStory,
  magazineRoot,
  paintSafe,
  searchStories,
  storiesPerDay,
  type MagazineSnapshot,
} from './library';
import {
  SECTION_ORDER,
  buildArticle,
  buildAwaitingEditor,
  buildLayout,
  buildListing,
  buildNotice,
  buildProgress,
  rowText,
  sectionLabel,
  signalStrength,
  newsRows,
  staticNewsRow,
  wireDetail,
  wireStamp,
  NEWS_SEPARATOR,
  type NewsItem,
  type ListingBlock,
  type MagLayout,
  type PanelRow,
  type Seg,
} from './layout';

interface DoorSession {
  bbs: any;
  /** The board's user: `secLevel` decides who may edit the front page. */
  user?: { secLevel?: number } | null;
  bbsSession?: { doorCommand?: string };
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
const DIGIT_COMMIT_MS = 1500;

export { MAGAZINE_TITLE };

export const HINTS: readonly FooterHint[] = [
  { key: 'Arrows', does: 'Page' },
  { key: 'C', does: 'Contents' },
  { key: 'F', does: 'Front' },
  { key: 'S', does: 'Section' },
  { key: 'B', does: 'Bookmark' },
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

/**
 * The sysop's keys, ahead of the reader's own. P is the one that is always
 * there (and survives the fit); the others drop first on a tight line.
 */
export function sysopHints(opts: { compact: boolean; frontView: boolean; onFront: boolean }): FooterHint[] {
  const p: FooterHint = opts.compact
    ? { key: 'P', does: opts.onFront ? 'Front remove' : 'Front add', keep: true }
    : { key: 'P', does: opts.onFront ? 'Remove from front page' : 'Add to front page', keep: true };
  const hints: FooterHint[] = [p];
  if (opts.frontView) {
    hints.push({ key: 'L', does: 'Make lead' }, { key: 'U', does: 'Move up' }, { key: 'D', does: 'Move down' });
  }
  return hints;
}

const SYSOP_HELP = [
  'P   add the story to the front page, or remove it',
  '    (a ^ marks a story already on it)',
  'In the front page, the first story is the LEAD:',
  'L   make the story the lead',
  'U   move the story up       D   move it down',
].join('\n');

export const HELP_TEXT = [
  'Arrow keys, Page Up, Page Down, Space   turn the page',
  'Up and Down in a list                   move the cursor',
  'Enter                                   open the story',
  'Escape                                  back, then quit',
  'C   contents of every section',
  'F   the front page (the editor\'s choice)',
  'S   next section',
  'B   bookmark or unbookmark a story',
  'K   your bookmarks',
  '/   search headlines and summaries',
  '0-9 type a page number, Enter to go',
  'Q   quit',
].join('\n');

export const helpText = (sysop: boolean): string => (sysop ? `${HELP_TEXT}\n\n${SYSOP_HELP}` : HELP_TEXT);

type View =
  | { kind: 'front' }
  | { kind: 'contents'; desk: Desk | null }
  | { kind: 'bookmarks' }
  | { kind: 'article'; storyId: string; list: string[]; back: View };

export interface Reader {
  screen: any;
  layout: MagLayout;
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
  /** The text of the wire detail panel when it is open, else ''. */
  modalText(): string;
  /** The kind of view on screen. */
  viewKind(): View['kind'];
  /** What actually ran: sentinels for the tests that prove the effects are wired. */
  stats(): { glitches: number; tickerSteps: number; intervals: number };
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

export async function startReader(session: DoorSession): Promise<Reader> {
  const { bbs, storage } = session;
  const theme: Theme = bbs?.getTheme ? bbs.getTheme() : (themeById('uprough-neon') ?? UPROUGH_NEON);
  const t = theme.tokens;
  const s = themeStyles(theme);
  const sysop = isSysopCaller(session);

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
  const layout = buildLayout(width, height, { ticker: showTicker });

  const input = new DoorInputManager(session as any, screen, {
    enableGameMode: false,
    enableGrabKeys: false,
    enableMouse: false,
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

  let snapshot: MagazineSnapshot = { index: [], front: [] };
  let view: View = { kind: 'front' };
  let spreads: PanelRow[][] = [[]];
  let spreadNo = 0;
  let listIds: string[] = [];
  let spreadFirst: Array<string | null> = [];
  let selected: string | null = null;
  let headline: { row: number; rows: number } | null = null;
  let panelText = '';
  let digits = '';
  let digitTimer: ReturnType<typeof setTimeout> | null = null;
  let glitchTimer: ReturnType<typeof setTimeout> | null = null;
  let repairTimer: ReturnType<typeof setTimeout> | null = null;
  let modalOpen = false;
  /** The wire story whose panel is open, so the sysop's P key knows what it acts on. */
  let wireId: string | null = null;
  let wireModal: any = null;
  let hintsKey = '';
  let modalContent = '';
  const counters = { glitches: 0, tickerSteps: 0, intervals: 0 };
  let stopped = false;
  let finish: () => void = () => { /* replaced below */ };

  const onFront = { has: (id: string) => snapshot.front.includes(id) };

  const byId = (id: string) => snapshot.index.find((e) => e.storyId === id);

  // One read per story per visit to a view: a cursor move rebuilds the list.
  const storyCache = new Map<string, Story | null>();
  const storyOf = (id: string): Story | null => {
    if (!storyCache.has(id)) storyCache.set(id, loadStory(id, magazineRoot(__dirname)));
    return storyCache.get(id) ?? null;
  };

  const listingBlocks = (entries: readonly MagazineIndexEntry[], headings: boolean): ListingBlock[] => {
    const blocks: ListingBlock[] = [];
    const item = (e: MagazineIndexEntry): ListingBlock => {
      // A story without full text is wire material in every list: headline,
      // one teaser line, source and age. A story with full text (or an authored
      // one) is a headline row, a feed article tagged ARTICLE.
      const st = storyOf(e.storyId);
      const stamp = st ? wireStamp(st.date || e.date, new Date()) : '';
      const wire = st && !isArticle(st)
        ? { teaser: st.summary, source: st.source, stamp }
        : undefined;
      const article = st && isArticle(st) && st.source
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
          lead: view.kind === 'front' && snapshot.front[0] === e.storyId,
          front: sysop && view.kind !== 'front' && onFront.has(e.storyId),
          wire,
          article,
        },
      };
    };
    if (!headings) return entries.map(item);
    for (const desk of SECTION_ORDER) {
      const group = entries.filter((e) => e.desk === desk);
      if (group.length === 0) continue;
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
    let l = buildListing(blocks, selected, layout, header);
    if (selected === null || !l.itemIds.includes(selected)) {
      selected = l.itemIds[0] ?? null;
      l = buildListing(blocks, selected, layout, header);
    }
    listIds = l.itemIds;
    spreadFirst = l.spreadFirst;
    spreads = l.spreads;
    spreadNo = l.selectedSpread;
  };

  const build = () => {
    headline = null;
    if (view.kind === 'front') {
      const entries = snapshot.front.map(byId).filter((e): e is MagazineIndexEntry => Boolean(e));
      if (entries.length === 0) {
        listIds = [];
        selected = null;
        spreads = [buildAwaitingEditor(layout)];
        spreadNo = 0;
        return;
      }
      showListing(
        [{ kind: 'heading', label: DESK_LABEL.general }, ...listingBlocks(entries, false)],
        'FRONT PAGE - THE EDITOR\'S CHOICE',
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
      const article = buildArticle(story, layout);
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
    updateHints();
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

  /** The story a sysop key acts on: the open panel, the open article, else the cursor. */
  const subjectId = (): string | null => wireId ?? (view.kind === 'article' ? view.storyId : selected);

  /** The sysop's hints follow the story in view; the footer is repainted only when they change. */
  const updateHints = () => {
    if (!sysop) return;
    const id = subjectId();
    const key = `${id ? 1 : 0}|${id && onFront.has(id) ? 1 : 0}|${view.kind === 'front' ? 1 : 0}`;
    if (key === hintsKey) return;
    hintsKey = key;
    const base = layout.collapseChrome ? COMPACT_HINTS : HINTS;
    chrome.setHints(id ? [...sysopHints({ compact: layout.collapseChrome, frontView: view.kind === 'front', onFront: onFront.has(id) }), ...base] : base);
  };

  const setStatus = (text: string) => chrome.setFooterSuffix(text ? `  ${text}` : '');

  const go = (next: View, keepSelection = false) => {
    snapshot = loadSnapshot(magazineRoot(__dirname));
    storyCache.clear();
    view = next;
    if (!keepSelection && next.kind !== 'article') selected = null;
    build();
    advanceNews();
    if (next.kind === 'article') {
      read.add(next.storyId);
      persist(READ_KEY, read);
    }
    paint();
  };

  // ---- ticker ----------------------------------------------------------

  let tickerTimer: ReturnType<typeof setInterval> | null = null;
  let newsItems: NewsItem[] = [];
  let newsAt = -1;
  const loadNews = () => {
    const root = magazineRoot(__dirname);
    newsItems = [...snapshot.index]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, TICKER_HEADLINES)
      .map((e) => ({ source: loadStory(e.storyId, root)?.source ?? '', title: e.title }));
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
    const st = storyOf(storyId);
    if (st && !isArticle(st)) { openWire(st); return; }
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

  // ---- the sysop's front page editor -----------------------------------

  const wireFooter = (id: string): string =>
    sysop ? `P: ${onFront.has(id) ? 'Remove from' : 'Add to'} front page   Enter: back` : 'Enter or Escape: back to the list';

  /** The front page changed on disk: show it. Only what differs is repainted (blessed diffs the cells). */
  const frontChanged = (next: string[], status: string) => {
    snapshot = { ...snapshot, front: next };
    setStatus(status);
    if (wireId) {
      wireModal?.setFooterText?.(wireFooter(wireId));
      updateHints();
      render();
    } else if (view.kind === 'article') {
      updateHints();
      render();
    } else {
      build();
      paint();
    }
  };

  /** P: on a story row, inside an article or in the wire panel, add the story to the front page or take it off. */
  const toggleFront = () => {
    const id = subjectId();
    if (!sysop || !id) return;
    const was = onFront.has(id);
    // Leaving the front view's selection on a neighbour, not on a row that is about to go.
    if (was && view.kind === 'front' && !wireId) {
      const at = listIds.indexOf(id);
      selected = listIds[at + 1] ?? listIds[at - 1] ?? null;
    }
    frontChanged(editFront((ids) => frontToggle(ids, id), magazineRoot(__dirname)), was ? 'Removed from the front page' : 'Added to the front page');
  };

  /** U / D / L in the front page view: reorder, lead first. */
  const reorderFront = (how: 'up' | 'down' | 'lead') => {
    if (!sysop || view.kind !== 'front' || !selected || wireId) return;
    const id = selected;
    const root = magazineRoot(__dirname);
    const next = editFront((ids) => (how === 'lead' ? frontLead(ids, id) : frontMove(ids, id, how === 'up' ? -1 : 1)), root);
    frontChanged(next, how === 'lead' ? 'Now the lead' : how === 'up' ? 'Moved up' : 'Moved down');
  };

  const jumpToPage = (n: number) => {
    const entry = snapshot.index.find((e) => e.page === n);
    if (!entry) { setStatus(`No page ${n}`); render(); return; }
    openStory(entry.storyId, view.kind === 'article' ? view.list : listIds.length ? listIds : snapshot.index.map((e) => e.storyId));
  };

  const commitDigits = () => {
    if (digitTimer) { clearTimeout(digitTimer); digitTimer = null; }
    const n = Number(digits);
    digits = '';
    setStatus('');
    if (Number.isFinite(n) && n > 0) jumpToPage(n); else render();
  };

  const modalDone = () => {
    modalOpen = false;
    render();
  };

  /**
   * A story without full text never opens the article layout: a small panel with the
   * cleaned teaser, the site and the date. The view underneath does not move,
   * so closing it leaves the cursor where it was.
   */
  const openWire = (st: Story) => {
    modalOpen = true;
    wireId = st.id;
    const lines = wireDetail(st, new Date());
    modalContent = lines.join('\n');
    const newlyRead = !read.has(st.id);
    if (newlyRead) { read.add(st.id); persist(READ_KEY, read); }
    // Sized to its text: a panel that fills the screen repaints the screen.
    const panelWidth = Math.min(width, Math.max(30, calculateDialogWidth(width)));
    const textRows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / Math.max(1, panelWidth - 4))), 0);
    const modal = docModal({
      parent: screen,
      width: panelWidth,
      height: Math.min(height - 2, textRows + 4),
      title: 'Wire',
      content: lines.map(escapeTags).join('\n'),
      contentStyle: { fg: t.ink, bg: t.ground },
      footerStyle: { fg: t.ground, bg: t.accent },
      footerText: wireFooter(st.id),
      mobileFooterText: sysop ? 'P: Front page   Enter: back' : 'Enter: back',
      closeKeys: ['enter', 'return'],
      zIndex: 9990,
      onClose: () => {
        modalContent = '';
        wireId = null;
        wireModal = null;
        updateHints();
        modalDone();
        if (newlyRead && view.kind !== 'article') { build(); paint(); }
      },
    } as never) as any;
    wireModal = modal;
    modal.display();
    updateHints();
  };

  const openHelp = () => {
    modalOpen = true;
    const modal = docModal({
      parent: screen,
      title: `${MAGAZINE_TITLE} help`,
      content: helpText(sysop),
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

  // ---- keys ------------------------------------------------------------

  const press = (name: string, ch?: string) => {
    const c = (ch ?? '').toLowerCase();
    if (!stopped && modalOpen && wireId && sysop && c === 'p') { toggleFront(); return; }
    if (stopped || modalOpen) return;
    if (/^[0-9]$/.test(c)) {
      digits = (digits + c).slice(-3);
      setStatus(`Page ${digits}_`);
      if (digitTimer) clearTimeout(digitTimer);
      digitTimer = setTimeout(commitDigits, DIGIT_COMMIT_MS);
      if (digits.length === 3) commitDigits(); else render();
      return;
    }
    if (digits && name === 'enter') { commitDigits(); return; }
    if (digits && name === 'escape') {
      digits = '';
      if (digitTimer) { clearTimeout(digitTimer); digitTimer = null; }
      setStatus('');
      render();
      return;
    }
    setStatus('');
    switch (name) {
      case 'up': if (view.kind === 'article') page(-1); else move(-1); return;
      case 'down': if (view.kind === 'article') page(1); else move(1); return;
      case 'left': case 'pageup': page(-1); return;
      case 'right': case 'pagedown': case 'space': page(1); return;
      case 'enter': case 'return': openSelected(); return;
      case 'escape': case 'backspace': back(); return;
      default: break;
    }
    switch (c) {
      case 'q': finish(); return;
      case 'c': go({ kind: 'contents', desk: null }); return;
      case 'f': go({ kind: 'front' }); return;
      case 'k': go({ kind: 'bookmarks' }); return;
      case 's': cycleSection(); return;
      case 'b': toggleBookmark(); return;
      case 'p': toggleFront(); return;
      case 'u': reorderFront('up'); return;
      case 'd': reorderFront('down'); return;
      case 'l': reorderFront('lead'); return;
      case '/': openSearch(); return;
      case '?': case 'h': openHelp(); return;
      default: break;
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
      if (digitTimer) clearTimeout(digitTimer);
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
    layout,
    done,
    press,
    panelRows: () => (spreads[spreadNo] ?? []).map(rowText),
    progressRow: () => rowText(buildProgress(layout, spreadNo, spreads.length)),
    footerRow: () => chrome.footerContent().replace(/\{[^{}]*\}/g, ''),
    tickerRow: () => (tickerBox ? String(tickerBox.getContent()).replace(/\{[^{}]*\}/g, '') : ''),
    modalText: () => modalContent,
    viewKind: () => view.kind,
    stats: () => ({ ...counters }),
    stop: () => finish(),
  };
}

export async function createApp(session: DoorSession): Promise<void> {
  const reader = await startReader(session);
  await reader.done;
}
