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
exports.slotKey = exports.BANNER_MAX_ROWS_40 = exports.BANNER_MAX_ROWS = exports.SECTION_ART = exports.ART_NAMES = void 0;
exports.slotFiles = slotFiles;
exports.shippedArtDir = shippedArtDir;
exports.loadArt = loadArt;
exports.ansiRows = ansiRows;
exports.seqSurface = seqSurface;
exports.seqRows = seqRows;
exports.artRows = artRows;
exports.artKindFor = artKindFor;
exports.artRowText = artRowText;
/**
 * The magazine's art: title screen, banners, the mark at the end of an article.
 *
 * Two kinds per piece, one for each kind of caller, read from ONE place - the
 * door's own `art/` folder - which is also the place the ANSI Studio writes:
 *
 *   - `.ans` is Amiga ANSI (Topaz, ISO-8859-1, read and written as latin1
 *     bytes, never as UTF-8: a high-bit glyph read as text becomes U+FFFD).
 *     Each piece is an art slot in `door.settings.json` (`art_<name>`, the
 *     door-art convention REQUESTS and MULTICHECK use), so the Studio lists
 *     it, saves into that file in place, and the slot's picker can point it
 *     at another file; `slotFiles` turns the saved values into paths.
 *   - `.seq` is C64 PETSCII. A PETSCII caller - and any caller on a 40-column
 *     screen - first gets the drawing an artist made on the Studio's C64 tab
 *     (`<board>/Screens/doors/MAG/setting:art_<name>.c64.ans`, 40-column
 *     ANSI), then the shipped `.seq`. A TELETEXT caller (forty columns on an
 *     ANSI terminal) first gets the Studio's Teletext tab drawing
 *     (`...setting:art_<name>.ttx.ans`), then falls to the C64 path - the
 *     order GLC's logo uses.
 *
 * On the live board `Doors/magazine/art/` is on the data volume and the
 * entrypoint holds back every art slot's default file, so a deploy never puts
 * the shipped placeholder over an edit (docker-entrypoint.sh, "A DOOR'S ART
 * IS NOT A CFG FILE"). A file that is missing or empty is skipped without a
 * word: no art is a valid magazine. The filler (`art/fill/`) is plain ASCII,
 * declared to the Studio as an art FOLDER (`artFolders` in the manifest), so
 * it too is edited in place, read from here alone, and held back on deploy.
 *
 * WHO DECIDES THE KIND. The session does: `bbs.isPetsciiMode()`, the same
 * question `createScreen` asks to set `screen.petscii`. This module does not
 * detect anything itself.
 *
 * HOW A `.seq` REACHES THE SCREEN. The door draws through blessed, and the
 * board's transducer turns blessed's Unicode back into PETSCII for a C64, so
 * raw PETSCII bytes cannot be written. The `.seq` is replayed through the
 * board's own `PetsciiMachine` (the reader every `.seq` on the board goes
 * through, board charset bank first), and each cell is set as its Unicode
 * glyph (`SCREENCODE_TO_UNICODE`) in the nearest-VIC colour, reverse video
 * kept as reverse video. The transducer then maps those cells back to the
 * bytes the artist drew; the tests prove that round trip cell for cell.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const petscii_1 = require("@amiexpress/bbs-door-sdk/petscii");
/** Every piece of art the door asks for, by name. */
exports.ART_NAMES = [
    'mag_title', 'mag_front', 'mag_contents', 'mag_goodbye', 'mag_article_end', 'mag_logo_small', 'mag_loading',
    'sec_hack', 'sec_scene', 'sec_graffiti', 'sec_music', 'sec_people', 'sec_archive', 'sec_stream', 'sec_general',
];
exports.SECTION_ART = {
    hack: 'sec_hack',
    scene: 'sec_scene',
    graffiti: 'sec_graffiti',
    music: 'sec_music',
    people: 'sec_people',
    archive: 'sec_archive',
    stream: 'sec_stream',
    general: 'sec_general',
};
/** Banner ceilings: five rows on an ANSI screen, four on the C64's forty columns. */
exports.BANNER_MAX_ROWS = 5;
exports.BANNER_MAX_ROWS_40 = 4;
/** The Studio's name for the slot that holds a piece: the setting key, as the section it is addressed by. */
const slotKey = (name) => `art_${name}`;
exports.slotKey = slotKey;
/**
 * Which file each slot reads, from the door's saved settings.
 *
 * A value is one name or `dir/name` inside the door's folder, as
 * `resolveArtValue` in the backend requires (no dot-first segment, so no
 * `..`); anything else is ignored and the slot keeps its default file.
 */
function slotFiles(values, doorDir) {
    const segment = '[A-Za-z0-9_-][A-Za-z0-9._-]*';
    const valid = new RegExp(`^${segment}(\\/${segment})?$`);
    const out = {};
    for (const name of exports.ART_NAMES) {
        const value = values[(0, exports.slotKey)(name)];
        if (typeof value === 'string' && valid.test(value))
            out[name] = path.join(doorDir, value);
    }
    return out;
}
/** The directory the door ships its placeholders in, from source (`Doors/magazine`) or from `dist`. */
function shippedArtDir(startDir = __dirname) {
    const base = path.basename(startDir) === 'dist' ? path.dirname(startDir) : startDir;
    return path.join(base, 'art');
}
/** The raw bytes of one file, or null when it is absent, empty or not a file. */
function readBytes(file) {
    try {
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size === 0)
            return null;
        return fs.readFileSync(file);
    }
    catch {
        return null;
    }
}
/**
 * One piece of art for one caller. A wide caller gets the slot's file, else
 * the default `.ans`. A 40-column caller gets the Studio's narrow drawing
 * (read as ANSI, so `kind` is `ans`) - a teletext caller his Teletext one
 * first, everyone the C64 one - else the shipped `.seq`. Null when none exists.
 */
