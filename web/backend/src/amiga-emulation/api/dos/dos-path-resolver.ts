/**
 * dos-path-resolver.ts - Amiga path resolution for dos.library
 *
 * Handles translation between AmigaDOS paths and native filesystem paths.
 * Supports PROGDIR:, BBS:, Doors:, S:, ENV: and other Amiga device paths.
 *
 * @module dos-path-resolver
 */

import * as path from 'path';
import * as amigafs from '../../../utils/amigafs';
import { debugLog } from '../../../utils/debug-log';
import { PathManager } from '../PathManager';
import { FileManager } from '../FileManager';

/**
 * Configuration for path resolver
 */
export interface PathResolverConfig {
  /** Root path of the BBS installation */
  rootPath: string;
  /** Path to BBS data directory */
  bbsDataPath: string;
  /** BBS root directory */
  bbsRoot: string;
  /** Current directory for door execution */
  doorDirectory: string;
  /** Current AmigaDOS-style directory path */
  currentDirectoryAmiga: string;
}

/**
 * Handles Amiga path resolution to native filesystem paths.
 *
 * Supports the following device mappings:
 * - PROGDIR: -> Door's own directory
 * - BBS: -> BBS data path
 * - Doors: -> Doors directory root
 * - S: -> Amiga system scripts (BBS root /S)
 * - ENV: -> Environment variables (/tmp/ram/ENV)
 * - RAM: -> RAM disk (/tmp/ram)
 * - T: -> Temporary directory (/tmp/ram/T)
 * - Relative paths -> Current directory
 * - Absolute paths -> Used as-is
 */
export class DosPathResolver {
  private rootPath: string = '';
  private bbsDataPath: string = '';
  private bbsRoot: string = '';
  private currentDirectory: string = '';
  private currentDirectoryAmiga: string = 'BBS:';
  private doorDirectory: string = '';

  // Optional managers for advanced path resolution
  private pathManager: PathManager | null = null;
  private fileManager: FileManager | null = null;
  private useNewFileSystem: boolean = false;

  constructor(config?: Partial<PathResolverConfig>) {
    if (config) {
      this.configure(config);
    }
  }

  /**
   * Configure the path resolver with base paths
   */
  configure(config: Partial<PathResolverConfig>): void {
    if (config.rootPath !== undefined) {
      this.rootPath = config.rootPath;
    }
    if (config.bbsDataPath !== undefined) {
      this.bbsDataPath = config.bbsDataPath;
    }
    if (config.bbsRoot !== undefined) {
      this.bbsRoot = config.bbsRoot;
    }
    if (config.doorDirectory !== undefined) {
      this.doorDirectory = config.doorDirectory;
    }
    if (config.currentDirectoryAmiga !== undefined) {
      this.currentDirectoryAmiga = config.currentDirectoryAmiga;
    }
  }

  /**
   * Set base paths for resolution
   */
  setBasePaths(rootPath: string): void {
    this.rootPath = rootPath;
    this.bbsDataPath = rootPath;
    this.bbsRoot = rootPath;
    this.currentDirectory = this.bbsDataPath;
  }

  /**
   * Set the door directory for PROGDIR: device
   */
  setDoorDirectory(doorPath: string): void {
    this.doorDirectory = doorPath;
    this.currentDirectory = doorPath;
    this.currentDirectoryAmiga = 'PROGDIR:';
    debugLog(`[DosPathResolver] PROGDIR: set to ${doorPath}`);

    if (this.pathManager) {
      this.pathManager.setProgDir(doorPath);
    }

    if (this.fileManager) {
      this.fileManager.setCurrentDir('progdir:');
    }
  }

  /**
   * Set current directory
   */
  setCurrentDirectory(sysPath: string, amigaPath: string): void {
    this.currentDirectory = sysPath;
    this.currentDirectoryAmiga = amigaPath;
    debugLog(`[DosPathResolver] Current directory: ${amigaPath} -> ${sysPath}`);
  }

  /**
   * Get current directory as system path
   */
  getCurrentDirectory(): string {
    if (this.fileManager) {
      return this.fileManager.getCurrentDirSysPath();
    }
    return this.currentDirectory;
  }

  /**
   * Get current directory as Amiga path
   */
  getCurrentDirectoryAmiga(): string {
    return this.currentDirectoryAmiga;
  }

  /**
   * Enable the new file system with PathManager
   */
  enableNewFileSystem(pathManager: PathManager, fileManager?: FileManager): void {
    this.pathManager = pathManager;
    this.fileManager = fileManager || null;
    this.useNewFileSystem = true;
    debugLog('[DosPathResolver] New file system enabled');
  }

  /**
   * Normalize an Amiga path by prepending current directory if relative
   */
  normalizeAmigaPath(amigaPath: string): string {
    // Already absolute or contains device
    if (amigaPath.includes(':') || amigaPath.startsWith('/')) {
      return amigaPath;
    }

    if (!this.currentDirectoryAmiga) {
      debugLog('[DosPathResolver] No current directory set, returning path unchanged');
      return amigaPath;
    }

    const separator = this.currentDirectoryAmiga.endsWith('/') ? '' : '/';
    const normalized = `${this.currentDirectoryAmiga}${separator}${amigaPath}`;
    debugLog(`[DosPathResolver] Normalized: "${amigaPath}" -> "${normalized}"`);
    return normalized;
  }

