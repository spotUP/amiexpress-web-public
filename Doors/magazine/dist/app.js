"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpText = exports.HELP_TEXT = exports.COMPACT_HINTS = exports.HINTS = exports.MAGAZINE_TITLE = exports.BOOKMARK_KEY = exports.READ_KEY = void 0;
exports.sysopHints = sysopHints;
exports.startReader = startReader;
exports.createApp = createApp;
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
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const path = __importStar(require("path"));
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const magazine_1 = require("@amiexpress/bbs-door-sdk/formats/magazine");
Object.defineProperty(exports, "MAGAZINE_TITLE", { enumerable: true, get: function () { return magazine_1.MAGAZINE_TITLE; } });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const page_search_1 = require("@amiexpress/bbs-door-sdk/teletext/page-search");
const art_1 = require("./art");
const filler_1 = require("./filler");
const library_1 = require("./library");
const layout_1 = require("./layout");
exports.READ_KEY = 'read-story-ids';
exports.BOOKMARK_KEY = 'bookmark-story-ids';
const STORED_CAP = 500;
const TICKER_HEADLINES = 8;
/** 8 cells per second: a readable marquee that costs one row per frame. */
const TICKER_STEP_MS = 125;
const SIGNAL_DAYS = 8;
/** The headline settles for this long before the one glitch lands. */
const GLITCH_DELAY_MS = 450;
const GLITCH_HOLD_MS = 160;
/** The title screen waits this long for a key, then the reader opens by itself. */
const TITLE_MS = 6000;
/** The goodbye is a glimpse: a key or this long, then the call ends. */
const GOODBYE_MS = 1500;
/** The mark after an article is small. */
const END_MARK_MAX_ROWS = 3;
exports.HINTS = [
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
exports.COMPACT_HINTS = [
    { key: 'C', does: 'Contents' },
    { key: '?', does: 'Help', keep: true },
    { key: 'Q', does: 'Quit', keep: true },
];
/**
 * The sysop's keys, ahead of the reader's own. P is the one that is always
 * there (and survives the fit); the others drop first on a tight line.
 */
function sysopHints(opts) {
    const p = opts.compact
        ? { key: 'P', does: opts.onFront ? 'Front remove' : 'Front add', keep: true }
        : { key: 'P', does: opts.onFront ? 'Remove from front page' : 'Add to front page', keep: true };
    const hints = [p];
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
exports.HELP_TEXT = [
    'Page Up, Page Down, Space               turn the page',
    'Arrow keys in a story                   turn the page',
    'Up and Down in a list                   move the cursor',
    'Left and Right in a list                move between columns',
    'Enter                                   open the story',
    'Escape                                  back, then quit',
    'C   contents of every section',
    'F   the front page (the editor\'s choice)',
    'S   next section',
    'B   bookmark or unbookmark a story',
    'K   your bookmarks',
    '/   search headlines and summaries',
    '0-9 type a page number (100-999); Escape cancels',
    'Q   quit',
].join('\n');
const helpText = (sysop) => (sysop ? `${exports.HELP_TEXT}\n\n${SYSOP_HELP}` : exports.HELP_TEXT);
exports.helpText = helpText;
function escapeTags(text) {
    return text.replace(/[{}]/g, (c) => (c === '{' ? '{open}' : '{close}'));
}
function readEdition(index) {
    let latest = '';
    for (const e of index)
        if (e.date > latest)
            latest = e.date;
    return latest.slice(0, 10);
}
async function startReader(session, options = {}) {
    const { bbs, storage } = session;
    const theme = bbs?.getTheme ? bbs.getTheme() : ((0, theme_1.themeById)('uprough-neon') ?? theme_1.UPROUGH_NEON);
    const t = theme.tokens;
    const s = (0, theme_1.themeStyles)(theme);
    const sysop = (0, library_1.isSysopCaller)(session);
    let showTicker = true;
    try {
        const v = (0, settings_1.readDoorSettings)(__dirname);
        if (v.show_ticker === false)
            showTicker = false;
    }
    catch { /* defaults stand */ }
    const loadList = async (key) => {
        try {
            const stored = await storage.load(key);
            return new Set(Array.isArray(stored) ? stored.filter((x) => typeof x === 'string') : []);
        }
        catch {
            return new Set();
        }
    };
    const read = await loadList(exports.READ_KEY);
    const bookmarks = await loadList(exports.BOOKMARK_KEY);
    const persist = (key, set) => {
        storage.save(key, [...set].slice(-STORED_CAP)).catch(() => { });
    };
    const screen = (0, blessed_helpers_1.createScreen)(bbs, { title: magazine_1.MAGAZINE_TITLE });
    const width = screen.width || 80;
    const height = screen.height || 24;
    let layout = (0, layout_1.buildLayout)(width, height, { ticker: showTicker });
    // Which alphabet this caller reads: the session knows (createScreen asks it too).
    const petscii = typeof bbs?.isPetsciiMode === 'function' && bbs.isPetsciiMode() === true;
    // A test that points the reader at its own art folder gets no slots and no C64 drawings unless it passes them.
    const ownArt = options.shippedArtDir !== undefined;
    let slots = options.slots ?? {};
    if (!ownArt) {
        try {
            slots = (0, art_1.slotFiles)((0, settings_1.readDoorSettings)(__dirname), (0, settings_1.resolveDoorRoot)(__dirname));
        }
        catch { /* every slot keeps its default file */ }
    }
    const artSources = {
        shippedDir: ownArt ? (options.shippedArtDir ?? null) : (0, art_1.shippedArtDir)(),
        slots,
        // Where the Studio's C64 tab saves a drawing: <board root>/Screens/doors/MAG.
        variantDir: options.variantDir !== undefined
            ? options.variantDir
            : ownArt ? null : path.join((0, settings_1.resolveBbsRoot)(__dirname), 'Screens', 'doors', 'MAG'),
        // A caller who answered T: the session says so, as it does for GLC's logo.
        teletext: session.bbsSession?.texttvMode === true,
    };
    const artKind = (0, art_1.artKindFor)(petscii, width);
    /** Mortimer's clipart for empty column space; a caller that reads PETSCII only gets pieces that map. */
    const fillerPieces = (0, filler_1.loadFiller)(artSources, artKind === 'seq');
    /** One piece of art as rows of content for this caller, [] when there is none. */
    const artFor = (name, maxRows, maxCols = width) => {
        const art = (0, art_1.loadArt)(name, artKind, artSources);
        return art ? (0, art_1.artRows)(art, maxRows, artKind === 'seq' ? Math.min(maxCols, 40) : maxCols) : [];
    };
    const bannerCap = artKind === 'seq' ? art_1.BANNER_MAX_ROWS_40 : art_1.BANNER_MAX_ROWS;
    const input = new door_input_manager_1.DoorInputManager(session, screen, {
        enableGameMode: false,
        enableGrabKeys: false,
        enableMouse: false,
        // Ctrl+C and a Ctrl+K palette pick end the call at once through the
        // same teardown Q reaches after its goodbye art.
        onClose: () => finish(),
    });
    input.enable();
    const row = (top, extra = {}) => (0, blessed_helpers_1.createBox)({
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
    });
    const mastheadRow = row(layout.headerRow);
    const tickerBox = layout.tickerRow === null ? null : row(layout.tickerRow);
    const panel = (0, blessed_helpers_1.createBox)({
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
    });
    // The banner: art above the panel, drawn when a view is entered and never again.
    const bannerBox = row(1);
    bannerBox.hide();
    let bannerKey = '';
    let bannerLines = [];
    const progressBox = row(layout.progressRow);
    const footerRow = (0, blessed_helpers_1.createBox)({
        parent: screen,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 1,
        border: undefined,
        focusable: false,
        clickable: false,
        mouse: false,
        style: (0, theme_1.footerStyle)(theme),
        content: '',
    });
    const render = () => screen.render();
    const chrome = (0, theme_1.attachDoorChrome)(theme, {
        width,
        title: layout.collapseChrome ? magazine_1.MAGAZINE_TITLE : `${magazine_1.MAGAZINE_TITLE} // SIGNAL TERMINAL`,
        masthead: mastheadRow,
        footer: footerRow,
        hints: exports.HINTS,
        compactHints: exports.COMPACT_HINTS,
        footerPad: ' ',
        styles: s,
        render,
    });
    // ---- painting --------------------------------------------------------
    const paintSeg = (seg) => {
        if (seg.raw !== undefined)
            return seg.raw;
        if (!seg.text)
            return '';
        const text = escapeTags(seg.text);
        switch (seg.role) {
            case 'dim': return s.dim(text);
            case 'accent':
            case 'rule':
            case 'unread': return s.accent(text);
            case 'tag':
            case 'source': return s.accentAlt(text);
            case 'head': return `{bold}${s.ink(text)}{/bold}`;
            case 'warn': return s.warn(text);
            case 'selected':
                return `{${t.selectionBg}-bg}{${t.selectionInk}-fg}${text}{/${t.selectionInk}-fg}{/${t.selectionBg}-bg}`;
            default: return text;
        }
    };
    const paintRow = (r) => r.map(paintSeg).join('');
    // ---- state -----------------------------------------------------------
    let snapshot = { index: [], front: [] };
    let view = { kind: 'front' };
    let spreads = [[]];
    let spreadNo = 0;
    let listIds = [];
    let spreadFirst = [];
    let listGrid = [];
    let selected = null;
    let headline = null;
    let panelText = '';
    let glitchTimer = null;
    let repairTimer = null;
    let modalOpen = false;
    let hintsKey = '';
    const counters = { glitches: 0, tickerSteps: 0, intervals: 0, banners: 0, titles: 0, searchTicks: 0, lands: 0 };
    let stopped = false;
    let finish = () => { };
    const onFront = { has: (id) => snapshot.front.includes(id) };
    const byId = (id) => snapshot.index.find((e) => e.storyId === id);
    // One read per story per visit to a view: a cursor move rebuilds the list.
    const storyCache = new Map();
    const storyOf = (id) => {
        if (!storyCache.has(id))
            storyCache.set(id, (0, library_1.loadStory)(id, (0, library_1.magazineRoot)(__dirname)));
        return storyCache.get(id) ?? null;
    };
    const listingBlocks = (entries, headings) => {
        const blocks = [];
        const item = (e) => {
            // Every listed story is an article (the snapshot holds nothing else): a
            // headline row tagged ARTICLE with its source and age.
            const st = storyOf(e.storyId);
            const stamp = st ? (0, layout_1.ageStamp)(st.date || e.date, new Date()) : '';
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
                    lead: view.kind === 'front' && snapshot.front[0] === e.storyId,
                    front: sysop && view.kind !== 'front' && onFront.has(e.storyId),
                    article,
                },
            };
        };
        if (!headings)
            return entries.map(item);
        for (const desk of layout_1.SECTION_ORDER) {
            const group = entries.filter((e) => e.desk === desk);
            if (group.length === 0)
                continue;
            blocks.push({ kind: 'heading', label: magazine_1.DESK_LABEL[desk] });
            blocks.push(...group.map(item));
        }
        return blocks;
    };
    const spark = (entries) => layout.effects ? (0, layout_1.signalStrength)((0, library_1.storiesPerDay)(entries, SIGNAL_DAYS), blessed_1.sparklineText) : '';
    const headerRight = (entries) => [spark(entries), readEdition(snapshot.index)].filter(Boolean).join('  ');
    const showListing = (blocks, left, entries) => {
        const header = { left, right: headerRight(entries) };
        const fill = { pieces: fillerPieces, key: left };
        let l = (0, layout_1.buildListing)(blocks, selected, layout, header, fill);
        if (selected === null || !l.itemIds.includes(selected)) {
            selected = l.itemIds[0] ?? null;
            l = (0, layout_1.buildListing)(blocks, selected, layout, header, fill);
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
            const entries = snapshot.front.map(byId).filter((e) => Boolean(e));
            if (entries.length === 0) {
                listIds = [];
                selected = null;
                spreads = [(0, layout_1.buildAwaitingEditor)(layout)];
                spreadNo = 0;
                return;
            }
            showListing([{ kind: 'heading', label: magazine_1.FRONT_PAGE_LABEL }, ...listingBlocks(entries, false)], 'FRONT PAGE - THE EDITOR\'S CHOICE', entries);
        }
        else if (view.kind === 'contents') {
            const entries = snapshot.index.filter((e) => view.kind === 'contents' && (!view.desk || e.desk === view.desk));
            if (entries.length === 0) {
                listIds = [];
                selected = null;
                spreads = [(0, layout_1.buildNotice)(layout, 'NO STORIES YET', ['Nothing has been published.'])];
                spreadNo = 0;
                return;
            }
            showListing(listingBlocks(entries, true), `CONTENTS - ${(0, layout_1.sectionLabel)(view.desk)}`, entries);
        }
        else if (view.kind === 'bookmarks') {
            const entries = [...bookmarks].map(byId).filter((e) => Boolean(e));
            if (entries.length === 0) {
                listIds = [];
                selected = null;
                spreads = [(0, layout_1.buildNotice)(layout, 'NO BOOKMARKS YET', ['Press B on a story to keep it here.'])];
                spreadNo = 0;
                return;
            }
            showListing(listingBlocks(entries, false), 'BOOKMARKS', entries);
        }
        else {
            const story = (0, library_1.loadStory)(view.storyId, (0, library_1.magazineRoot)(__dirname));
            if (!story) {
                spreads = [(0, layout_1.buildNotice)(layout, 'STORY NOT FOUND', ['It has left the archive.'])];
                spreadNo = 0;
                return;
            }
            const mark = artFor('mag_article_end', END_MARK_MAX_ROWS, layout.geometry.colWidth).map((raw) => ({ raw, text: (0, art_1.artRowText)(raw) }));
            const article = (0, layout_1.buildArticle)(story, layout, mark, { pieces: fillerPieces, key: story.id });
            spreads = article.spreads;
            headline = { row: article.headlineRow, rows: article.headlineRows };
            spreadNo = 0;
        }
    };
    const clearGlitch = () => {
        if (glitchTimer) {
            clearTimeout(glitchTimer);
            glitchTimer = null;
        }
        if (repairTimer) {
            clearTimeout(repairTimer);
            repairTimer = null;
        }
    };
    /** Repaint the panel and the progress row. The only thing a page turn does. */
    const paint = () => {
        clearGlitch();
        const rows = spreads[Math.min(spreadNo, spreads.length - 1)] ?? [];
        panelText = rows.map(paintRow).join('\n');
        panel.setContent(panelText);
        progressBox.setContent(paintRow((0, layout_1.buildProgress)(layout, spreadNo, spreads.length)));
        updateHints();
        render();
        scheduleGlitch(rows);
    };
    /** One glitch on the headline as an article opens, then it holds still. */
    const scheduleGlitch = (rows) => {
        if (!headline || spreadNo !== 0 || !layout.effects || !theme.glitches)
            return;
        const target = headline;
        glitchTimer = setTimeout(() => {
            glitchTimer = null;
            const lines = rows.map(paintRow);
            const kinds = ['scramble', 'shift', 'tear', 'invert', 'blocks'];
            const kind = kinds[Math.floor(Math.random() * kinds.length)];
            const at = target.row + Math.floor(Math.random() * target.rows);
            counters.glitches += 1;
            const damaged = (0, theme_1.glitchLines)(lines, { row: at, kind }, theme, Math.random);
            const truth = panelText;
            panel.setContent(damaged.join('\n'));
            render();
            repairTimer = setTimeout(() => {
                repairTimer = null;
                if (panelText === truth) {
                    panel.setContent(truth);
                    render();
                }
            }, GLITCH_HOLD_MS);
        }, GLITCH_DELAY_MS);
    };
    /** The story a sysop key acts on: the open article, else the cursor. */
    const subjectId = () => (view.kind === 'article' ? view.storyId : selected);
    /** The sysop's hints follow the story in view; the footer is repainted only when they change. */
    const updateHints = () => {
        if (!sysop)
            return;
        const id = subjectId();
        const key = `${id ? 1 : 0}|${id && onFront.has(id) ? 1 : 0}|${view.kind === 'front' ? 1 : 0}`;
        if (key === hintsKey)
            return;
        hintsKey = key;
        const base = layout.collapseChrome ? exports.COMPACT_HINTS : exports.HINTS;
        chrome.setHints(id ? [...sysopHints({ compact: layout.collapseChrome, frontView: view.kind === 'front', onFront: onFront.has(id) }), ...base] : base);
    };
    const setStatus = (text) => chrome.setFooterSuffix(text ? `  ${text}` : '');
    /** The banner a view carries: the front page and contents have their own, a section its desk's. */
    const bannerNameFor = (v) => {
        if (v.kind === 'front')
            return 'mag_front';
        if (v.kind === 'contents')
            return v.desk ? art_1.SECTION_ART[v.desk] : 'mag_contents';
        return '';
    };
    /**
     * Put the view's banner up. Called on view entry only: if the same art is
     * already there nothing is touched, and the panel is resized only when the
     * number of banner rows changes. The layout (and so every page break the
     * views compute) takes the rows from the panel.
     */
    const applyBanner = (name) => {
        if (name === bannerKey)
            return;
        bannerKey = name;
        const wanted = name ? artFor(name, bannerCap) : [];
        const next = (0, layout_1.buildLayout)(width, height, { ticker: showTicker, banner: wanted.length });
        layout = next;
        bannerLines = next.bannerRows > 0 ? wanted.slice(0, next.bannerRows) : [];
        panel.top = next.panelTop;
        panel.height = next.panelHeight;
        if (bannerLines.length === 0) {
            bannerBox.hide();
            return;
        }
        bannerBox.height = bannerLines.length;
        bannerBox.setContent(bannerLines.join('\n'));
        bannerBox.show();
        counters.banners += 1;
    };
    const go = (next, keepSelection = false) => {
        const before = view;
        const beforeSelected = selected;
        try {
            snapshot = (0, library_1.loadSnapshot)((0, library_1.magazineRoot)(__dirname));
            storyCache.clear();
            view = next;
            applyBanner(bannerNameFor(next));
            if (!keepSelection && next.kind !== 'article')
                selected = null;
            build();
            advanceNews();
            if (next.kind === 'article') {
                read.add(next.storyId);
                persist(exports.READ_KEY, read);
            }
            paint();
        }
        catch (err) {
            // A view that cannot be built leaves the caller where they were, with the screen they had.
            view = before;
            selected = beforeSelected;
            try {
                applyBanner(bannerNameFor(before));
                build();
                paint();
            }
            catch { /* the original error is the one to report */ }
            throw err;
        }
    };
    // ---- ticker ----------------------------------------------------------
    let tickerTimer = null;
    let newsItems = [];
    let newsAt = -1;
    const loadNews = () => {
        const root = (0, library_1.magazineRoot)(__dirname);
        newsItems = (0, library_1.loadTickerItems)(TICKER_HEADLINES, root);
    };
    /** 40 columns: the next headline, painted into the ticker row (flushed by the caller's render). */
    const showStaticNews = () => {
        if (tickerBox)
            tickerBox.setContent(paintRow((0, layout_1.staticNewsRow)(newsItems, newsAt, layout.width)));
    };
    const advanceNews = () => {
        if (layout.effects)
            return;
        newsAt += 1;
        showStaticNews();
    };
    const startTicker = () => {
        if (!tickerBox)
            return;
        loadNews();
        if (!layout.effects) {
            showStaticNews();
            return;
        }
        const sep = s.dim(layout_1.NEWS_SEPARATOR);
        const text = (0, layout_1.newsRows)(newsItems).map(paintRow).join(sep);
        const scroll = (0, bbs_door_sdk_1.createScrollText)({ text, width: Math.max(1, layout.width - 2), gap: sep });
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
    const move = (delta) => {
        if (listIds.length === 0)
            return;
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
    const columnMove = (delta) => {
        const at = selected ? listIds.indexOf(selected) : -1;
        const step = at < 0 ? null : (0, layout_1.columnStep)(listGrid[spreadNo] ?? [], at, delta);
        if (typeof step !== 'number') {
            page(delta);
            return;
        }
        selected = listIds[step];
        build();
        paint();
    };
    const page = (delta) => {
        if (view.kind === 'article') {
            const next = spreadNo + delta;
            if (next >= 0 && next < spreads.length) {
                spreadNo = next;
                advanceNews();
                paint();
                return;
            }
            const at = view.list.indexOf(view.storyId) + delta;
            if (at >= 0 && at < view.list.length) {
                go({ ...view, storyId: view.list[at] });
                if (delta < 0) {
                    spreadNo = spreads.length - 1;
                    paint();
                }
            }
            return;
        }
        const next = spreadNo + delta;
        if (next < 0 || next >= spreads.length)
            return;
        // The cursor goes with the page, so the next key still acts on what is in view.
        const first = spreadFirst[next];
        if (first)
            selected = first;
        build();
        spreadNo = next;
        advanceNews();
        paint();
    };
    const openStory = (storyId, list) => {
        go({ kind: 'article', storyId, list: list.length ? list : [storyId], back: view.kind === 'article' ? view.back : view });
    };
    const openSelected = () => {
        if (view.kind === 'article' || !selected)
            return;
        openStory(selected, listIds);
    };
    const back = () => {
        if (view.kind === 'article') {
            go(view.back, true);
            return;
        }
        finish();
    };
    const cycleSection = () => {
        const present = layout_1.SECTION_ORDER.filter((d) => snapshot.index.some((e) => e.desk === d));
        const order = [null, ...present];
        const current = view.kind === 'contents' ? view.desk : null;
        const next = order[(order.indexOf(current) + 1) % order.length];
        go({ kind: 'contents', desk: next });
    };
    const toggleBookmark = () => {
        const id = view.kind === 'article' ? view.storyId : selected;
        if (!id)
            return;
        if (bookmarks.has(id)) {
            bookmarks.delete(id);
            setStatus('Bookmark removed');
        }
        else {
            bookmarks.add(id);
            setStatus('Bookmarked');
        }
        persist(exports.BOOKMARK_KEY, bookmarks);
        if (view.kind !== 'article') {
            build();
            paint();
        }
        else
            render();
    };
    // ---- the sysop's front page editor -----------------------------------
    /** The front page changed on disk: show it. Only what differs is repainted (blessed diffs the cells). */
    const frontChanged = (next, status) => {
        snapshot = { ...snapshot, front: next };
        setStatus(status);
        if (view.kind === 'article') {
            updateHints();
            render();
        }
        else {
            build();
            paint();
        }
    };
    /** P: on a story row or inside an article, add the story to the front page or take it off. */
    const toggleFront = () => {
        const id = subjectId();
        if (!sysop || !id)
            return;
        const was = onFront.has(id);
        // Leaving the front view's selection on a neighbour, not on a row that is about to go.
        if (was && view.kind === 'front') {
            const at = listIds.indexOf(id);
            selected = listIds[at + 1] ?? listIds[at - 1] ?? null;
        }
        frontChanged((0, library_1.editFront)((ids) => (0, magazine_1.frontToggle)(ids, id), (0, library_1.magazineRoot)(__dirname)), was ? 'Removed from the front page' : 'Added to the front page');
    };
    /** U / D / L in the front page view: reorder, lead first. */
    const reorderFront = (how) => {
        if (!sysop || view.kind !== 'front' || !selected)
            return;
        const id = selected;
        const root = (0, library_1.magazineRoot)(__dirname);
        const next = (0, library_1.editFront)((ids) => (how === 'lead' ? (0, magazine_1.frontLead)(ids, id) : (0, magazine_1.frontMove)(ids, id, how === 'up' ? -1 : 1)), root);
        frontChanged(next, how === 'lead' ? 'Now the lead' : how === 'up' ? 'Moved up' : 'Moved down');
    };
    const resolvePage = (n) => {
        if (n === magazine_1.FRONT_PAGE)
            return { kind: 'front' };
        const entry = snapshot.index.find((e) => e.page === n);
        if (entry)
            return { kind: 'story', storyId: entry.storyId };
        const desk = Object.keys(magazine_1.PAGE_FAMILIES).find((d) => magazine_1.PAGE_FAMILIES[d].first === n);
        return desk ? { kind: 'desk', desk } : null;
    };
    /** The number the caller is on now: where the counter starts rolling from. */
    const currentPage = () => {
        if (view.kind === 'article')
            return byId(view.storyId)?.page ?? magazine_1.FRONT_PAGE;
        if (view.kind === 'contents' && view.desk)
            return magazine_1.PAGE_FAMILIES[view.desk].first;
        return magazine_1.FRONT_PAGE;
    };
    const showPage = (n) => {
        const target = resolvePage(n);
        if (!target) {
            render();
            return;
        }
        counters.lands += 1;
        if (target.kind === 'front') {
            go({ kind: 'front' });
            return;
        }
        if (target.kind === 'desk') {
            go({ kind: 'contents', desk: target.desk });
            return;
        }
        openStory(target.storyId, view.kind === 'article' ? view.list : listIds.length ? listIds : snapshot.index.map((e) => e.storyId));
    };
    /**
     * The header counter is the progress row: one row, replaced in place, so a
     * tick of the search repaints that row and nothing else.
     */
    const restoreProgress = () => {
        progressBox.setContent(paintRow((0, layout_1.buildProgress)(layout, spreadNo, spreads.length)));
        render();
    };
    const pageSearch = new page_search_1.PageSearch({
        space: (0, page_search_1.rangeSpace)(100, 999, String),
        width,
        parse: (typed) => (/^[1-9][0-9]{2}$/.test(typed) ? Number(typed) : null),
        exists: (n) => resolvePage(n) !== null,
        current: currentPage,
        header: (text, phase) => {
            if (phase === 'searching')
                counters.searchTicks += 1;
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
        const modal = (0, blessed_1.docModal)({
            parent: screen,
            title: `${magazine_1.MAGAZINE_TITLE} help`,
            content: (0, exports.helpText)(sysop),
            contentStyle: { fg: t.ink, bg: t.ground },
            footerStyle: { fg: t.ground, bg: t.accent },
            zIndex: 9990,
            onClose: modalDone,
        });
        modal.display();
    };
    const openSearch = () => {
        modalOpen = true;
        let found = [];
        const modal = (0, blessed_1.searchModal)({
            parent: screen,
            title: 'Search the magazine',
            searchLabel: 'Words',
            borderColor: t.accent,
            width: (0, blessed_1.calculateDialogWidth)(width),
            zIndex: 9990,
            helpText: 'Enter: search   Tab: results   Escape: close',
            onSearch: (query) => {
                found = (0, library_1.searchStories)(snapshot.index, query);
                modal.setResults(found.map((e) => ({ id: e.storyId, content: `${String(e.page).padStart(3, ' ')} ${escapeTags((0, library_1.paintSafe)(e.title))}` })));
            },
            onSelect: (r) => {
                modal.hide();
                modalDone();
                openStory(r.id, found.map((e) => e.storyId));
            },
            onClose: modalDone,
        });
        modal.display();
    };
    // ---- full-screen art: the title on entry, the goodbye on Q ------------
    let overlay = null;
    let overlayLines = [];
    let overlayTimer = null;
    let closing = false;
    const clearOverlayTimer = () => {
        if (overlayTimer) {
            clearTimeout(overlayTimer);
            overlayTimer = null;
        }
    };
    /** Art over the whole screen, until `dropOverlay`. Returns false when there is no art. */
    const raiseOverlay = (name) => {
        const rows = artFor(name, height);
        if (rows.length === 0)
            return false;
        overlayLines = rows;
        overlay = (0, blessed_helpers_1.createBox)({
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
        });
        overlay.setFront?.();
        render();
        return true;
    };
    const dropOverlay = () => {
        clearOverlayTimer();
        if (!overlay)
            return;
        try {
            overlay.destroy();
        }
        catch { /* leaving anyway */ }
        overlay = null;
        overlayLines = [];
        render();
    };
    /** Q: a glimpse of the goodbye art where there is some, then the call ends. */
    const quit = () => {
        if (closing)
            return;
        if (!raiseOverlay('mag_goodbye')) {
            finish();
            return;
        }
        closing = true;
        clearOverlayTimer();
        overlayTimer = setTimeout(() => finish(), GOODBYE_MS);
        overlayTimer.unref?.();
    };
    // ---- keys ------------------------------------------------------------
    /** The key as the page-number machine reads it: a digit, one of three named keys, or anything else. */
    const searchKey = (name, c) => {
        if (/^[0-9]$/.test(c))
            return c;
        if (name === 'escape')
            return 'escape';
        if (name === 'backspace')
            return 'backspace';
        if (name === 'enter' || name === 'return')
            return 'enter';
        return name || c;
    };
    const dispatchKey = (name, ch) => {
        if (!stopped && closing) {
            finish();
            return;
        }
        // The title waits for a key; that key only lets the reader in.
        if (!stopped && overlay) {
            dropOverlay();
            return;
        }
        const c = (ch ?? '').toLowerCase();
        if (stopped || modalOpen)
            return;
        if (pageSearch.feed(searchKey(name, c)))
            return;
        setStatus('');
        switch (name) {
            case 'up':
                if (view.kind === 'article')
                    page(-1);
                else
                    move(-1);
                return;
            case 'down':
                if (view.kind === 'article')
                    page(1);
                else
                    move(1);
                return;
            case 'left':
                if (view.kind === 'article')
                    page(-1);
                else
                    columnMove(-1);
                return;
            case 'right':
                if (view.kind === 'article')
                    page(1);
                else
                    columnMove(1);
                return;
            case 'pageup':
                page(-1);
                return;
            case 'pagedown':
            case 'space':
                page(1);
                return;
            case 'enter':
            case 'return':
                openSelected();
                return;
            case 'escape':
            case 'backspace':
                back();
                return;
            default: break;
        }
        switch (c) {
            case 'q':
                quit();
                return;
            case 'c':
                go({ kind: 'contents', desk: null });
                return;
            case 'f':
                go({ kind: 'front' });
                return;
            case 'k':
                go({ kind: 'bookmarks' });
                return;
            case 's':
                cycleSection();
                return;
            case 'b':
                toggleBookmark();
                return;
            case 'p':
                toggleFront();
                return;
            case 'u':
                reorderFront('up');
                return;
            case 'd':
                reorderFront('down');
                return;
            case 'l':
                reorderFront('lead');
                return;
            case '/':
                openSearch();
                return;
            case '?':
            case 'h':
                openHelp();
                return;
            default: break;
        }
    };
    /**
     * A key that throws must not vanish: the SDK swallows errors out of a screen
     * handler, so a stale build or a bad story used to leave the caller pressing
     * a key that did nothing. The error goes to the board's log with the key and
     * the view, and the footer says so in one line.
     */
    const press = (name, ch) => {
        try {
            dispatchKey(name, ch);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error(`[MAG] key handler failed: key=${JSON.stringify(ch ?? name)} view=${view.kind}: ${err instanceof Error && err.stack ? err.stack : message}`);
            if (stopped)
                return;
            try {
                setStatus('That key failed - see the board log');
                render();
            }
            catch { /* the notice is best effort; the log has the error */ }
        }
    };
    screen.on('keypress', (ch, key) => {
        press(String(key?.name ?? ''), typeof ch === 'string' ? ch : undefined);
    });
    // ---- lifecycle -------------------------------------------------------
    const done = new Promise((resolve) => {
        finish = () => {
            if (stopped)
                return;
            stopped = true;
            clearGlitch();
            clearOverlayTimer();
            pageSearch.dispose();
            if (tickerTimer)
                clearInterval(tickerTimer);
            try {
                chrome.stop();
            }
            catch { /* leaving anyway */ }
            try {
                input.disable();
            }
            catch { /* leaving anyway */ }
            try {
                screen.destroy();
            }
            catch { /* leaving anyway */ }
            try {
                bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h');
            }
            catch { /* leaving anyway */ }
            resolve();
        };
    });
    snapshot = (0, library_1.loadSnapshot)((0, library_1.magazineRoot)(__dirname));
    startTicker();
    go({ kind: 'front' });
    // The title: once, on entry, over the front page that is already drawn under it.
    if (raiseOverlay('mag_title')) {
        counters.titles += 1;
        overlayTimer = setTimeout(dropOverlay, TITLE_MS);
        overlayTimer.unref?.();
    }
    return {
        screen,
        get layout() { return layout; },
        bannerText: () => bannerLines.map(art_1.artRowText),
        overlayText: () => overlayLines.map(art_1.artRowText),
        done,
        press,
        panelRows: () => (spreads[spreadNo] ?? []).map(layout_1.rowText),
        progressRow: () => (0, layout_1.rowText)((0, layout_1.buildProgress)(layout, spreadNo, spreads.length)),
        counterRow: () => String(progressBox.getContent()).replace(/\{[^{}]*\}/g, ''),
        footerRow: () => chrome.footerContent().replace(/\{[^{}]*\}/g, ''),
        tickerRow: () => (tickerBox ? String(tickerBox.getContent()).replace(/\{[^{}]*\}/g, '') : ''),
        viewKind: () => view.kind,
        stats: () => ({ ...counters }),
        stop: () => finish(),
    };
}
async function createApp(session) {
    const reader = await startReader(session);
    await reader.done;
}
//# sourceMappingURL=app.js.map