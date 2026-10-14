"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECTION_ORDER = exports.NEWS_SEPARATOR = exports.sourceName = exports.MIN_PANEL_ROWS = void 0;
exports.rowText = rowText;
exports.buildLayout = buildLayout;
exports.columnStep = columnStep;
exports.ageStamp = ageStamp;
exports.buildListing = buildListing;
exports.headerLine = headerLine;
exports.buildNotice = buildNotice;
exports.buildAwaitingEditor = buildAwaitingEditor;
exports.signalTag = signalTag;
exports.buildArticle = buildArticle;
exports.buildProgress = buildProgress;
exports.newsRow = newsRow;
exports.newsRows = newsRows;
exports.clipRow = clipRow;
exports.staticNewsRow = staticNewsRow;
exports.signalStrength = signalStrength;
exports.sectionLabel = sectionLabel;
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
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const magazine_1 = require("@amiexpress/bbs-door-sdk/formats/magazine");
Object.defineProperty(exports, "sourceName", { enumerable: true, get: function () { return magazine_1.sourceName; } });
const columns_1 = require("./columns");
const filler_1 = require("./filler");
const library_1 = require("./library");
/** The plain text of a row: what a C64 caller would read. */
function rowText(row) {
    return row.map((s) => s.text).join('');
}
const seg = (text, role = 'plain') => ({ text, role });
const RULE = '─';
const COLUMN_RULE = '│';
function truncate(text, width) {
    if (text.length <= width)
        return text;
    if (width <= 2)
        return text.slice(0, Math.max(0, width));
    return `${text.slice(0, width - 2)}..`;
}
function padRight(text, width) {
    return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
}
function centre(text, width, fill = ' ') {
    if (text.length >= width)
        return text.slice(0, width);
    const left = Math.floor((width - text.length) / 2);
    return fill.repeat(left) + text + fill.repeat(width - text.length - left);
}
/** A banner may not leave the panel shorter than this: a page of text still has to read. */
exports.MIN_PANEL_ROWS = 8;
function buildLayout(width, height, options = {}) {
    const w = Math.max(1, Math.floor(width) || 80);
    const h = Math.max(6, Math.floor(height) || 24);
    const effects = (0, blessed_1.effectsAllowed)(w);
    const hasTicker = options.ticker !== false;
    const footerRow = h - 1;
    const tickerRow = hasTicker ? footerRow - 1 : null;
    const progressRow = hasTicker ? footerRow - 2 : footerRow - 1;
    const withoutBanner = Math.max(1, progressRow - 1);
    // The banner takes its rows from the panel, and gives them back when the screen is too short to spare them.
    const wanted = Math.max(0, Math.floor(options.banner ?? 0));
    const bannerRows = withoutBanner - wanted >= exports.MIN_PANEL_ROWS ? wanted : 0;
    const panelTop = 1 + bannerRows;
    return {
        width: w,
        height: h,
        geometry: (0, columns_1.columnGeometry)(w),
        effects,
        collapseChrome: (0, blessed_1.getCompactProfile)(w).collapseChrome,
        headerRow: 0,
        bannerRows,
        tickerRow,
        panelTop,
        panelHeight: Math.max(1, progressRow - panelTop),
        progressRow,
        footerRow,
    };
}
/** One panel row: margin, then each column padded to the measure, a rule between. */
function composeRow(geometry, cells) {
    const { colWidth, gutter, margin } = geometry;
    const row = [];
    if (margin > 0)
        row.push(seg(' '.repeat(margin)));
    cells.forEach((cell, c) => {
        if (c > 0 && gutter > 0) {
            const pad = Math.floor((gutter - 1) / 2);
            row.push(seg(`${' '.repeat(pad)}${COLUMN_RULE}${' '.repeat(gutter - 1 - pad)}`, 'dim'));
        }
        if (cell?.raw !== undefined) {
            row.push({ text: padRight(cell.text, colWidth), role: cell.role, raw: cell.raw + ' '.repeat(Math.max(0, colWidth - cell.text.length)) });
        }
        else {
            row.push(seg(padRight(cell?.text ?? '', colWidth), cell?.role ?? 'plain'));
        }
    });
    return row;
}
/**
 * The columns of a spread with filler set into the empty tail of each. The
 * text cells are untouched; the filler takes rows no text uses, so it can move
 * nothing and hide nothing, and it carries no `item`, so no cursor lands on it.
 */
