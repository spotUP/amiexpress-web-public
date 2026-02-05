import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
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
 *
 * Memory optimization: LRU eviction when cache exceeds configurable size limit.
 * Default: 2MB. Set AMIGA_FILE_CACHE_MB environment variable to adjust.
 */
export class AmigaFileCache {
  private cache: Map<string, CachedAmigaFile> = new Map();
  private pathManager: PathManager;
  private maxSizeBytes: number;
  private currentSizeBytes: number = 0;

  constructor(pathManager: PathManager) {
    this.pathManager = pathManager;
    const maxMB = parseInt(process.env.AMIGA_FILE_CACHE_MB || '2', 10);
    this.maxSizeBytes = Math.max(1, Math.min(64, maxMB)) * 1024 * 1024;
  }

  /**
   * Evict oldest entries if adding newSize would exceed limit
   */
  private evictIfNeeded(newSize: number): void {
    while (this.currentSizeBytes + newSize > this.maxSizeBytes && this.cache.size > 0) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.loadedAt < oldestTime) {
          oldestTime = entry.loadedAt;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        const entry = this.cache.get(oldestKey)!;
        this.currentSizeBytes -= entry.size;
        this.cache.delete(oldestKey);
      }
    }
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

    if (!amigafs.existsSync(sysPath)) {
      return null;
    }

    const stats = amigafs.statSync(sysPath);
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
      const data = amigafs.readFileSync(sysPath) as Buffer;
      entry = {
        amigaPath: amiPath,
        sysPath,
        data,
        size: data.length,
        isDirectory: false,
        loadedAt: Date.now()
      };
    }

    // Evict old entries if needed before adding new one
    this.evictIfNeeded(entry.size);
    this.cache.set(key, entry);
    this.currentSizeBytes += entry.size;
    return entry;
  }

  /**
   * Invalidate a single Amiga path (or the entire cache when no path provided).
   */
  invalidate(amiPath?: string): void {
    if (!amiPath) {
      this.cache.clear();
      this.currentSizeBytes = 0;
      return;
    }
    const key = AmigaFileCache.normalizeKey(amiPath);
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.size;
      this.cache.delete(key);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): { entries: number; sizeBytes: number; maxSizeBytes: number } {
    return {
      entries: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.maxSizeBytes
    };
  }
}
