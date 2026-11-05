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
exports.NO_ART = void 0;
exports.loadArtFile = loadArtFile;
exports.loadCtopArt = loadCtopArt;
/**
 * The sysop's own drawing above and below the table.
 *
 * Conftop-II splices in `Conf<n>/Conftop.header` and `Conf<n>/Conftop.tailer`
 * verbatim, falling back to a copy in the door's own directory
 * (ctop.e:902-929). A C64 caller gets the narrow copy where the sysop drew
 * one, under the board's ONE width-variant rule - `Conftop.header_C64`, the
 * same `_C64` suffix the show-file service resolves screens with.
 *
 * The file is read as latin-1 and its lines go out as they are. Amiga art is
 * bytes, not text: decoding it as UTF-8 turns every high-bit glyph into a
 * replacement character, which is the shape that has damaged art in this tree
 * before.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const narrow_art_1 = require("@amiexpress/bbs-door-sdk/utils/narrow-art");
exports.NO_ART = { header: [], tailer: [] };
function readLines(file) {
    try {
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size === 0)
            return null;
        return fs.readFileSync(file, 'latin1').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    }
    catch {
        return null;
    }
}
/**
 * One drawing, narrow copy first when the caller's screen is narrow.
 *
 * `dirs` are searched in order, as the door searches them: the conference
 * first, then the door's own directory.
 */
function loadArtFile(dirs, name, narrow) {
    for (const dir of dirs) {
        const candidate = path.join(dir, name);
        const spellings = narrow ? [...(0, narrow_art_1.narrowVariants)(candidate), candidate] : [candidate];
        for (const file of spellings) {
            const lines = readLines(file);
            if (lines)
                return lines;
        }
    }
    return [];
}
/** Both drawings. */
function loadCtopArt(dirs, narrow) {
    return {
        header: loadArtFile(dirs, 'Conftop.header', narrow),
        tailer: loadArtFile(dirs, 'Conftop.tailer', narrow),
    };
}
//# sourceMappingURL=art.js.map