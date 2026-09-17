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
exports.EXPECTED_DFS_VERSION = exports.MODEL = exports.REQUIRED_ROMS = void 0;
exports.beebRoot = beebRoot;
exports.romsDir = romsDir;
exports.softwareDir = softwareDir;
exports.missingRoms = missingRoms;
exports.romIdentity = romIdentity;
exports.checkRoms = checkRoms;
exports.listTitles = listTitles;
exports.urlFor = urlFor;
exports.bareUrl = bareUrl;
/**
 * What is installed on the board: the machine's ROMs, and the software.
 *
 * Kept apart from the door so it can be tested without a terminal, and so
 * the two questions it answers stay separate - "can this board run a BBC
 * Micro at all" and "what is there to run".
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const emulator_url_1 = require("@amiexpress/bbs-door-sdk/beeb/emulator-url");
Object.defineProperty(exports, "MODEL", { enumerable: true, get: function () { return emulator_url_1.MODEL; } });
/** Disc and tape images the emulator can load. */
const DISC_EXTENSIONS = new Set(['.ssd', '.dsd', '.adf', '.adl']);
const TAPE_EXTENSIONS = new Set(['.uef', '.csw']);
/**
 * The three files a Model B needs, by the exact names the emulator asks
 * for (jsbeeb `src/models.js`: `os.rom`, `BASIC.ROM`, `b/DFS-1.2.rom`).
 * Getting one of these names wrong is a black screen, not an error.
 */
exports.REQUIRED_ROMS = ['os.rom', 'BASIC.ROM', path.join('b', 'DFS-1.2.rom')];
/**
 * The DFS version the pinned model's 8271 disc controller expects.
 *
 * A 1770-era DFS (2.2x and later) on this model cannot drive the emulated
 * controller, and the failure looks like a missing file rather than a
 * mismatched ROM.
 */
exports.EXPECTED_DFS_VERSION = '1.2';
function beebRoot(startDir = __dirname) {
    return path.join((0, settings_1.resolveBbsRoot)(startDir), 'Beeb');
}
function romsDir(startDir) {
    return path.join(beebRoot(startDir), 'roms');
}
function softwareDir(startDir) {
    return path.join(beebRoot(startDir), 'software');
}
/**
 * Which required ROMs are missing.
 *
 * Empty means the machine will boot. Anything else and the emulator shows
 * a black screen with no explanation, so the door says so first - there is
 * no open-source BBC ROM and never has been, so this is the normal state of
 * a board nobody has set up yet, not a fault.
 */
function missingRoms(startDir) {
    const dir = romsDir(startDir);
    return exports.REQUIRED_ROMS.filter(name => {
        try {
            return !fs.statSync(path.join(dir, name)).isFile();
        }
        catch {
            return true;
        }
    });
}
/**
 * What a ROM says it is.
 *
 * A sideways ROM carries its own title and version as plain text after the
 * language entry vectors - the title from offset 9, NUL-terminated, then
 * the version. Reading it is how the door can tell that a file called
 * `DFS-1.2.rom` is actually DFS 2.42, which is the difference between a
 * disc that boots and a "File not found" nobody can explain.
 *
 * Returns null for a ROM with no readable header, which is normal for the
 * OS ROM - it is not a sideways ROM and has no such string.
 */
function romIdentity(file) {
    let bytes;
    try {
        bytes = fs.readFileSync(file);
    }
    catch {
        return null;
    }
    if (bytes.length < 0x50)
        return null;
    const parts = bytes
        .subarray(9, 0x50)
        .toString('latin1')
        .split('\u0000')
        .map(part => part.trim())
        .filter(part => /^[\x20-\x7e]{2,}$/.test(part));
    if (parts.length === 0)
        return null;
    const version = parts.find(part => /^[0-9]+\.[0-9]+/.test(part)) ?? '';
    return { title: parts[0], version };
}
/**
 * The ROMs, checked for what they ARE and not only that they exist.
 *
 * A sysop who files a 1770-era DFS under the name of an 8271-era one has a
 * board that boots to BASIC and then cannot read a disc, and nothing
 * anywhere says why.
 */
function checkRoms(startDir) {
    const dir = romsDir(startDir);
    const missing = [];
    const mismatched = [];
    for (const name of exports.REQUIRED_ROMS) {
        const full = path.join(dir, name);
        try {
            if (!fs.statSync(full).isFile()) {
                missing.push(name);
                continue;
            }
        }
        catch {
            missing.push(name);
            continue;
        }
        // Only the DFS is checked: it is the one whose version has to match the
        // disc controller the model emulates, and the one people mislabel.
        if (!/DFS/i.test(name))
            continue;
        const identity = romIdentity(full);
        if (!identity)
            continue;
        const wanted = exports.EXPECTED_DFS_VERSION;
        if (identity.version && !identity.version.startsWith(wanted)) {
            mismatched.push({
                file: name,
                expected: `DFS ${wanted}x`,
                found: `${identity.title} ${identity.version}`.trim(),
            });
        }
    }
    return { missing, mismatched };
}
/** Everything in the board's software folder the emulator could load. */
function listTitles(startDir) {
    const dir = softwareDir(startDir);
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const titles = [];
    for (const entry of entries) {
        if (!entry.isFile())
            continue;
        const extension = path.extname(entry.name).toLowerCase();
        const kind = DISC_EXTENSIONS.has(extension)
            ? 'disc'
            : TAPE_EXTENSIONS.has(extension)
                ? 'tape'
                : null;
        if (!kind)
            continue;
        let bytes = 0;
        try {
            bytes = fs.statSync(path.join(dir, entry.name)).size;
        }
        catch {
            // Listed but unreadable: still show it, with an unknown size.
        }
        titles.push({ file: entry.name, name: prettyName(entry.name), kind, bytes });
    }
    return titles.sort((a, b) => a.name.localeCompare(b.name));
}
/** The URL that runs one title, through the SDK's shared builder. */
function urlFor(title, options = {}) {
    return (0, emulator_url_1.emulatorUrl)({ file: title.file, kind: title.kind, autoboot: options.autoboot });
}
/** An empty machine, for a caller who just wants BASIC. */
function bareUrl() {
    return (0, emulator_url_1.emulatorUrl)();
}
function prettyName(file) {
    return file
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
//# sourceMappingURL=library.js.map