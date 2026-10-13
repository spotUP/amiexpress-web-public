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
exports.magazineRoot = magazineRoot;
exports.loadIndex = loadIndex;
exports.loadFront = loadFront;
exports.loadSnapshot = loadSnapshot;
exports.loadStory = loadStory;
exports.paintSafe = paintSafe;
exports.storiesPerDay = storiesPerDay;
exports.searchStories = searchStories;
/**
 * The magazine on disk, as the reader sees it.
 *
 * The board's content layer (web/backend/src/services/magazine) writes
 * `Magazine/index.json`, `Magazine/frontpage.json` and one
 * `Magazine/stories/<id>.json` per story. This module only READS them, and
 * never the `pages/pNNN.txt` teletext output: those are 40-column pre-wrapped
 * text with the row roles baked into SGR, so a reader that re-flowed them
 * into columns would be guessing.
 *
 * Everything is stale-safe. The magazine is republished while callers read,
 * so the view re-reads on entry and tolerates a missing directory, a missing
 * file, a half-written file or a story that has since gone: each degrades to
 * "less magazine", never to an exception on a caller's screen.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const magazine_1 = require("@amiexpress/bbs-door-sdk/formats/magazine");
/** `<bbsRoot>/Magazine`, found the way every other board path is found. */
function magazineRoot(startDir = __dirname) {
    return path.join((0, settings_1.resolveBbsRoot)(startDir), magazine_1.MAGAZINE_DIR);
}
function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
        return null;
    }
}
function isIndexEntry(value) {
    if (!value || typeof value !== 'object')
        return false;
    const e = value;
    return typeof e.page === 'number' && typeof e.storyId === 'string' && typeof e.title === 'string'
        && typeof e.desk === 'string' && typeof e.date === 'string';
}
/** `index.json`, entries that do not have the shape dropped. */
function loadIndex(root = magazineRoot()) {
    const parsed = readJson(path.join(root, magazine_1.MAGAZINE_INDEX_FILE));
    if (!Array.isArray(parsed))
        return [];
    return parsed.filter(isIndexEntry).sort((a, b) => a.page - b.page);
}
/** `frontpage.json`: the editor's order, and only the editor's. */
function loadFront(root = magazineRoot()) {
    const parsed = readJson(path.join(root, magazine_1.MAGAZINE_FRONTPAGE_FILE));
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
}
function loadSnapshot(root = magazineRoot()) {
    return { index: loadIndex(root), front: loadFront(root) };
}
/** A story id is a hex hash; anything else is not a file name we will build. */
const STORY_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** One story, or null when it is gone or unreadable. */
function loadStory(storyId, root = magazineRoot()) {
    if (!STORY_ID.test(storyId))
        return null;
    const parsed = readJson(path.join(root, magazine_1.MAGAZINE_STORIES_DIR, `${storyId}.json`));
    if (!parsed || typeof parsed !== 'object')
        return null;
    const s = parsed;
    if (typeof s.id !== 'string' || typeof s.headline !== 'string')
        return null;
    return {
        ...s,
        summary: typeof s.summary === 'string' ? s.summary : '',
        source: typeof s.source === 'string' ? s.source : '',
        date: typeof s.date === 'string' ? s.date : '',
    };
}
/**
 * Typographic characters feeds love, folded to what an Amiga and a C64 can
 * show, then anything left outside Latin-1 becomes `?`. The reader prints
 * other people's text, so this is the paint boundary (the TIP door does the
 * same for the same reason).
 */
function paintSafe(text) {
    return text
        .replace(/[‘’‚]/g, "'")
        .replace(/[“”„]/g, '"')
        .replace(/[–—−]/g, '-')
        .replace(/…/g, '...')
        .replace(/[\r\t]/g, ' ')
        .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '?');
}
/** Stories per calendar day, oldest first: the data behind the desk sparkline. */
function storiesPerDay(entries, days) {
    const counts = new Map();
    for (const e of entries) {
        const day = e.date.slice(0, 10);
        counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    const latest = [...counts.keys()].sort().slice(-days);
    return latest.map((d) => counts.get(d) ?? 0);
}
/**
 * Stories whose headline or summary contain every word of the query, in the magazine's own page order.
 */
function searchStories(entries, query, load = (id) => loadStory(id), limit = 200) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return [];
    const out = [];
    for (const entry of entries) {
        const story = load(entry.storyId);
        const haystack = `${entry.title} ${story?.headline ?? ''} ${story?.summary ?? ''}`.toLowerCase();
        if (words.every((w) => haystack.includes(w)))
            out.push(entry);
        if (out.length >= limit)
            break;
    }
    return out;
}
//# sourceMappingURL=library.js.map