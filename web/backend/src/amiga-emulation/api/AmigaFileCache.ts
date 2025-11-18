import * as fs from 'fs';
import { PathManager } from './PathManager';

export interface CachedAmigaFile {
  amigaPath: string;
  sysPath: string;
  data: Buffer | null;
  size: number;
  isDirectory: boolean;
  loadedAt: number;
}

/**
 * AmigaFileCache mimics UADE's single-file caching layer so doors that repeatedly
 * load the same config/BBS data do not keep hitting the host filesystem. All lookups
 * go through PathManager so assigns like PROGDIR:, ENV:, and mixed-case paths resolve
 * exactly like an Amiga filesystem.
 */
export class AmigaFileCache {
  private cache: Map<string, CachedAmigaFile> = new Map();
  private pathManager: PathManager;

  constructor(pathManager: PathManager) {
    this.pathManager = pathManager;
  }

  /**
   * Normalize an Amiga path so cache keys match regardless of case or slash style.
   */
  private static normalizeKey(amiPath: string): string {
    return amiPath.replace(/\\/g, '/').toLowerCase();
  }

  /**
   * Load (or retrieve cached copy of) an Amiga file.
   */
  load(amiPath: string, currentDir?: string): CachedAmigaFile | null {
    const key = AmigaFileCache.normalizeKey(amiPath);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const sysPath = this.pathManager.amiToSysPath(amiPath, currentDir);
    if (!sysPath) {
      return null;
    }

    if (!fs.existsSync(sysPath)) {
      return null;
    }

    const stats = fs.statSync(sysPath);
    let entry: CachedAmigaFile;

    if (stats.isDirectory()) {
      entry = {
        amigaPath: amiPath,
        sysPath,
        data: null,
        size: 0,
        isDirectory: true,
        loadedAt: Date.now()
      };
    } else {
      const data = fs.readFileSync(sysPath);
      entry = {
        amigaPath: amiPath,
        sysPath,
        data,
        size: data.length,
        isDirectory: false,
        loadedAt: Date.now()
      };
    }

    this.cache.set(key, entry);
    return entry;
  }

  /**
   * Invalidate a single Amiga path (or the entire cache when no path provided).
   */
  invalidate(amiPath?: string): void {
    if (!amiPath) {
      this.cache.clear();
      return;
    }
    const key = AmigaFileCache.normalizeKey(amiPath);
    this.cache.delete(key);
  }
}
