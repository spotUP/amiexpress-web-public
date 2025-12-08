/**
 * PathManager - Maps AmigaDOS logical paths to system filesystem paths
 *
 * Based on amitools/vamos/path/PathManager.py
 * See: Documentation/3-Developers/AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md
 */

import * as path from 'path';
import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import { resolvePath as resolveCaseInsensitivePath } from '../../utils/amigafs';

export class PathManager {
  /** Map of AmigaDOS logical devices (assigns) to system paths */
  private assigns: Map<string, string> = new Map();

  /** Base directory for BBS files */
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.initializeStandardAssigns();
  }

  private normalizeAssignPath(p: string): string {
    if (!p.endsWith(path.sep)) {
      return p + path.sep;
    }
    return p;
  }

  private normalizeComponents(rawPath: string): string[] {
    const parts = rawPath
      .replace(/\\/g, '/')
      .split('/')
      .filter(component => component.length > 0);

    const normalized: string[] = [];
    for (const component of parts) {
      if (component === '.') {
        continue;
      }
      if (component === '..') {
        normalized.pop();
        continue;
      }
      normalized.push(component);
    }
    return normalized;
  }

  /**
   * Initialize standard AmigaDOS assigns
   */
  private initializeStandardAssigns(): void {
    // Resolve common assigns in a case-insensitive way to mirror Amiga volumes.
    // Prefer capitalized "Doors" (matches repo layout) if present.
    const doorsUpper = path.join(this.baseDir, 'Doors/');
    const doorsLower = path.join(this.baseDir, 'doors/');
    const doorsPath =
      (fs.existsSync(doorsUpper) && doorsUpper) ||
      (fs.existsSync(doorsLower) && doorsLower) ||
      resolveCaseInsensitivePath(path.join(this.baseDir, 'doors')) ||
      doorsLower;

    // BBS-specific assigns
    this.assigns.set('doors:', this.normalizeAssignPath(doorsPath));
    this.assigns.set('bbs:', this.normalizeAssignPath(this.baseDir));
    this.assigns.set('data:', this.normalizeAssignPath(path.join(this.baseDir, 'data/')));
    this.assigns.set('screens:', this.normalizeAssignPath(path.join(this.baseDir, 'Screens/')));
    this.assigns.set('bulletins:', this.normalizeAssignPath(path.join(this.baseDir, 'Bulletins/')));
    this.assigns.set('s:', this.normalizeAssignPath(path.join(this.baseDir, 'S/')));
    this.assigns.set('work:', this.normalizeAssignPath(this.baseDir));
    this.assigns.set('sami:', this.normalizeAssignPath(path.join(this.baseDir, 'S/')));
    this.assigns.set('env:', this.normalizeAssignPath(path.join('/tmp/ram', 'ENV/')));
    this.assigns.set('progdir:', this.normalizeAssignPath(this.baseDir));

    // Standard AmigaDOS assigns
    this.assigns.set('sys:', this.normalizeAssignPath(path.join(this.baseDir, 'System/')));
    this.assigns.set('c:', this.normalizeAssignPath(path.join(this.baseDir, 'System/C/')));
    this.assigns.set('libs:', this.normalizeAssignPath(path.join(this.baseDir, 'System/Libs/')));
    this.assigns.set('devs:', this.normalizeAssignPath(path.join(this.baseDir, 'System/Devs/')));

    // RAM disk and temp
    this.assigns.set('ram:', this.normalizeAssignPath('/tmp/ram/'));
    this.assigns.set('t:', this.normalizeAssignPath('/tmp/'));

    console.log('[PathManager] Initialized assigns:');
    for (const [assign, sysPath] of this.assigns) {
      console.log(`  ${assign} => ${sysPath}`);
    }
  }

  /**
   * Add or update an assign
   */
  addAssign(name: string, sysPath: string): void {
    // Normalize assign name (ensure it ends with :)
    if (!name.endsWith(':')) {
      name += ':';
    }
    name = name.toLowerCase();

    this.assigns.set(name, this.normalizeAssignPath(sysPath));
    console.log(`[PathManager] Added assign: ${name} => ${sysPath}`);
  }

  /**
   * Update PROGDIR: to point at the currently running door directory.
   */
  setProgDir(sysPath: string): void {
    const normalized = this.normalizeAssignPath(sysPath);
    this.assigns.set('progdir:', normalized);
    console.log(`[PathManager] PROGDIR: assigned to ${normalized}`);
  }

  /**
   * Remove an assign
   */
  removeAssign(name: string): boolean {
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
  amiToSysPath(amiPath: string, currentDir?: string): string | null {
    // Empty string or "*" means stdout/console
    if (amiPath === '' || amiPath === '*') {
      return null; // Caller should handle as console
    }

    // POSIX absolute paths should bypass assigns and map directly
    if (amiPath.startsWith('/')) {
      const normalized = path.normalize(amiPath);
      console.log(`[PathManager] Absolute POSIX path: "${amiPath}" => "${normalized}"`);
      return normalized;
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
        const normalizedComponents = this.normalizeComponents(relativePath);

        if (normalizedComponents.length === 0) {
          console.log(`[PathManager] Mapped assign root: "${amiPath}" => "${sysPath}"`);
          return sysPath;
        }

        const fullPath = path.join(sysPath, ...normalizedComponents);
        const caseInsensitivePath = resolveCaseInsensitivePath(fullPath);
        if (caseInsensitivePath) {
          console.log(`[PathManager] Mapped (case-insensitive): "${amiPath}" => "${caseInsensitivePath}"`);
          return caseInsensitivePath;
        }

        console.log(`[PathManager] Mapped: "${amiPath}" => "${fullPath}"`);
        return fullPath;
      }
    }

    // No assign found - try relative to current directory
    if (currentDir) {
      const normalizedComponents = this.normalizeComponents(amiPath);

      const fullPath = path.join(currentDir, ...normalizedComponents);
      const caseInsensitivePath = resolveCaseInsensitivePath(fullPath);
      if (caseInsensitivePath) {
        console.log(`[PathManager] Relative (case-insensitive): "${amiPath}" => "${caseInsensitivePath}"`);
        return caseInsensitivePath;
      }

      console.log(`[PathManager] Relative path: "${amiPath}" => "${fullPath}"`);
      return fullPath;
    }

    // No assign and no current directory - try relative to base
    const normalizedComponents = this.normalizeComponents(amiPath);

    const fullBasePath = path.join(this.baseDir, ...normalizedComponents);
    const basePath = resolveCaseInsensitivePath(fullBasePath);
    if (basePath) {
      console.log(`[PathManager] Base relative (case-insensitive): "${amiPath}" => "${basePath}"`);
      return basePath;
    }

    const fullPath = path.join(this.baseDir, amiPath);
    console.log(`[PathManager] Base relative: "${amiPath}" => "${fullPath}"`);
    return fullPath;
  }

  /**
   * Check if path is a special device
   */
  isSpecialDevice(amiPath: string): { isSpecial: boolean; type?: 'console' | 'nil' } {
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
  getAssigns(): Map<string, string> {
    return new Map(this.assigns);
  }

  /**
   * Get base directory
   */
  getBaseDir(): string {
    return this.baseDir;
  }
}
