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
exports.doorRootFrom = doorRootFrom;
/**
 * Where this door's own files are.
 *
 * `path.resolve(__dirname, '..')` was wrong in a way that only showed on one
 * machine. In production the board runs `dist/index.js`, so `..` is the door
 * root. On localhost the board runs `index.ts` STRAIGHT FROM SOURCE - tsx,
 * cache-busting on - and `index.ts` sits IN the door root, so `..` is
 * `Doors/`. Every file the door read relative to itself was silently missing
 * there: the C64 placeholder, the wide art, `GLCViewer.cfg` itself - with
 * the compiled-in art covering for it on the wide screen, which is why it
 * took a bare C64 screen to notice (sysop, 2026-09-16: "still no petscii
 * logo in sight").
 *
 * So the root is FOUND, not assumed: walk up from wherever this file is
 * until the directory that holds the door's `package.json`. That is true of
 * `src/`, `dist/src/`, `dist/` and the root itself, and of any layout the
 * build grows into.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** The nearest ancestor of `from` (inclusive) that holds a package.json. */
function doorRootFrom(from) {
    let dir = path.resolve(from);
    for (let depth = 0; depth < 6; depth++) {
        if (fs.existsSync(path.join(dir, 'package.json')))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    // Nothing found: the old guess, so a door that is somehow not a package
    // still runs rather than throwing at import.
    return path.resolve(from, '..');
}
//# sourceMappingURL=door-root.js.map