function withFiller(columns, rows, geometry, spreadNo, fill) {
    if (!fill || fill.pieces.length === 0)
        return columns;
    const placed = (0, filler_1.placeFiller)(fill, spreadNo, columns.map((c) => c.length), rows, geometry.colWidth);
    return columns.map((col, c) => {
        const at = placed[c];
        if (!at)
            return col;
        const out = col.slice();
        at.piece.rows.forEach((text, i) => {
            out[at.top + i] = { text: ' '.repeat(at.indent) + text, role: 'dim' };
        });
        return out;
    });
}
function composeSpread(geometry, columns, rows) {
    const out = [];
    for (let r = 0; r < rows; r++)
        out.push(composeRow(geometry, columns.map((col) => col[r])));
    return out;
}
/** A row that spans every column: kicker, headline, rule. */
function spanRow(geometry, text, role) {
    const row = [];
    if (geometry.margin > 0)
        row.push(seg(' '.repeat(geometry.margin)));
    row.push(seg(padRight(text, geometry.contentWidth), role));
    return row;
}
function blankRows(n) {
    return Array.from({ length: Math.max(0, n) }, () => []);
}
/**
 * Left or Right in a list: the entry at the same visual row in the
 * neighbouring column, or the nearest entry when that row is a gap or a
 * heading (ties go up). `'edge'` when there is no neighbouring column with an
 * entry in it - the caller turns the page instead. `null` when the selected
 * entry is not on this spread.
 */
function columnStep(columns, selectedIndex, delta) {
    let from = -1;
    let row = -1;
    columns.forEach((col, c) => {
        if (from >= 0)
            return;
        const at = col.indexOf(selectedIndex);
        if (at >= 0) {
            from = c;
            row = at;
        }
    });
    if (from < 0)
        return null;
    const target = columns[from + delta];
    if (!target)
        return 'edge';
    // The row it is on, else the nearest entry; of two equally near, the one
    // that starts nearer (so Left undoes Right), then the upper.
    const start = new Map();
    target.forEach((index, r) => { if (index !== null && !start.has(index))
        start.set(index, r); });
    let best = -1;
    let bestDistance = Infinity;
    let bestStart = Infinity;
    for (let r = 0; r < target.length; r++) {
        const index = target[r];
        if (index === null)
            continue;
        const distance = Math.abs(r - row);
        const startDistance = Math.abs((start.get(index) ?? r) - row);
        if (distance < bestDistance || (distance === bestDistance && startDistance < bestStart)) {
            best = index;
            bestDistance = distance;
            bestStart = startDistance;
        }
    }
    return best < 0 ? 'edge' : best;
}
/** Digits a page number is right-aligned in. */
const PAGE_DIGITS = 3;
function itemCells(item, index, selected, colWidth) {
    const titleWidth = Math.max(1, colWidth - 1 - 1 - PAGE_DIGITS);
    const prefix = `${item.lead ? 'LEAD ' : item.front ? '^ ' : ''}${item.bookmarked ? '* ' : ''}`;
    const lines = wrapTitle(prefix + (0, library_1.paintSafe)(item.title), titleWidth, 2);
    const role = selected ? 'selected' : item.unread ? 'unread' : 'plain';
    const mark = selected ? '>' : ' ';
    const page = String(item.page).padStart(PAGE_DIGITS, ' ');
    const cells = [];
    lines.forEach((line, i) => {
        const left = padRight(line, titleWidth);
        cells.push({
            text: i === 0 ? `${mark}${left} ${page}` : ` ${left}`,
            role,
            item: index,
            keep: item.article !== undefined || i < lines.length - 1,
        });
    });
    if (item.article) {
        const inner = Math.max(1, colWidth - 1);
        const tag = `ARTICLE // ${(0, library_1.paintSafe)((0, magazine_1.sourceName)(item.article.source)).toUpperCase()} // ${item.article.stamp}`;
        cells.push({ text: ` ${truncate(tag, inner)}`, role: 'dim', item: index });
    }
    return cells;
}
/** `TODAY`, `YESTERDAY`, `3D AGO`, else the date: how old a story is. */
function ageStamp(date, now) {
    const day = date.slice(0, 10);
    const then = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(then))
        return 'UNDATED';
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const days = Math.round((today - then) / 86400000);
    if (days < 0)
        return day;
    if (days === 0)
        return 'TODAY';
    if (days === 1)
        return 'YESTERDAY';
    return days < 7 ? `${days}D AGO` : day;
}
/** Wrap a title onto at most `maxLines` rows; the last is cut with `..` if there is more. */
function wrapTitle(text, width, maxLines) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length <= width) {
            line = next;
            continue;
        }
        if (line)
            lines.push(line);
        line = word.length > width ? word.slice(0, width) : word;
    }
    if (line)
        lines.push(line);
    if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines);
        kept[maxLines - 1] = truncate(`${kept[maxLines - 1]} ${lines[maxLines]}`, width);
        return kept;
    }
    return lines.length ? lines : [''];
}
/** `--- LABEL ---` centred across one column. */
function headingCell(label, colWidth) {
    const inner = ` ${truncate(label, Math.max(1, colWidth - 6))} `;
    return { text: centre(inner, colWidth, RULE), role: 'accent' };
}
/**
 * Blocks to spreads of rows. The first row of every spread is the view header
 * (`headerLeft` / `headerRight`), the rest is the newspaper flow.
 */
