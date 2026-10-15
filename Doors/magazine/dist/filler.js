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
exports.FILLER_MIN_GAP = void 0;
exports.petsciiMappable = petsciiMappable;
exports.parsePiece = parsePiece;
exports.loadFiller = loadFiller;
exports.hashKey = hashKey;
exports.chooseFiller = chooseFiller;
exports.placeFiller = placeFiller;
/**
 * Filler: the artist Mortimer's ASCII clipart, set into the empty room of a spread (one piece per screen).
 *
 * A short article leaves the second and third column empty, and the last page
 * of a long one ends half way down. That space is decoration room. Sixty-five
 * pieces by Mortimer ("Mt", each signed (c)Mt - the signature is part of the
 * piece and is never cut) ship in `Doors/magazine/art/fill/` as latin1 text,
 * one file each. That folder is the one place they live: the ANSI Studio lists
 * it as an art folder and saves there in place, and this module reads nothing
 * else (the old `<board root>/Magazine/art/fill/` override is gone - two
 * folders meant the Studio's edit could lose to a copy nobody could see).
 *
 * RULES. A piece is placed whole or not at all. Filler never moves or hides
 * text (it only takes rows a column does not use), is never counted when the
 * text is paged, and carries no listing item, so the cursor skips it. ONE piece
 * per screen at most, in a wholly empty column when there is one. The choice is
 * a hash of the view and the column: the same page shows the same piece.
 *
 * THE C64. Pieces are drawn in glyphs the board's transducer must map back to
 * PETSCII. Every piece is checked at load against that transducer: one
 * character that comes out as '?' makes the piece unusable for a PETSCII
 * caller (and for any screen of forty columns or fewer).
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const petscii_1 = require("@amiexpress/bbs-door-sdk/petscii");
/** A column needs at least this many empty rows at its foot before filler is considered. */
exports.FILLER_MIN_GAP = 6;
const glyphCache = new Map();
/** True when the board's transducer renders `ch` as something other than a '?' it was not given. */
function glyphMaps(ch) {
    let ok = glyphCache.get(ch);
    if (ok === undefined) {
        ok = ch === '?' || !Array.from(new petscii_1.AnsiToPetsciiTransducer().transduce(ch)).includes(0x3f);
        glyphCache.set(ch, ok);
    }
    return ok;
}
/** Whether every glyph in `text` reaches a C64 as itself (or its fold), never as '?'. */
function petsciiMappable(text) {
    for (const ch of text)
        if (ch !== '\n' && !glyphMaps(ch))
            return false;
    return true;
}
/** Parse one piece from its bytes; null for a file that is not plain printable latin1 art. */
function parsePiece(file, bytes) {
    const text = bytes.toString('latin1').replace(/\r\n?/g, '\n');
    // Plain art only: no escape, no control character, no C1 byte.
    if (/[\x00-\x09\x0b-\x1f\x7f-\x9f]/.test(text))
        return null;
    const rows = text.split('\n').map((r) => r.replace(/\s+$/, ''));
    while (rows.length && rows[rows.length - 1] === '')
        rows.pop();
    while (rows.length && rows[0] === '')
        rows.shift();
    if (rows.length === 0)
        return null;
    const width = Math.max(...rows.map((r) => r.length));
    return {
        file,
        rows,
        width,
        height: rows.length,
        signed: rows.some((r) => r.includes('©Mt')),
        petsciiOk: petsciiMappable(rows.join('\n')),
    };
}
function piecesIn(dir) {
    let names;
    try {
        names = fs.readdirSync(dir).filter((n) => n.endsWith('.txt')).sort();
    }
    catch {
        return [];
    }
    const out = [];
    for (const name of names) {
        try {
            const piece = parsePiece(name, fs.readFileSync(path.join(dir, name)));
            if (piece)
                out.push(piece);
        }
        catch { /* an unreadable file is a missing piece */ }
    }
    return out;
}
/**
 * The pieces for one caller, from the door's `art/fill/`. A caller that reads
 * PETSCII (or a screen of forty columns or fewer) gets only the pieces that map.
 */
function loadFiller(sources, petsciiLike) {
    const pieces = sources.shippedDir ? piecesIn(path.join(sources.shippedDir, 'fill')) : [];
    return petsciiLike ? pieces.filter((p) => p.petsciiOk) : pieces;
}
/** FNV-1a, 32 bit: small, stable, and the same on every machine. */
function hashKey(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}
/**
 * The piece for one gap: those that fit `width` x `height` whole, starting at
 * the hashed one and skipping any already used on this spread. Null when
 * nothing fits or everything that fits is used.
 */
function chooseFiller(pieces, seed, width, height, used) {
    const fits = pieces.filter((p) => p.width <= width && p.height <= height);
    if (fits.length === 0)
        return null;
    const start = hashKey(seed) % fits.length;
    for (let i = 0; i < fits.length; i++) {
        const piece = fits[(start + i) % fits.length];
        if (!used.has(piece.file))
            return piece;
    }
    return null;
}
/**
 * Filler for one spread: at most ONE piece, however many columns have room.
 * `textRows[c]` is how many rows column `c` uses; `room` is the rows each
 * column has. One entry per column, null everywhere but the chosen one.
 *
 * WHERE. A column holding no text at all comes first (a contents list that
 * fills the left column gets its clipart in the right one; the list is never
 * interrupted). With several empty columns the view's hash picks one. The
 * piece is centred in an empty column, both ways. Only when every column holds
 * text does filler go into a column's tail: the largest gap first, centred in
 * that gap one blank row below the text, and only for a gap of FILLER_MIN_GAP
 * rows or more. A column that cannot take a piece whole yields to the next.
 */
function placeFiller(options, spreadNo, textRows, room, colWidth) {
    const out = textRows.map(() => null);
    const none = new Set();
    const empties = textRows.map((n, c) => (n === 0 ? c : -1)).filter((c) => c >= 0);
    if (empties.length > 0 && room >= exports.FILLER_MIN_GAP) {
        const start = hashKey(`${options.key}:${spreadNo}`) % empties.length;
        for (let i = 0; i < empties.length; i++) {
            const c = empties[(start + i) % empties.length];
            const piece = chooseFiller(options.pieces, `${options.key}:${spreadNo}:${c}`, colWidth, room, none);
            if (!piece)
                continue;
            out[c] = {
                piece,
                top: Math.floor((room - piece.height) / 2),
                indent: Math.floor((colWidth - piece.width) / 2),
            };
            return out;
        }
    }
    const byGap = textRows
        .map((n, c) => ({ c, n, gap: room - n }))
        .filter((e) => e.n > 0 && e.gap >= exports.FILLER_MIN_GAP)
        .sort((x, y) => y.gap - x.gap || x.c - y.c);
    for (const { c, n, gap } of byGap) {
        const piece = chooseFiller(options.pieces, `${options.key}:${spreadNo}:${c}`, colWidth, gap - 1, none);
        if (!piece)
            continue;
        out[c] = {
            piece,
            top: n + 1 + Math.floor((gap - 1 - piece.height) / 2),
            indent: Math.floor((colWidth - piece.width) / 2),
        };
        return out;
    }
    return out;
}
//# sourceMappingURL=filler.js.map