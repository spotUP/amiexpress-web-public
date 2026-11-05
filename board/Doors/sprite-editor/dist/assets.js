"use strict";
/**
 * The studio's window onto every door's assets - guarded.
 *
 * The rule is the door-delete incident's, verbatim: a resolved-path guard,
 * not a trusted string. Every path the UI can reach funnels through
 * resolveAssetPath, which resolves first and compares after, so no
 * combination of dots, slashes or absolute paths escapes
 * Doors/<door>/<kind>/.
 *
 * Server-side fs on purpose: this door is server-side blessed (like the
 * ANSI editor it forks), so it reads the same disk the doors run from.
 * No RPC, no copies, no drift.
 */
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
exports.DOORS_ROOT = void 0;
exports.resolveAssetPath = resolveAssetPath;
exports.listDoorsWithSprites = listDoorsWithSprites;
exports.listSprites = listSprites;
exports.readSprite = readSprite;
exports.writeSprite = writeSprite;
exports.listArt = listArt;
exports.readArt = readArt;
exports.writeArt = writeArt;
const fs = __importStar(require("fs"));
const path_1 = require("path");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
/**
 * Doors/, found by walking up from wherever this file runs - which is
 * Doors/sprite-editor under tsx and Doors/sprite-editor/dist in
 * production, the same split the Pengo sprite loading handles.
 */
exports.DOORS_ROOT = (() => {
    let dir = __dirname;
    while ((0, path_1.basename)(dir) !== 'Doors' && (0, path_1.dirname)(dir) !== dir) {
        dir = (0, path_1.dirname)(dir);
    }
    if ((0, path_1.basename)(dir) !== 'Doors') {
        throw new Error(`sprite-editor cannot find Doors/ above ${__dirname}`);
    }
    return dir;
})();
/** Resolve one asset path, or throw. The only door to the filesystem. */
function resolveAssetPath(door, kind, file) {
    const base = (0, path_1.resolve)(exports.DOORS_ROOT, door, kind);
    const target = (0, path_1.resolve)(base, file);
    // Containment FIRST - the base itself can escape when the DOOR argument
    // carries traversal, and the '.'-listing shortcut must not run before
    // this is settled. Review-caught 2026-08-31: the shortcut-first ordering
    // let resolveAssetPath('..', 'sprites', '.') list outside Doors/.
    if (!base.startsWith(exports.DOORS_ROOT + path_1.sep)) {
        throw new Error(`asset path outside ${door}/${kind}: ${file}`);
    }
    if (target === base)
        return base; // the directory itself, for listing
    if (!target.startsWith(base + path_1.sep)) {
        throw new Error(`asset path outside ${door}/${kind}: ${file}`);
    }
    return target;
}
/** Door directories that ship at least one sprite sheet, sorted. */
function listDoorsWithSprites() {
    return fs.readdirSync(exports.DOORS_ROOT, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => {
        try {
            return fs.readdirSync((0, path_1.join)(exports.DOORS_ROOT, name, 'sprites'))
                .some(f => f.endsWith('.sprite.json'));
        }
        catch {
            return false; // no sprites/ directory - not a sprite door
        }
    })
        .sort();
}
/** Sprite sheet filenames in one door, sorted. */
function listSprites(door) {
    const dir = resolveAssetPath(door, 'sprites', '.');
    return fs.readdirSync(dir).filter(f => f.endsWith('.sprite.json')).sort();
}
/** One sheet, parsed and validated - a bad file throws with its name. */
function readSprite(door, file) {
    const path = resolveAssetPath(door, 'sprites', file);
    return (0, cell_art_1.parseSprite)(JSON.parse(fs.readFileSync(path, 'utf8')), file);
}
/** Write one sheet: guarded path, validated content, atomic replace. */
function writeSprite(door, file, sprite) {
    const path = resolveAssetPath(door, 'sprites', file);
    const json = (0, cell_art_1.serializeSprite)(sprite); // throws before any disk touch
    const tmp = `${path}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, path); // atomic on the same filesystem
}
/** `*.ans` files in a door's art/ directory, sorted; [] when none. */
function listArt(door) {
    try {
        const dir = resolveAssetPath(door, 'art', '.');
        return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.ans')).sort();
    }
    catch {
        return []; // no art/ directory is a normal state, not an error
    }
}
function readArt(door, file) {
    return fs.readFileSync(resolveAssetPath(door, 'art', file));
}
function writeArt(door, file, data) {
    const path = resolveAssetPath(door, 'art', file);
    fs.mkdirSync((0, path_1.dirname)(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, path);
}
