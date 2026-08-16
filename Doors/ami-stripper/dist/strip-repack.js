"use strict";
/**
 * Strip-and-repack finalization for the AmiStripper door.
 *
 * Extracted from index.ts so the temp-file lifecycle is unit-testable
 * without pulling in the door SDK. stripArchive always writes a portable
 * ZIP and may adjust the requested output path (forced .zip extension),
 * so cleanup must track the path it ACTUALLY wrote (outputPath), not the
 * literal tmp path we asked for.
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
exports.runStripRepack = runStripRepack;
const fs = __importStar(require("fs"));
async function runStripRepack(stripArchiveFn, archivePath) {
    const tmpOut = archivePath + '.strip_tmp';
    // Outer-scoped so the catch block can clean up the file stripArchive
    // actually produced. Regression guard: the produced file is e.g.
    // <archive>.strip_tmp.zip, NOT the literal tmpOut — cleaning only
    // tmpOut orphans the real temp file when the rename below fails.
    let producedPath = null;
    try {
        const res = await stripArchiveFn(archivePath, tmpOut);
        producedPath = res && typeof res === 'object' && res.outputPath ? res.outputPath : tmpOut;
        if (!fs.existsSync(producedPath) || fs.statSync(producedPath).isDirectory()) {
            if (fs.existsSync(producedPath))
                fs.rmSync(producedPath, { recursive: true, force: true });
            return { ok: false, origSize: 0, newSize: 0, finalPath: '', error: 'Repack produced unexpected output.' };
        }
        const origSize = fs.statSync(archivePath).size;
        const finalPath = archivePath.replace(/\.(lha|lzx|lzh)$/i, '') + '.zip';
        if (producedPath !== finalPath) {
            if (fs.existsSync(finalPath))
                fs.rmSync(finalPath, { force: true });
            fs.renameSync(producedPath, finalPath);
        }
        const newSize = fs.statSync(finalPath).size;
        return { ok: true, origSize, newSize, finalPath };
    }
    catch (err) {
        for (const p of producedPath && producedPath !== tmpOut ? [producedPath, tmpOut] : [tmpOut]) {
            if (fs.existsSync(p)) {
                try {
                    fs.unlinkSync(p);
                }
                catch { /* best effort */ }
            }
        }
        return { ok: false, origSize: 0, newSize: 0, finalPath: '', error: `Repack failed: ${err.message}` };
    }
}
//# sourceMappingURL=strip-repack.js.map