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
exports.resolveBoardRoot = resolveBoardRoot;
exports.loadDoorCatalog = loadDoorCatalog;
/**
 * Tip-of-the-day catalog: what the board has, for the spotlight picker.
 *
 * No catalog file exists under Doors/ — the registry is Commands/BBSCmd,
 * one .info per installed door (TYPE=TS, LOCATION=Doors/<name>). This
 * reads the registry, not the directory: a door with no .info is not
 * installed and is never tipped. Descriptions come from each door's
 * package.json; a door without one still tips (command + name), because
 * the board installed it on purpose.
 *
 * Root resolution mirrors door-manager's resolveBbsRoot: BBS_DATA_DIR
 * wins when it holds a registry, else walk up from the door's own dir.
 * Everything degrades to empty lists, never a throw — a tip door that
 * crashes the login is worse than no tip door.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Ports and third-party origins: tipped occasionally, labelled as ports. */
const PORT_MARKERS = ['port', 'rebel', 'qtx', 'ported', 'bbslink', 'based on'];
function resolveBoardRoot(startDir) {
    const dataDir = process.env.BBS_DATA_DIR;
    if (dataDir && fs.existsSync(path.join(dataDir, 'Commands', 'BBSCmd')))
        return dataDir;
    let dir = startDir;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'Commands', 'BBSCmd')))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
/**
 * TOOLTYPE value from .info bytes. .info files are Amiga icons: binary
 * with NUL-padded `KEY=value` strings, not text lines — so the match
 * cannot anchor on line starts (^…$ misses `…\x1bLOCATION=Doors/x\0…`)
 * and a value ends at the first NUL/ESC/newline, not end-of-line.
 * Live 2026-09-11: linkwall.info carries TYPE=TS but never matched —
 * first the text anchor missed it, then the boundary class missed the
 * 0x08 byte before it. The lead is any non-identifier byte so a key is
 * never half of another word (XTYPES= must not read as TYPE=).
 */
function tooltype(content, key) {
    const m = new RegExp(`(?:^|[^A-Za-z0-9_])${key}=([^\\n\\r\\0\\x1b]*)`).exec(content);
    return m ? m[1].trim() : null;
}
function readManifest(doorsDir, name) {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(doorsDir, name, 'package.json'), 'utf8'));
        return { description: String(pkg.description ?? ''), author: String(pkg.author ?? '') };
    }
    catch {
        return { description: '', author: '' };
    }
}
/** Installed TypeScript doors, in-house originals first. */
function loadDoorCatalog(boardRoot) {
    if (!boardRoot)
        return [];
    let infos;
    try {
        infos = fs.readdirSync(path.join(boardRoot, 'Commands', 'BBSCmd')).filter((f) => f.endsWith('.info'));
    }
    catch {
        return [];
    }
    const doorsDir = path.join(boardRoot, 'Doors');
    const out = [];
    for (const info of infos) {
        let content;
        try {
            content = fs.readFileSync(path.join(boardRoot, 'Commands', 'BBSCmd', info), 'utf8');
        }
        catch {
            continue;
        }
        if ((tooltype(content, 'TYPE') ?? '').toUpperCase() !== 'TS')
            continue;
        const location = tooltype(content, 'LOCATION') ?? '';
        const m = /^Doors\/([^/]+)\/?$/.exec(location.trim());
        if (!m)
            continue;
        const manifest = readManifest(doorsDir, m[1]);
        const hay = `${manifest.description} ${manifest.author}`.toLowerCase();
        out.push({
            name: m[1],
            command: path.basename(info, '.info').toUpperCase(),
            description: manifest.description,
            author: manifest.author,
            inHouse: !PORT_MARKERS.some((marker) => hay.includes(marker)),
        });
    }
    out.sort((a, b) => Number(b.inHouse) - Number(a.inHouse) || a.command.localeCompare(b.command));
    return out;
}
//# sourceMappingURL=catalog.js.map