  /**
   * Resolve an Amiga path to a native filesystem path
   *
   * @param amigaPath - The AmigaDOS path to resolve
   * @returns The resolved native path, or null if resolution fails
   */
  resolve(amigaPath: string): string | null {
    debugLog(`[DosPathResolver] Resolving: "${amigaPath}"`);

    // Try PathManager first if available
    if (this.useNewFileSystem && this.pathManager) {
      const currentDir = this.getCurrentDirectory();
      const normalized = this.normalizeAmigaPath(amigaPath);
      const resolved = this.pathManager.amiToSysPath(normalized, currentDir);
      if (resolved) {
        debugLog(`[DosPathResolver] PathManager resolved: "${normalized}" -> ${resolved}`);
        return resolved;
      }
    }

    const upperPath = amigaPath.toUpperCase();

    // Handle PROGDIR: device - door's own directory
    if (upperPath.startsWith('PROGDIR:')) {
      return this.resolveProgDir(amigaPath.substring(8));
    }

    // Handle Doors: device - doors directory root
    if (upperPath.startsWith('DOORS:')) {
      const relativePath = amigaPath.substring(6);
      let resolved = path.join(this.rootPath, 'doors', relativePath);
      resolved = this.findCaseInsensitive(resolved);
      debugLog(`[DosPathResolver] Doors: -> ${resolved}`);
      return resolved;
    }

    // Handle BBS: device - BBS system files
    if (upperPath.startsWith('BBS:')) {
      return this.resolveBbs(amigaPath.substring(4));
    }

    // Handle S: device - Amiga system scripts/config
    if (upperPath.startsWith('S:')) {
      const relativePath = amigaPath.substring(2);
      let resolved = path.join(this.rootPath, 'S', relativePath);
      resolved = this.findCaseInsensitive(resolved);
      debugLog(`[DosPathResolver] S: -> ${resolved}`);
      return resolved;
    }

    // Handle ENV: device - environment variables
    if (upperPath.startsWith('ENV:')) {
      const relativePath = amigaPath.substring(4);
      const resolved = path.join('/tmp/ram/ENV', relativePath);
      debugLog(`[DosPathResolver] ENV: -> ${resolved}`);
      return resolved;
    }

    // Handle RAM: device
    if (upperPath.startsWith('RAM:')) {
      const relativePath = amigaPath.substring(4);
      const resolved = path.join('/tmp/ram', relativePath);
      debugLog(`[DosPathResolver] RAM: -> ${resolved}`);
      return resolved;
    }

    // Handle T: device - temporary directory
    if (upperPath.startsWith('T:')) {
      const relativePath = amigaPath.substring(2);
      const resolved = path.join('/tmp/ram/T', relativePath);
      debugLog(`[DosPathResolver] T: -> ${resolved}`);
      return resolved;
    }

    // Handle absolute paths
    if (amigaPath.startsWith('/')) {
      debugLog(`[DosPathResolver] Absolute: ${amigaPath}`);
      return amigaPath;
    }

    // Handle relative paths - resolve from current directory
    return this.resolveRelative(amigaPath);
  }

  /**
   * Resolve PROGDIR: relative path
   */
  private resolveProgDir(relativePath: string): string {
    let resolved = path.join(this.doorDirectory, relativePath);
    resolved = this.findCaseInsensitive(resolved);
    debugLog(`[DosPathResolver] PROGDIR: -> ${resolved}`);
    return resolved;
  }

  /**
   * Resolve BBS: relative path
   */
  private resolveBbs(relativePath: string): string {
    let resolved = path.join(this.bbsDataPath, relativePath);
    resolved = this.findCaseInsensitive(resolved);
    debugLog(`[DosPathResolver] BBS: -> ${resolved}`);
    return resolved;
  }

  /**
   * Resolve relative path from current directory
   */
  private resolveRelative(relativePath: string): string {
    let resolved = path.join(this.currentDirectory, relativePath);
    resolved = this.findCaseInsensitive(resolved);
    debugLog(`[DosPathResolver] Relative from ${this.currentDirectory} -> ${resolved}`);
    return resolved;
  }

  /**
   * Perform case-insensitive file lookup (Amiga filesystem compatibility)
   */
  private findCaseInsensitive(filePath: string): string {
    const dir = path.dirname(filePath);
    const file = path.basename(filePath);
    const found = amigafs.findCaseInsensitive(dir, file);
    return found || filePath;
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  ensureDirectory(dir: string): void {
    try {
      if (amigafs.existsSync(dir)) {
        return;
      }
      debugLog(`[DosPathResolver] Creating directory: ${dir}`);
      amigafs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.warn(`[DosPathResolver] Unable to create directory ${dir}:`, error);
    }
  }

  /**
   * Check if a path points to a console/interactive device
   */
  isConsoleDevice(amigaPath: string): boolean {
    const upperPath = amigaPath.toUpperCase();
    return (
      upperPath === 'CONSOLE:' ||
      upperPath === 'CON:' ||
      upperPath === 'RAW:' ||
      upperPath === '*' ||
      upperPath.startsWith('CON:') ||
      upperPath.startsWith('RAW:')
    );
  }

  /**
   * Check if a path points to the NIL: device
   */
  isNilDevice(amigaPath: string): boolean {
    return amigaPath.toUpperCase() === 'NIL:';
  }

  /**
   * Get the device name from a path
   */
  getDeviceName(amigaPath: string): string | null {
    const colonIndex = amigaPath.indexOf(':');
    if (colonIndex === -1) {
      return null;
    }
    return amigaPath.substring(0, colonIndex + 1).toUpperCase();
  }

  /**
   * Get the path after the device name
   */
  getPathAfterDevice(amigaPath: string): string {
    const colonIndex = amigaPath.indexOf(':');
    if (colonIndex === -1) {
      return amigaPath;
    }
    return amigaPath.substring(colonIndex + 1);
  }
}

// Export singleton instance for convenience
export const dosPathResolver = new DosPathResolver();