function buildListing(blocks, selectedStoryId, layout, header, fill) {
    const { geometry } = layout;
    const itemIds = [];
    const cells = [];
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
        if (afterItem)
            cells.push({ text: '', role: 'plain' });
        afterItem = true;
        const index = itemIds.length;
        itemIds.push(block.item.storyId);
        cells.push(...itemCells(block.item, index, block.item.storyId === selectedStoryId, geometry.colWidth));
    }
    const bodyHeight = Math.max(1, layout.panelHeight - 1);
    const flowed = (0, columns_1.flowColumns)(cells, geometry.cols, { first: bodyHeight, rest: bodyHeight }, {
        isBlank: (c) => c.text === '' && c.item === undefined,
        keepWithNext: (c) => c.item === -1 || c.keep === true,
    });
    const selectedIndex = selectedStoryId ? itemIds.indexOf(selectedStoryId) : -1;
    let selectedSpread = 0;
    const spreadFirst = [];
    const grid = flowed.map((spread) => spread.columns.map((col) => col.map((c) => (c.item !== undefined && c.item >= 0 ? c.item : null))));
    const spreads = flowed.map((spread, n) => {
        const firstCell = spread.columns.flat().find((c) => c.item !== undefined && c.item >= 0);
        spreadFirst.push(firstCell?.item !== undefined ? itemIds[firstCell.item] : null);
        if (selectedIndex >= 0 && spread.columns.some((col) => col.some((c) => c.item === selectedIndex))) {
            selectedSpread = n;
        }
        const head = spanRow(geometry, headerLine(header.left, header.right, geometry.contentWidth), 'dim');
        return [head, ...composeSpread(geometry, withFiller(spread.columns, bodyHeight, geometry, n, fill), bodyHeight)];
    });
    return { spreads, selectedSpread, itemIds, spreadFirst, grid };
}
/** `LEFT ........ RIGHT` across the set text. */
function headerLine(left, right, width) {
    // `right` is the door's own (the sparkline is not Latin-1); only `left` can carry story text.
    const l = (0, library_1.paintSafe)(left);
    const r = right;
    if (l.length + r.length + 1 > width)
        return truncate(l, width);
    return l + ' '.repeat(width - l.length - r.length) + r;
}
/** A centred notice that fills the panel: a title, then lines of detail. */
function buildNotice(layout, title, detail) {
    const { geometry, panelHeight } = layout;
    const w = geometry.contentWidth;
    const rows = blankRows(panelHeight);
    const top = Math.max(0, Math.floor(panelHeight / 2) - 2);
    const put = (r, text, role) => {
        if (r >= 0 && r < panelHeight)
            rows[r] = spanRow(geometry, centre(truncate(text, w), w), role);
    };
    put(top, RULE.repeat(Math.min(w, 24)), 'rule');
    put(top + 1, title, 'warn');
    detail.forEach((line, i) => put(top + 2 + i, line, 'dim'));
    return rows;
}
/** The front page when no human has approved anything yet. Never a guess. */
function buildAwaitingEditor(layout) {
    return buildNotice(layout, 'AWAITING EDITOR', [
        'No story has been approved',
        'for the front page.',
        'Press C for the full contents.',
    ]);
}
/** `[ NEWS // HACK // 2026-10-13 ]` - a signal tag, not a label. */
function signalTag(story) {
    const date = story.date ? story.date.slice(0, 10) : 'UNDATED';
    return `[ ${story.format} // ${deskCode(story.desk)} // ${date} ]`;
}
function deskCode(desk) {
    return desk.toUpperCase();
}
const HEADLINE_MAX_ROWS = 3;
function buildArticle(story, layout, endMark = [], fill) {
    const { geometry, panelHeight } = layout;
    const w = geometry.contentWidth;
    const kicker = spanRow(geometry, truncate(signalTag(story), w), 'tag');
    const headLines = wrapTitle((0, library_1.paintSafe)(story.headline).toUpperCase(), w, HEADLINE_MAX_ROWS);
    const head = [
        kicker,
        ...headLines.map((line) => spanRow(geometry, line, 'head')),
        spanRow(geometry, RULE.repeat(w), 'rule'),
    ];
    // A story with full text is set from its body; the summary is the teaser the
    // body replaces, not a standfirst printed above it.
    const paragraphs = (0, library_1.paintSafe)(story.body || story.summary).split(/\n+/);
    const body = (0, columns_1.setParagraphs)(paragraphs, geometry.colWidth);
    const cells = body.map((text) => ({ text, role: 'plain' }));
    // The site name only: the reader never prints an address.
    const source = (0, library_1.paintSafe)((0, magazine_1.sourceName)(story.source)).trim();
    const trailer = [];
    if (source)
        trailer.push({ text: truncate(`>> SRC ${source}`, geometry.colWidth), role: 'source' });
    if (cells.length === 0)
        cells.push({ text: '(no summary)', role: 'dim' });
    if (trailer.length)
        cells.push({ text: '', role: 'plain' }, ...trailer);
    // The mark closes the text: it flows with it, after the last line.
    if (endMark.length)
        cells.push({ text: '', role: 'plain' }, ...endMark.map((m) => ({ text: m.text, role: 'plain', raw: m.raw })));
    const firstHeight = Math.max(1, panelHeight - head.length);
    const restHeight = Math.max(1, panelHeight - 1);
    const flowed = (0, columns_1.flowColumns)(cells, geometry.cols, { first: firstHeight, rest: restHeight }, {
        isBlank: (c) => c.text === '',
    });
    const running = truncate((0, library_1.paintSafe)(story.headline).toUpperCase(), w);
    const spreads = flowed.map((spread, n) => {
        if (n === 0) {
            const rows = [...head, ...composeSpread(geometry, withFiller(spread.columns, firstHeight, geometry, n, fill), firstHeight)];
            return rows.slice(0, panelHeight);
        }
        return [spanRow(geometry, running, 'dim'), ...composeSpread(geometry, withFiller(spread.columns, restHeight, geometry, n, fill), restHeight)]
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
function buildProgress(layout, position, total) {
    const w = layout.width;
    const safeTotal = Math.max(1, total);
    const at = Math.min(Math.max(0, position), safeTotal - 1);
    const counter = ` Page ${at + 1} of ${safeTotal}`;
    const line = Math.max(1, w - 1 - counter.length);
    const filled = Math.max(1, Math.round((line * (at + 1)) / safeTotal));
    const row = [seg(RULE.repeat(filled), 'accent')];
    if (line - filled > 0)
        row.push(seg(RULE.repeat(line - filled), 'dim'));
    if (counter)
        row.push(seg(counter, 'dim'));
    return row;
}
/** The wire's separator: U+25A0 is a solid block on a C64 (reverse space) and CP437 0xFE. */
exports.NEWS_SEPARATOR = '  \u25A0  ';
const cleanNews = (text) => (0, library_1.paintSafe)(text).replace(/\s+/g, ' ').trim().replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'));
/** `SOURCE // Headline`; just the headline when the feed named no source. */
function newsRow(item) {
    const source = cleanNews(item.source).toUpperCase();
    const title = cleanNews(item.title);
    return source ? [seg(source, 'source'), seg(' // ', 'dim'), seg(title, 'dim')] : [seg(title, 'dim')];
}
/** The wire as rows, one per headline; a placeholder when there is none. */
function newsRows(items) {
    const rows = items.map(newsRow).filter((r) => rowText(r).trim() !== '');
    return rows.length ? rows : [[seg('NO TRANSMISSIONS', 'dim')]];
}
/** A row cut to `width` columns, roles kept. */
function clipRow(row, width) {
    const out = [];
    let left = Math.max(0, width);
    for (const part of row) {
        if (left <= 0)
            break;
        out.push(part.text.length <= left ? part : seg(part.text.slice(0, left), part.role));
        left -= part.text.length;
    }
    return out;
}
/** The 40-column wire: headline number `n` (wrapping), one margin column, cut to the width. */
function staticNewsRow(items, n, width) {
    const rows = newsRows(items);
    const at = ((n % rows.length) + rows.length) % rows.length;
    return clipRow([seg(' '), ...rows[at]], width);
}
/** `SIGNAL ` plus the sparkline, or '' when there is nothing to show. */
function signalStrength(perDay, spark) {
    return perDay.length > 1 ? `SIGNAL ${spark([...perDay])}` : '';
}
/** Section names for the section cycle, in reading order. */
exports.SECTION_ORDER = [
    'hack', 'scene', 'graffiti', 'music', 'people', 'archive', 'stream', 'general',
];
function sectionLabel(desk) {
    return desk ? magazine_1.DESK_LABEL[desk] : 'ALL SECTIONS';
}
//# sourceMappingURL=layout.js.map