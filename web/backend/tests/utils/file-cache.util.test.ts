/**
 * File Cache Utility Unit Tests
 *
 * Tests LRU file caching with automatic invalidation on file changes,
 * eviction when cache full, and helper functions for common file types.
 */

import {
  FileCache,
  fileCache,
  readScreenFile,
  readBulletinFile,
  readInfoFile,
  invalidateScreens,
  invalidateBulletins,
  invalidateConfigFiles,
} from '../../src/utils/file-cache.util';

// Mock amigafs
jest.mock('../../src/utils/amigafs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
}));

import * as amigafs from '../../src/utils/amigafs';

describe('File Cache Utility', () => {
  let cache: FileCache;
  let mockFiles: Map<string, { content: string; mtime: number }>;

  beforeEach(() => {
    cache = new FileCache(1); // 1MB for testing
    mockFiles = new Map();

    // Mock amigafs functions
    (amigafs.existsSync as jest.Mock).mockImplementation((path: string) => {
      return mockFiles.has(path);
    });

    (amigafs.statSync as jest.Mock).mockImplementation((path: string) => {
      const file = mockFiles.get(path);
      if (!file) {
        throw new Error(`File not found: ${path}`);
      }
      return { mtimeMs: file.mtime };
    });

    (amigafs.readFileSync as jest.Mock).mockImplementation((path: string, encoding?: string) => {
      const file = mockFiles.get(path);
      if (!file) {
        throw new Error(`File not found: ${path}`);
      }
      if (encoding) {
        return file.content;
      }
      return Buffer.from(file.content);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('FileCache class', () => {
    describe('constructor', () => {
      it('should create cache with default 4MB size', () => {
        const defaultCache = new FileCache();
        const stats = defaultCache.getStats();

        expect(stats.maxSizeMB).toBe('4.00');
      });

      it('should create cache with custom size', () => {
        const customCache = new FileCache(32);
        const stats = customCache.getStats();

        expect(stats.maxSizeMB).toBe('32.00');
      });

      it('should initialize with zero entries', () => {
        const stats = cache.getStats();

        expect(stats.entries).toBe(0);
        expect(stats.sizeBytes).toBe(0);
      });

      it('should initialize statistics to zero', () => {
        const stats = cache.getStats();

        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
        expect(stats.evictions).toBe(0);
      });
    });

    describe('read', () => {
      it('should throw error for non-existent file', () => {
        expect(() => cache.read('/nonexistent.txt')).toThrow('File not found');
      });

      it('should read file on first access (cache miss)', () => {
        mockFiles.set('/test.txt', { content: 'Hello World', mtime: 1000 });

        const content = cache.read('/test.txt', 'utf8');

        expect(content).toBe('Hello World');
        expect(cache.getStats().misses).toBe(1);
        expect(cache.getStats().hits).toBe(0);
      });

      it('should return cached content on second access (cache hit)', () => {
        mockFiles.set('/test.txt', { content: 'Hello World', mtime: 1000 });

        cache.read('/test.txt', 'utf8');
        const content = cache.read('/test.txt', 'utf8');

        expect(content).toBe('Hello World');
        expect(cache.getStats().hits).toBe(1);
        expect(cache.getStats().misses).toBe(1);
      });

      it('should invalidate cache when file modified', () => {
        mockFiles.set('/test.txt', { content: 'Version 1', mtime: 1000 });

        cache.read('/test.txt', 'utf8');

        // Modify file
        mockFiles.set('/test.txt', { content: 'Version 2', mtime: 2000 });

        const content = cache.read('/test.txt', 'utf8');

        expect(content).toBe('Version 2');
        expect(cache.getStats().misses).toBe(2); // Both reads were misses
      });

      it('should read buffer when no encoding specified', () => {
        mockFiles.set('/binary.dat', { content: 'Binary Data', mtime: 1000 });

        const content = cache.read('/binary.dat');

        expect(Buffer.isBuffer(content)).toBe(true);
        expect(content.toString()).toBe('Binary Data');
      });

      it('should track cache size correctly', () => {
        mockFiles.set('/small.txt', { content: 'Small', mtime: 1000 });

        cache.read('/small.txt', 'utf8');

        const stats = cache.getStats();
        expect(stats.sizeBytes).toBeGreaterThan(0);
      });

      it('should update lastAccess time on cache hits', () => {
        mockFiles.set('/test.txt', { content: 'Test', mtime: 1000 });

        cache.read('/test.txt', 'utf8');
        const entry1 = cache.getCacheEntry('/test.txt');
        const access1 = entry1!.lastAccess;

        // Wait a bit and access again
        cache.read('/test.txt', 'utf8');
        const entry2 = cache.getCacheEntry('/test.txt');
        const access2 = entry2!.lastAccess;

        expect(access2).toBeGreaterThanOrEqual(access1);
      });
    });

    describe('readString', () => {
      it('should read file as string', () => {
        mockFiles.set('/text.txt', { content: 'Text Content', mtime: 1000 });

        const content = cache.readString('/text.txt');

        expect(typeof content).toBe('string');
        expect(content).toBe('Text Content');
      });

      it('should use default utf8 encoding', () => {
        mockFiles.set('/text.txt', { content: 'Default Encoding', mtime: 1000 });

        const content = cache.readString('/text.txt');

        expect(content).toBe('Default Encoding');
      });

      it('should convert buffer to string', () => {
        mockFiles.set('/text.txt', { content: 'Buffer Content', mtime: 1000 });

        // First read as buffer
        cache.read('/text.txt');
        cache.invalidate('/text.txt');

        // Then read as string
        const content = cache.readString('/text.txt');

        expect(typeof content).toBe('string');
      });
    });

    describe('readBuffer', () => {
      it('should read file as buffer', () => {
        mockFiles.set('/data.bin', { content: 'Binary', mtime: 1000 });

        const content = cache.readBuffer('/data.bin');

        expect(Buffer.isBuffer(content)).toBe(true);
        expect(content.toString()).toBe('Binary');
      });

      it('should convert string to buffer', () => {
        mockFiles.set('/text.txt', { content: 'Text', mtime: 1000 });

        // First read as string
        cache.read('/text.txt', 'utf8');
        cache.invalidate('/text.txt');

        // Then read as buffer
        const content = cache.readBuffer('/text.txt');

        expect(Buffer.isBuffer(content)).toBe(true);
      });
    });

    describe('LRU eviction', () => {
      it('should evict oldest entry when cache full', () => {
        // Add files that exceed 1MB cache limit
        const largeContent = 'X'.repeat(500 * 1024); // 500KB

        mockFiles.set('/file1.txt', { content: largeContent, mtime: 1000 });
        mockFiles.set('/file2.txt', { content: largeContent, mtime: 1001 });
        mockFiles.set('/file3.txt', { content: largeContent, mtime: 1002 });

        cache.read('/file1.txt', 'utf8');
        cache.read('/file2.txt', 'utf8');
        cache.read('/file3.txt', 'utf8'); // Should evict file1

        expect(cache.isCached('/file1.txt')).toBe(false);
        expect(cache.isCached('/file2.txt')).toBe(true);
        expect(cache.isCached('/file3.txt')).toBe(true);
      });

      it('should track eviction count', () => {
        const largeContent = 'X'.repeat(500 * 1024);

        mockFiles.set('/file1.txt', { content: largeContent, mtime: 1000 });
        mockFiles.set('/file2.txt', { content: largeContent, mtime: 1001 });
        mockFiles.set('/file3.txt', { content: largeContent, mtime: 1002 });

        cache.read('/file1.txt', 'utf8');
        cache.read('/file2.txt', 'utf8');
        cache.read('/file3.txt', 'utf8');

        expect(cache.getStats().evictions).toBeGreaterThan(0);
      });

      it('should keep cache within size limits via eviction', () => {
        const content = 'X'.repeat(400 * 1024); // 400KB each

        mockFiles.set('/file1.txt', { content, mtime: 1000 });
        mockFiles.set('/file2.txt', { content, mtime: 1001 });
        mockFiles.set('/file3.txt', { content, mtime: 1002 });

        cache.read('/file1.txt', 'utf8');
        cache.read('/file2.txt', 'utf8');
        cache.read('/file3.txt', 'utf8');

        // Cache should have evicted entries to stay under 1MB limit
        const stats = cache.getStats();
        expect(stats.sizeBytes).toBeLessThanOrEqual(cache['maxSizeBytes']);

        // Should have some evictions
        expect(stats.evictions).toBeGreaterThan(0);

        // Not all files can fit, so at least one must be evicted
        const allCached = cache.isCached('/file1.txt') &&
                         cache.isCached('/file2.txt') &&
                         cache.isCached('/file3.txt');
        expect(allCached).toBe(false);
      });
    });

    describe('invalidate', () => {
      it('should remove file from cache', () => {
        mockFiles.set('/test.txt', { content: 'Test', mtime: 1000 });

        cache.read('/test.txt', 'utf8');
        expect(cache.isCached('/test.txt')).toBe(true);

        cache.invalidate('/test.txt');
        expect(cache.isCached('/test.txt')).toBe(false);
      });

      it('should update cache size after invalidation', () => {
        mockFiles.set('/test.txt', { content: 'Test Content', mtime: 1000 });

        cache.read('/test.txt', 'utf8');
        const sizeBefore = cache.getStats().sizeBytes;

        cache.invalidate('/test.txt');
        const sizeAfter = cache.getStats().sizeBytes;

        expect(sizeAfter).toBeLessThan(sizeBefore);
        expect(sizeAfter).toBe(0);
      });

      it('should handle invalidating non-existent file gracefully', () => {
        expect(() => cache.invalidate('/nonexistent.txt')).not.toThrow();
      });
    });

    describe('invalidatePattern', () => {
      it('should invalidate all files matching pattern', () => {
        mockFiles.set('/screens/menu.txt', { content: 'Menu', mtime: 1000 });
        mockFiles.set('/screens/help.txt', { content: 'Help', mtime: 1001 });
        mockFiles.set('/bulletins/bull1.txt', { content: 'Bull', mtime: 1002 });

        cache.read('/screens/menu.txt', 'utf8');
        cache.read('/screens/help.txt', 'utf8');
        cache.read('/bulletins/bull1.txt', 'utf8');

        cache.invalidatePattern(/\/screens\//);

        expect(cache.isCached('/screens/menu.txt')).toBe(false);
        expect(cache.isCached('/screens/help.txt')).toBe(false);
        expect(cache.isCached('/bulletins/bull1.txt')).toBe(true);
      });

      it('should handle empty pattern matches', () => {
        mockFiles.set('/test.txt', { content: 'Test', mtime: 1000 });

        cache.read('/test.txt', 'utf8');

        cache.invalidatePattern(/nomatch/);

        expect(cache.isCached('/test.txt')).toBe(true);
      });

      it('should be case-insensitive when pattern is', () => {
        mockFiles.set('/Screens/Menu.txt', { content: 'Menu', mtime: 1000 });

        cache.read('/Screens/Menu.txt', 'utf8');

        cache.invalidatePattern(/\/screens\//i);

        expect(cache.isCached('/Screens/Menu.txt')).toBe(false);
      });
    });

    describe('clear', () => {
      it('should remove all entries', () => {
        mockFiles.set('/file1.txt', { content: 'File 1', mtime: 1000 });
        mockFiles.set('/file2.txt', { content: 'File 2', mtime: 1001 });

        cache.read('/file1.txt', 'utf8');
        cache.read('/file2.txt', 'utf8');

        cache.clear();

        expect(cache.getStats().entries).toBe(0);
      });

      it('should reset cache size to zero', () => {
        mockFiles.set('/test.txt', { content: 'Test', mtime: 1000 });

        cache.read('/test.txt', 'utf8');

        cache.clear();

        expect(cache.getStats().sizeBytes).toBe(0);
      });

      it('should not affect statistics', () => {
        mockFiles.set('/test.txt', { content: 'Test', mtime: 1000 });

        cache.read('/test.txt', 'utf8');
        const statsBefore = cache.getStats();

        cache.clear();
        const statsAfter = cache.getStats();

        expect(statsAfter.hits).toBe(statsBefore.hits);
        expect(statsAfter.misses).toBe(statsBefore.misses);
      });
    });

    describe('getStats', () => {
      it('should return correct statistics', () => {
        mockFiles.set('/test.txt', { content: 'Test', mtime: 1000 });

        cache.read('/test.txt', 'utf8');
        cache.read('/test.txt', 'utf8');

        const stats = cache.getStats();

        expect(stats.entries).toBe(1);
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
      });

      it('should calculate hit rate correctly', () => {
        mockFiles.set('/test.txt', { content: 'Test', mtime: 1000 });

        cache.read('/test.txt', 'utf8'); // Miss
        cache.read('/test.txt', 'utf8'); // Hit
        cache.read('/test.txt', 'utf8'); // Hit

        const stats = cache.getStats();

        expect(stats.hitRate).toBe('66.67%');
      });

      it('should handle zero accesses gracefully', () => {
        const stats = cache.getStats();

        expect(stats.hitRate).toBe('0.00%');
      });

      it('should format size in MB correctly', () => {
        const stats = cache.getStats();

        expect(stats.sizeMB).toMatch(/^\d+\.\d{2}$/);
        expect(stats.maxSizeMB).toBe('1.00');
      });
    });

    describe('getCachedFiles', () => {
      it('should return list of cached files', () => {
        mockFiles.set('/file1.txt', { content: 'File 1', mtime: 1000 });
        mockFiles.set('/file2.txt', { content: 'File 2', mtime: 1001 });

        cache.read('/file1.txt', 'utf8');
        cache.read('/file2.txt', 'utf8');

        const files = cache.getCachedFiles();

        expect(files).toEqual(['/file1.txt', '/file2.txt']);
      });

      it('should return sorted list', () => {
        mockFiles.set('/c.txt', { content: 'C', mtime: 1000 });
        mockFiles.set('/a.txt', { content: 'A', mtime: 1001 });
        mockFiles.set('/b.txt', { content: 'B', mtime: 1002 });

        cache.read('/c.txt', 'utf8');
        cache.read('/a.txt', 'utf8');
        cache.read('/b.txt', 'utf8');

        const files = cache.getCachedFiles();

        expect(files).toEqual(['/a.txt', '/b.txt', '/c.txt']);
      });

      it('should return empty array for empty cache', () => {
        const files = cache.getCachedFiles();

        expect(files).toEqual([]);
      });
    });

    describe('isCached', () => {
      it('should return true for cached file', () => {
        mockFiles.set('/test.txt', { content: 'Test', mtime: 1000 });

        cache.read('/test.txt', 'utf8');

        expect(cache.isCached('/test.txt')).toBe(true);
      });

      it('should return false for non-cached file', () => {
        expect(cache.isCached('/nonexistent.txt')).toBe(false);
      });

      it('should return false after invalidation', () => {
        mockFiles.set('/test.txt', { content: 'Test', mtime: 1000 });

        cache.read('/test.txt', 'utf8');
        cache.invalidate('/test.txt');

        expect(cache.isCached('/test.txt')).toBe(false);
      });
    });

    describe('getCacheEntry', () => {
      it('should return cache entry details', () => {
        mockFiles.set('/test.txt', { content: 'Test Content', mtime: 1000 });

        cache.read('/test.txt', 'utf8');

        const entry = cache.getCacheEntry('/test.txt');

        expect(entry).toBeDefined();
        expect(entry!.content).toBe('Test Content');
        expect(entry!.mtime).toBe(1000);
        expect(entry!.size).toBeGreaterThan(0);
      });

      it('should return undefined for non-cached file', () => {
        const entry = cache.getCacheEntry('/nonexistent.txt');

        expect(entry).toBeUndefined();
      });
    });
  });

  describe('Helper functions', () => {
    beforeEach(() => {
      fileCache.clear();
    });

    describe('readScreenFile', () => {
      it('should read screen file with caching', () => {
        mockFiles.set('/screens/menu.txt', { content: 'Menu Screen', mtime: 1000 });

        const content = readScreenFile('/screens/menu.txt');

        expect(content).toBe('Menu Screen');
        expect(fileCache.isCached('/screens/menu.txt')).toBe(true);
      });

      it('should use utf8 encoding by default', () => {
        mockFiles.set('/screens/test.txt', { content: 'Test', mtime: 1000 });

        const content = readScreenFile('/screens/test.txt');

        expect(typeof content).toBe('string');
      });
    });

    describe('readBulletinFile', () => {
      it('should read bulletin file with caching', () => {
        mockFiles.set('/bulletins/bull1.txt', { content: 'Bulletin 1', mtime: 1000 });

        const content = readBulletinFile('/bulletins/bull1.txt');

        expect(content).toBe('Bulletin 1');
        expect(fileCache.isCached('/bulletins/bull1.txt')).toBe(true);
      });
    });

    describe('readInfoFile', () => {
      it('should read .info file with caching', () => {
        mockFiles.set('/config.info', { content: 'SETTING=value', mtime: 1000 });

        const content = readInfoFile('/config.info');

        expect(content).toBe('SETTING=value');
        expect(fileCache.isCached('/config.info')).toBe(true);
      });
    });

    describe('invalidateScreens', () => {
      it('should invalidate all screen files', () => {
        mockFiles.set('/Screens/menu.txt', { content: 'Menu', mtime: 1000 });
        mockFiles.set('/Node0/Screens/help.txt', { content: 'Help', mtime: 1001 });
        mockFiles.set('/other/file.txt', { content: 'Other', mtime: 1002 });

        readScreenFile('/Screens/menu.txt');
        readScreenFile('/Node0/Screens/help.txt');
        readScreenFile('/other/file.txt');

        invalidateScreens();

        expect(fileCache.isCached('/Screens/menu.txt')).toBe(false);
        expect(fileCache.isCached('/Node0/Screens/help.txt')).toBe(false);
        expect(fileCache.isCached('/other/file.txt')).toBe(true);
      });
    });

    describe('invalidateBulletins', () => {
      it('should invalidate all bulletin files', () => {
        mockFiles.set('/Bulletins/bull1.txt', { content: 'Bull1', mtime: 1000 });
        mockFiles.set('/Conf1/Bulletins/bull2.txt', { content: 'Bull2', mtime: 1001 });
        mockFiles.set('/other.txt', { content: 'Other', mtime: 1002 });

        readBulletinFile('/Bulletins/bull1.txt');
        readBulletinFile('/Conf1/Bulletins/bull2.txt');
        readScreenFile('/other.txt');

        invalidateBulletins();

        expect(fileCache.isCached('/Bulletins/bull1.txt')).toBe(false);
        expect(fileCache.isCached('/Conf1/Bulletins/bull2.txt')).toBe(false);
        expect(fileCache.isCached('/other.txt')).toBe(true);
      });
    });

    describe('invalidateConfigFiles', () => {
      it('should invalidate all .info files', () => {
        mockFiles.set('/config.info', { content: 'Config', mtime: 1000 });
        mockFiles.set('/doors/door.info', { content: 'Door', mtime: 1001 });
        mockFiles.set('/file.txt', { content: 'Text', mtime: 1002 });

        readInfoFile('/config.info');
        readInfoFile('/doors/door.info');
        readScreenFile('/file.txt');

        invalidateConfigFiles();

        expect(fileCache.isCached('/config.info')).toBe(false);
        expect(fileCache.isCached('/doors/door.info')).toBe(false);
        expect(fileCache.isCached('/file.txt')).toBe(true);
      });
    });
  });
});