function loadArt(name, kind, sources) {
    if (kind === 'seq' && sources.variantDir) {
        const alphabets = sources.teletext ? ['ttx', 'c64'] : ['c64'];
        for (const alphabet of alphabets) {
            const file = path.join(sources.variantDir, `setting:${(0, exports.slotKey)(name)}.${alphabet}.ans`);
            const bytes = readBytes(file);
            if (bytes)
                return { kind: 'ans', bytes, file };
        }
    }
    if (!sources.shippedDir)
        return null;
    const candidates = kind === 'ans' && sources.slots?.[name] ? [sources.slots[name]] : [];
    candidates.push(path.join(sources.shippedDir, `${name}.${kind}`));
    for (const file of candidates) {
        const bytes = readBytes(file);
        if (bytes)
            return { kind, bytes, file };
    }
    return null;
}
// ---------------------------------------------------------------------------
// Bytes to rows of blessed content
// ---------------------------------------------------------------------------
const RESET = '\x1b[0m';
const SGR = /^\x1b\[[0-9;]*m/;
/** blessed reads `{` as the start of a tag. */
function escapeBraces(text) {
    return text.replace(/[{}]/g, (c) => (c === '{' ? '{open}' : '{close}'));
}
/**
 * Amiga ANSI to rows: latin1 text, SGR kept, every other escape sequence (a
 * cursor move, a clear) dropped, rows clipped to `maxCols` visible cells.
 * Art moves nothing: it is drawn into a box the door has placed.
 */
function ansiRows(bytes, maxRows, maxCols) {
    const text = bytes.toString('latin1');
    const eof = text.indexOf('\x1a');
    const body = (eof >= 0 ? text.slice(0, eof) : text).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    const rows = [];
    for (const line of body.split('\n')) {
        if (rows.length >= maxRows)
            break;
        let out = '';
        let cells = 0;
        for (let i = 0; i < line.length;) {
            const rest = line.slice(i);
            if (rest[0] === '\x1b') {
                const sgr = SGR.exec(rest);
                if (sgr) {
                    out += sgr[0];
                    i += sgr[0].length;
                    continue;
                }
                const other = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(rest);
                i += other ? other[0].length : 1;
                continue;
            }
            const ch = line[i];
            i += 1;
            if (ch < ' ' || (ch >= '\x7f' && ch < '\xa0'))
                continue;
            if (cells >= maxCols)
                continue;
            out += escapeBraces(ch);
            cells += 1;
        }
        rows.push(`${out}${RESET}`);
    }
    return rows;
}
const rgb = (hex) => hex.toLowerCase();
/**
 * A `.seq` to rows: the board's PETSCII machine reads it (bank one, as the
 * board's callers are), each cell becomes a glyph in a colour, reverse video
 * stays reverse video, and trailing blank cells and rows are cut.
 */
function seqSurface(bytes) {
    const machine = new petscii_1.PetsciiMachine();
    machine.state.charsetBank = petscii_1.BOARD_CHARSET_BANK;
    machine.feed(bytes);
    return machine.state;
}
function seqRows(bytes, maxRows, maxCols) {
    const { cols, rows: height, screen, colorRam, charsetBank: bank } = seqSurface(bytes);
    const rows = [];
    for (let y = 0; y < height; y++) {
        let last = -1;
        for (let x = 0; x < Math.min(cols, maxCols); x++) {
            const code = screen[y * cols + x];
            if ((code & 0x7f) !== 0x20 || (code & 0x80))
                last = x;
        }
        let out = '';
        let colour = -1;
        let reverse = false;
        for (let x = 0; x <= last; x++) {
            const code = screen[y * cols + x];
            const colourIndex = colorRam[y * cols + x] & 0x0f;
            const rvs = (code & 0x80) !== 0;
            if (colourIndex !== colour) {
                out += `{${rgb(petscii_1.C64_PALETTE_COLODORE[colourIndex])}-fg}`;
                colour = colourIndex;
            }
            if (rvs !== reverse) {
                out += rvs ? '{inverse}' : '{/inverse}';
                reverse = rvs;
            }
            out += escapeBraces(petscii_1.SCREENCODE_TO_UNICODE[bank][code & 0x7f] || ' ');
        }
        rows.push(out === "" ? "" : `${out}{/}`);
    }
    while (rows.length > 0 && rows[rows.length - 1] === '')
        rows.pop();
    return rows.slice(0, maxRows);
}
function artRows(art, maxRows, maxCols) {
    return art.kind === 'seq' ? seqRows(art.bytes, maxRows, maxCols) : ansiRows(art.bytes, maxRows, maxCols);
}
/**
 * Which kind this caller gets. A C64 reads PETSCII, and so does any screen of
 * forty columns or fewer - the ANSI art is drawn for eighty and is never folded.
 */
function artKindFor(petscii, width) {
    return petscii || width <= 40 ? 'seq' : 'ans';
}
/** The visible text of one art row: escapes and tags gone, so a test (or a width check) reads what a caller reads. */
function artRowText(row) {
    return row
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\{(?:#[0-9a-f]{6}-fg|\/?inverse|\/)\}/gi, '')
        .replace(/\{open\}/g, '{')
        .replace(/\{close\}/g, '}');
}
//# sourceMappingURL=art.js.map