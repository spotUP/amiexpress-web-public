"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_TEXT = exports.COMPACT_HINTS = exports.HINTS = exports.MAGAZINE_TITLE = exports.BOOKMARK_KEY = exports.READ_KEY = void 0;
exports.startReader = startReader;
exports.createApp = createApp;
/**
 * MAG - the Underground Mag reader.
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
 * layout: the rail, the ticker and the headline glitch do not exist at 40
 * columns.
 */
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const magazine_1 = require("@amiexpress/bbs-door-sdk/formats/magazine");
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const library_1 = require("./library");
const layout_1 = require("./layout");
exports.READ_KEY = 'read-story-ids';
exports.BOOKMARK_KEY = 'bookmark-story-ids';
const STORED_CAP = 500;
const TICKER_HEADLINES = 8;
const TICKER_STEP_MS = 250;
const SIGNAL_DAYS = 8;
/** The headline settles for this long before the one glitch lands. */
const GLITCH_DELAY_MS = 450;
const GLITCH_HOLD_MS = 160;
const DIGIT_COMMIT_MS = 1500;
exports.MAGAZINE_TITLE = 'UNDERGROUND MAG';
exports.HINTS = [
    { key: 'Arrows', does: 'Page' },
    { key: 'C', does: 'Contents' },
    { key: 'F', does: 'Front' },
    { key: 'S', does: 'Section' },
    { key: 'B', does: 'Bookmark' },
    { key: '/', does: 'Search' },
    { key: '?', does: 'Help' },
    { key: 'Q', does: 'Quit' },
];
/** Forty columns: only what a caller cannot guess. */
exports.COMPACT_HINTS = [
    { key: 'C', does: 'Contents' },
    { key: '?', does: 'Help' },
    { key: 'Q', does: 'Quit' },
];
exports.HELP_TEXT = [
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
async function startReader(session) {
    const { bbs, storage } = session;
    const theme = bbs?.getTheme ? bbs.getTheme() : ((0, theme_1.themeById)('uprough-neon') ?? theme_1.UPROUGH_NEON);
    const t = theme.tokens;
    const s = (0, theme_1.themeStyles)(theme);
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
    const screen = (0, blessed_helpers_1.createScreen)(bbs, { title: exports.MAGAZINE_TITLE });
    const width = screen.width || 80;
    const height = screen.height || 24;
    const layout = (0, layout_1.buildLayout)(width, height, { ticker: showTicker });
    const input = new door_input_manager_1.DoorInputManager(session, screen, {
        enableGameMode: false,
        enableGrabKeys: false,
        enableMouse: false,
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
        title: layout.collapseChrome ? exports.MAGAZINE_TITLE : `${exports.MAGAZINE_TITLE} // SIGNAL TERMINAL`,
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
    let selected = null;
    let headline = null;
    let panelText = '';
    let digits = '';
    let digitTimer = null;
    let glitchTimer = null;
    let repairTimer = null;
    let modalOpen = false;
    const counters = { glitches: 0, tickerSteps: 0, intervals: 0 };
    let stopped = false;
    let finish = () => { };
    const byId = (id) => snapshot.index.find((e) => e.storyId === id);
    const listingBlocks = (entries, headings) => {
        const blocks = [];
        const item = (e) => ({
            kind: 'item',
            item: {
                storyId: e.storyId,
                page: e.page,
                title: e.title,
                unread: !read.has(e.storyId),
                bookmarked: bookmarks.has(e.storyId),
            },
        });
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
        let l = (0, layout_1.buildListing)(blocks, selected, layout, header);
        if (selected === null || !l.itemIds.includes(selected)) {
            selected = l.itemIds[0] ?? null;
            l = (0, layout_1.buildListing)(blocks, selected, layout, header);
        }
        listIds = l.itemIds;
        spreadFirst = l.spreadFirst;
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
            showListing([{ kind: 'heading', label: magazine_1.DESK_LABEL.general }, ...listingBlocks(entries, false)], 'FRONT PAGE - THE EDITOR\'S CHOICE', entries);
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
            const article = (0, layout_1.buildArticle)(story, layout);
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
    const setStatus = (text) => chrome.setFooterSuffix(text ? `  ${text}` : '');
    const go = (next, keepSelection = false) => {
        snapshot = (0, library_1.loadSnapshot)((0, library_1.magazineRoot)(__dirname));
        view = next;
        if (!keepSelection && next.kind !== 'article')
            selected = null;
        build();
        if (next.kind === 'article') {
            read.add(next.storyId);
            persist(exports.READ_KEY, read);
        }
        paint();
    };
    // ---- ticker ----------------------------------------------------------
    let tickerTimer = null;
    const startTicker = () => {
        if (!tickerBox)
            return;
        const newest = [...snapshot.index].sort((a, b) => b.date.localeCompare(a.date)).slice(0, TICKER_HEADLINES);
        const text = (0, layout_1.tickerText)(newest.map((e) => e.title)).replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'));
        const scroll = (0, bbs_door_sdk_1.createScrollText)({ text, width: Math.max(1, layout.width - 2), gap: '   //   ' });
        let step = 0;
        const frame = () => tickerBox.setContent(` ${s.dim(scroll.frame(step))}`);
        frame();
        if (scroll.overflows) {
            counters.intervals += 1;
            tickerTimer = setInterval(() => { step += 1; counters.tickerSteps += 1; frame(); render(); }, TICKER_STEP_MS);
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
    const page = (delta) => {
        if (view.kind === 'article') {
            const next = spreadNo + delta;
            if (next >= 0 && next < spreads.length) {
                spreadNo = next;
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
    const jumpToPage = (n) => {
        const entry = snapshot.index.find((e) => e.page === n);
        if (!entry) {
            setStatus(`No page ${n}`);
            render();
            return;
        }
        openStory(entry.storyId, view.kind === 'article' ? view.list : listIds.length ? listIds : snapshot.index.map((e) => e.storyId));
    };
    const commitDigits = () => {
        if (digitTimer) {
            clearTimeout(digitTimer);
            digitTimer = null;
        }
        const n = Number(digits);
        digits = '';
        setStatus('');
        if (Number.isFinite(n) && n > 0)
            jumpToPage(n);
        else
            render();
    };
    const modalDone = () => {
        modalOpen = false;
        render();
    };
    const openHelp = () => {
        modalOpen = true;
        const modal = (0, blessed_1.docModal)({
            parent: screen,
            title: `${exports.MAGAZINE_TITLE} help`,
            content: exports.HELP_TEXT,
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
    // ---- keys ------------------------------------------------------------
    const press = (name, ch) => {
        if (stopped || modalOpen)
            return;
        const c = (ch ?? '').toLowerCase();
        if (/^[0-9]$/.test(c)) {
            digits = (digits + c).slice(-3);
            setStatus(`Page ${digits}_`);
            if (digitTimer)
                clearTimeout(digitTimer);
            digitTimer = setTimeout(commitDigits, DIGIT_COMMIT_MS);
            if (digits.length === 3)
                commitDigits();
            else
                render();
            return;
        }
        if (digits && name === 'enter') {
            commitDigits();
            return;
        }
        if (digits && name === 'escape') {
            digits = '';
            if (digitTimer) {
                clearTimeout(digitTimer);
                digitTimer = null;
            }
            setStatus('');
            render();
            return;
        }
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
            case 'pageup':
                page(-1);
                return;
            case 'right':
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
                finish();
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
            if (digitTimer)
                clearTimeout(digitTimer);
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
    return {
        screen,
        layout,
        done,
        press,
        panelRows: () => (spreads[spreadNo] ?? []).map(layout_1.rowText),
        progressRow: () => (0, layout_1.rowText)((0, layout_1.buildProgress)(layout, spreadNo, spreads.length)),
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