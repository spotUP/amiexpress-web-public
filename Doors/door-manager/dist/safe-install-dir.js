"use strict";
/**
 * Where an uninstall is allowed to delete.
 *
 * On 2026-08-30 a sysop uninstalled doors on the live board and the WHOLE
 * Doors directory went, DOORMAN itself included. The uninstall did this:
 *
 *   const abs = path.join(PROJECT_ROOT, e.install_dir);
 *   if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
 *
 * with nothing checking what `install_dir` held. It is written as
 * `Doors/${command}`, so a row whose command was empty gives `Doors/`, and a
 * recursive force-delete of `<root>/Doors/` removes every door on the board.
 * A legacy row holding `Doors`, `.`, `..` or an absolute path does the same
 * or worse.
 *
 * This module is the only thing allowed to turn a stored `install_dir` into a
 * path a delete may touch. It answers with a path only when that path is a
 * real subdirectory of `<root>/Doors/` - never the Doors directory itself,
 * never above it, never outside the project.
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
exports.isSafeToDelete = isSafeToDelete;
exports.resolveDoorInstallDir = resolveDoorInstallDir;
const path = __importStar(require("path"));
function isSafeToDelete(decision) {
    return decision.path !== undefined;
}
/**
 * Resolve a stored `install_dir` to the directory an uninstall may delete.
 *
 * @param projectRoot absolute path to the BBS root
 * @param installDir  the value stored on the install record
 */
function resolveDoorInstallDir(projectRoot, installDir) {
    if (installDir === null || installDir === undefined || installDir.trim() === '') {
        return { reason: 'this door has no install directory recorded' };
    }
    const raw = installDir.trim();
    if (path.isAbsolute(raw)) {
        return { reason: `install directory "${raw}" is an absolute path` };
    }
    const doorsRoot = path.resolve(projectRoot, 'Doors');
    const target = path.resolve(projectRoot, raw);
    if (target === doorsRoot) {
        // The exact shape that emptied the live board.
        return { reason: 'install directory is the Doors directory itself, not a door inside it' };
    }
    const relative = path.relative(doorsRoot, target);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        return { reason: `install directory "${raw}" is outside Doors/` };
    }
    return { path: target };
}
//# sourceMappingURL=safe-install-dir.js.map