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
exports.amigaSafe = amigaSafe;
exports.resolveBoardRoot = resolveBoardRoot;
exports.loadDoorCatalog = loadDoorCatalog;
/**
 * Tip-of-the-day catalog: what the board has, for the spotlight picker.
 *
 * Thin adapter over the SDK (`@amiexpress/bbs-door-sdk/catalog`): the
 * registry scan, binary-safe tooltype parsing and manifest join live
 * there once for every door. What stays here is TIP's own: the Amiga
 * charset rule and the TS-only, port-flagged view the picker eats.
 */
const fs = __importStar(require("fs"));
const catalog_1 = require("@amiexpress/bbs-door-sdk/catalog");
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
/**
 * The board speaks Amiga Latin-1 both directions now, so U+0020-U+00FF
 * paints. Anything above (em dashes, ellipses, emoji a sysop pasted
 * into a description) does not - one '?' each, never a crash, never a
 * silent drop of the whole tip. Charset is not catalog, so it stays
 * door-local.
 */
function amigaSafe(text) {
    return text.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
}
function resolveBoardRoot(startDir) {
    const root = (0, settings_1.resolveBbsRoot)(startDir);
    return fs.existsSync(`${root}/Commands/BBSCmd`) ? root : null;
}
/** Installed TypeScript doors, in-house originals first. */
function loadDoorCatalog(boardRoot) {
    if (!boardRoot)
        return [];
    const catalog = (0, catalog_1.loadDoorCatalog)(boardRoot, (0, catalog_1.nodeCatalogIO)(fs), { types: ['TS'] });
    for (const entry of catalog) {
        entry.description = amigaSafe(entry.description);
    }
    return catalog;
}
//# sourceMappingURL=catalog.js.map