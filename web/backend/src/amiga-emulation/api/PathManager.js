"use strict";
/**
 * PathManager - Maps AmigaDOS logical paths to system filesystem paths
 *
 * Based on amitools/vamos/path/PathManager.py
 * See: Documentation/3-Developers/AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md
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
exports.PathManager = void 0;
const path = __importStar(require("path"));
class PathManager {
    constructor(baseDir) {
        /** Map of AmigaDOS logical devices (assigns) to system paths */
        this.assigns = new Map();
        this.baseDir = baseDir;
        this.initializeStandardAssigns();
    }
    /**
     * Initialize standard AmigaDOS assigns
     */
    initializeStandardAssigns() {
        // BBS-specific assigns
        this.assigns.set('doors:', path.join(this.baseDir, 'doors/'));
        this.assigns.set('bbs:', this.baseDir);
        this.assigns.set('data:', path.join(this.baseDir, 'data/'));
        this.assigns.set('screens:', path.join(this.baseDir, 'Screens/'));
        this.assigns.set('bulletins:', path.join(this.baseDir, 'Bulletins/'));
        this.assigns.set('s:', path.join(this.baseDir, 'S/'));
        this.assigns.set('work:', this.baseDir);
        this.assigns.set('sami:', path.join(this.baseDir, 'S/'));
        // Standard AmigaDOS assigns
        this.assigns.set('sys:', path.join(this.baseDir, 'System/'));
        this.assigns.set('c:', path.join(this.baseDir, 'System/C/'));
        this.assigns.set('libs:', path.join(this.baseDir, 'System/Libs/'));
        this.assigns.set('devs:', path.join(this.baseDir, 'System/Devs/'));
        // RAM disk and temp
        this.assigns.set('ram:', '/tmp/ram/');
        this.assigns.set('t:', '/tmp/');
        console.log('[PathManager] Initialized assigns:');
        for (const [assign, sysPath] of this.assigns) {
            console.log(`  ${assign} => ${sysPath}`);
        }
    }
    /**
     * Add or update an assign
     */
    addAssign(name, sysPath) {
        // Normalize assign name (ensure it ends with :)
        if (!name.endsWith(':')) {
            name += ':';
        }
        name = name.toLowerCase();
        this.assigns.set(name, sysPath);
        console.log(`[PathManager] Added assign: ${name} => ${sysPath}`);
    }
    /**
     * Remove an assign
     */
    removeAssign(name) {
        if (!name.endsWith(':')) {
            name += ':';
        }
        name = name.toLowerCase();
        const existed = this.assigns.delete(name);
        if (existed) {
            console.log(`[PathManager] Removed assign: ${name}`);
        }
        return existed;
    }
    /**
     * Map AmigaDOS path to system filesystem path
     *
     * Examples:
     *   "doors:who/node0.txt" => "/path/to/doors/who/node0.txt"
     *   "NIL:" => null (special device)
     *   "CONSOLE:" => null (special device)
     *   "*" => null (special device)
     *   "" => null (special device)
     */
    amiToSysPath(amiPath, currentDir) {
        // Empty string or "*" means stdout/console
        if (amiPath === '' || amiPath === '*') {
            return null; // Caller should handle as console
        }
        const upperPath = amiPath.toUpperCase();
        // Special devices
        if (upperPath === 'NIL:' || upperPath.startsWith('NIL:')) {
            return null; // Caller should handle as NULL device
        }
        if (upperPath === 'CONSOLE:' || upperPath.startsWith('CON:') || upperPath === 'CONSOLE') {
            return null; // Caller should handle as console
        }
        // Find matching assign
        const lowerPath = amiPath.toLowerCase();
        for (const [assign, sysPath] of this.assigns) {
            if (lowerPath.startsWith(assign)) {
                // Remove assign prefix and append to system path
                const relativePath = amiPath.substring(assign.length);
                const fullPath = path.join(sysPath, relativePath);
                console.log(`[PathManager] Mapped: "${amiPath}" => "${fullPath}"`);
                return fullPath;
            }
        }
        // No assign found - try relative to current directory
        if (currentDir) {
            const fullPath = path.join(currentDir, amiPath);
            console.log(`[PathManager] Relative path: "${amiPath}" => "${fullPath}"`);
            return fullPath;
        }
        // No assign and no current directory - try relative to base
        const fullPath = path.join(this.baseDir, amiPath);
        console.log(`[PathManager] Base relative: "${amiPath}" => "${fullPath}"`);
        return fullPath;
    }
    /**
     * Check if path is a special device
     */
    isSpecialDevice(amiPath) {
        if (amiPath === '' || amiPath === '*') {
            return { isSpecial: true, type: 'console' };
        }
        const upperPath = amiPath.toUpperCase();
        if (upperPath === 'NIL:' || upperPath.startsWith('NIL:')) {
            return { isSpecial: true, type: 'nil' };
        }
        if (upperPath === 'CONSOLE:' || upperPath.startsWith('CON:') || upperPath === 'CONSOLE') {
            return { isSpecial: true, type: 'console' };
        }
        return { isSpecial: false };
    }
    /**
     * Get all current assigns (for debugging)
     */
    getAssigns() {
        return new Map(this.assigns);
    }
    /**
     * Get base directory
     */
    getBaseDir() {
        return this.baseDir;
    }
}
exports.PathManager = PathManager;
