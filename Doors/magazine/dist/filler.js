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
 * Filler: the artist Mortimer's ASCII clipart, set into the empty tail of a column.
 *
 * A short article leaves the second and third column empty, and the last page
 * of a long one ends half way down. That space is decoration room. Sixty-five
 * pieces by Mortimer ("Mt", each signed (c)Mt - the signature is part of the
 * piece and is never cut) ship in `Doors/magazine/art/fill/` as latin1 text,
 * one file each; `<board root>/Magazine/art/fill/` wins when it holds any.
 *
 * RULES. A piece is placed whole or not at all. Filler never moves or hides
 * text (it only takes rows a column does not use), is never counted when the
 * text is paged, and carries no listing item, so the cursor skips it. The
 * choice is a hash of the view and the column: the same page shows the same
 * piece, and one spread never shows a piece twice.
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
 * The pieces for one caller: the sysop's `fill/` when it holds any, else the
 * shipped ones. A caller that reads PETSCII (or a screen of forty columns or
 * fewer) gets only the pieces that map.
 */
function loadFiller(sources, petsciiLike) {
    let pieces = piecesIn(path.join(sources.overrideDir, 'fill'));
    if (pieces.length === 0 && sources.shippedDir)
        pieces = piecesIn(path.join(sources.shippedDir, 'fill'));
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
 * Filler for the columns of one spread. `textRows[c]` is how many rows column
 * `c` uses; `room` is the rows each column has. One entry per column, null
 * where nothing is placed. The piece is centred in the gap, one blank row
 * away from the text above it.
 */
function placeFiller(options, spreadNo, textRows, room, colWidth) {
    const used = new Set();
    return textRows.map((n, c) => {
        const gap = room - n;
        if (gap < exports.FILLER_MIN_GAP)
            return null;
        const spacer = n > 0 ? 1 : 0;
        const piece = chooseFiller(options.pieces, `${options.key}:${spreadNo}:${c}`, colWidth, gap - spacer, used);
        if (!piece)
            return null;
        used.add(piece.file);
        return {
            piece,
            top: n + spacer + Math.floor((gap - spacer - piece.height) / 2),
            indent: Math.floor((colWidth - piece.width) / 2),
        };
    });
}
//# sourceMappingURL=filler.js.map