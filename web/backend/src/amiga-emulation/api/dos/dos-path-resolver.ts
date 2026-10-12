/**
 * dos-path-resolver.ts - Amiga path resolution for dos.library
 *
 * Handles translation between AmigaDOS paths and native filesystem paths.
 * Supports PROGDIR:, BBS:, Doors:, S:, ENV:, ENVARC: and other Amiga device paths.
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
 * Devices and assigns come from the one assign table
 * (standard-assigns.ts) through PathManager; PROGDIR: is the door's own
 * directory; relative paths resolve against the current directory and
 * absolute host paths are used as-is.
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
  /** Assign table used before a session PathManager is enabled. */
  private ownPathManager: PathManager | null = null;
  private ownPathManagerRoot = '';

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

    // Absolute host paths pass through.
    if (amigaPath.startsWith('/')) {
      debugLog(`[DosPathResolver] Absolute: ${amigaPath}`);
      return amigaPath;
    }

    // A path without a device resolves against the current directory.
    if (!amigaPath.includes(':')) {
      return this.resolveRelative(amigaPath);
    }

    // Devices and assigns: the one assign table (standard-assigns.ts), through
    // a PathManager - the session's when there is one, else one of our own.
    // PROGDIR: is this resolver's door directory.
    if (amigaPath.toUpperCase().startsWith('PROGDIR:') && !(this.useNewFileSystem && this.pathManager)) {
      return this.resolveProgDir(amigaPath.substring(8));
    }
    const manager = this.assignTable();
    const resolved = manager.amiToSysPath(this.normalizeAmigaPath(amigaPath), this.getCurrentDirectory());
    debugLog(`[DosPathResolver] PathManager resolved: "${amigaPath}" -> ${resolved}`);
    return resolved;
  }

  /** The session's PathManager, else one built on this resolver's root. */
  private assignTable(): PathManager {
    if (this.useNewFileSystem && this.pathManager) return this.pathManager;
    if (!this.ownPathManager || this.ownPathManagerRoot !== this.rootPath) {
      this.ownPathManager = new PathManager(this.rootPath || this.bbsRoot || process.cwd());
      this.ownPathManagerRoot = this.rootPath;
    }
    return this.ownPathManager;
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
