/**
 * File Flagging System Utility Unit Tests
 *
 * Tests file flag management for batch downloads based on express.e:2713-2858, 12486-12600.
 * Users flag files during listing, then download all flagged files at once.
 */

// jest.mock('fs') below auto-mocks the WHOLE 'fs' module for this test
// file's module registry, including the copy 'bindings'/'better-sqlite3'
// use internally to locate their native binary. tests/setup.ts's global
// beforeAll unconditionally opens a REAL sqlite database unless
// SKIP_DB_INIT=1 is set — with 'fs' mocked out from under it, that open
// fails with "Could not locate the bindings file" (unrelated to this
// file's own tests, none of which touch the database). Skip real DB init
// here; this suite is pure fs-mocked unit tests with no DB dependency.
//
// Saved/restored (not just set) because Jest workers run multiple test
// FILES in the same process — process.env is NOT reset between files, so
// an unconditional `process.env.SKIP_DB_INIT = '1'` would leak into
// whichever test file happens to run next in this worker and silently
// skip ITS real-DB init too.
const __savedSkipDbInit = process.env.SKIP_DB_INIT;
process.env.SKIP_DB_INIT = '1';
afterAll(() => {
  if (__savedSkipDbInit === undefined) delete process.env.SKIP_DB_INIT;
  else process.env.SKIP_DB_INIT = __savedSkipDbInit;
});

import * as fs from 'fs';
import * as path from 'path';
import {
  FileFlagManager,
  FlaggedFile,
  getShowFlagsMessage,
  getFlagFilesPrompt,
  getClearFlagsPrompt,
  getFlagFromPrompt,
} from '../../src/utils/file-flag.util';

// Mock fs
jest.mock('fs');

describe('File Flagging System Utility', () => {
  let manager: FileFlagManager;
  let mockFs: Map<string, string>;
  const testBbsPath = '/test/bbs';
  const testUserSlot = 5;
  const testNodeNumber = 0;

  beforeEach(() => {
    manager = new FileFlagManager(testBbsPath, testUserSlot, testNodeNumber);
    mockFs = new Map();

    // Mock fs functions
    (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
      return mockFs.has(path);
    });

    (fs.readFileSync as jest.Mock).mockImplementation((path: string, encoding?: string) => {
      const content = mockFs.get(path);
      if (!content) {
        throw new Error(`File not found: ${path}`);
      }
      return content;
    });

    (fs.writeFileSync as jest.Mock).mockImplementation((path: string, content: string) => {
      mockFs.set(path, content);
    });

    (fs.unlinkSync as jest.Mock).mockImplementation((path: string) => {
      mockFs.delete(path);
    });

    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});

    // Suppress console logs
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('FileFlagManager', () => {
    describe('constructor', () => {
      it('should initialize with empty flag list', () => {
        expect(manager.getCount()).toBe(0);
      });

      it('should store bbs data path', () => {
        expect(manager['bbsDataPath']).toBe(testBbsPath);
      });

      it('should store user slot', () => {
        expect(manager['userSlot']).toBe(testUserSlot);
      });

      it('should store node number', () => {
        expect(manager['nodeNumber']).toBe(testNodeNumber);
      });
    });

    describe('addFlag', () => {
      it('should add file to flag list', () => {
        const result = manager.addFlag('TEST.ZIP', 1);

        expect(result).toBe(true);
        expect(manager.getCount()).toBe(1);
      });

      it('should convert filename to uppercase', () => {
        manager.addFlag('test.zip', 1);

        const flags = manager.getAll();
        expect(flags[0].filename).toBe('TEST.ZIP');
      });

      it('should trim whitespace from filename', () => {
        manager.addFlag('  test.zip  ', 1);

        const flags = manager.getAll();
        expect(flags[0].filename).toBe('TEST.ZIP');
      });

      it('should store conference number', () => {
        manager.addFlag('TEST.ZIP', 5);

        const flags = manager.getAll();
        expect(flags[0].confNum).toBe(5);
      });

      it('should default conference to -1 (all)', () => {
        manager.addFlag('TEST.ZIP');

        const flags = manager.getAll();
        expect(flags[0].confNum).toBe(-1);
      });

      it('should reject empty filename', () => {
        const result = manager.addFlag('', 1);

        expect(result).toBe(false);
        expect(manager.getCount()).toBe(0);
      });

      it('should reject whitespace-only filename', () => {
        const result = manager.addFlag('   ', 1);

        expect(result).toBe(false);
        expect(manager.getCount()).toBe(0);
      });

      it('should reject duplicate flag (same file and conference)', () => {
        manager.addFlag('TEST.ZIP', 1);
        const result = manager.addFlag('TEST.ZIP', 1);

        expect(result).toBe(false);
        expect(manager.getCount()).toBe(1);
      });

      it('should allow same file in different conferences', () => {
        manager.addFlag('TEST.ZIP', 1);
        const result = manager.addFlag('TEST.ZIP', 2);

        expect(result).toBe(true);
        expect(manager.getCount()).toBe(2);
      });

      it('should handle case-insensitive duplicate detection', () => {
        manager.addFlag('test.zip', 1);
        const result = manager.addFlag('TEST.ZIP', 1);

        expect(result).toBe(false);
        expect(manager.getCount()).toBe(1);
      });
    });

    describe('addFlags', () => {
      it('should add multiple space-separated files', () => {
        const count = manager.addFlags('FILE1.ZIP FILE2.LHA FILE3.TXT', 1);

        expect(count).toBe(3);
        expect(manager.getCount()).toBe(3);
      });

      it('should handle extra spaces', () => {
        const count = manager.addFlags('FILE1.ZIP  FILE2.LHA   FILE3.TXT', 1);

        expect(count).toBe(3);
        expect(manager.getCount()).toBe(3);
      });

      it('should skip empty entries', () => {
        const count = manager.addFlags('FILE1.ZIP  ', 1);

        expect(count).toBe(1);
        expect(manager.getCount()).toBe(1);
      });

      it('should skip duplicates in batch', () => {
        manager.addFlag('FILE1.ZIP', 1);
        const count = manager.addFlags('FILE1.ZIP FILE2.ZIP', 1);

        expect(count).toBe(1); // Only FILE2.ZIP added
        expect(manager.getCount()).toBe(2);
      });

      it('should handle empty string', () => {
        const count = manager.addFlags('', 1);

        expect(count).toBe(0);
        expect(manager.getCount()).toBe(0);
      });

      it('should apply conference to all files', () => {
        manager.addFlags('FILE1.ZIP FILE2.LHA', 5);

        const flags = manager.getAll();
        expect(flags.every(f => f.confNum === 5)).toBe(true);
      });
    });

    describe('removeFlag', () => {
      it('should remove flagged file', () => {
        manager.addFlag('TEST.ZIP', 1);
        const result = manager.removeFlag('TEST.ZIP', 1);

        expect(result).toBe(true);
        expect(manager.getCount()).toBe(0);
      });

      it('should be case-insensitive', () => {
        manager.addFlag('TEST.ZIP', 1);
        const result = manager.removeFlag('test.zip', 1);

        expect(result).toBe(true);
        expect(manager.getCount()).toBe(0);
      });

      it('should trim whitespace', () => {
        manager.addFlag('TEST.ZIP', 1);
        const result = manager.removeFlag('  TEST.ZIP  ', 1);

        expect(result).toBe(true);
        expect(manager.getCount()).toBe(0);
      });

      it('should remove only matching conference', () => {
        manager.addFlag('TEST.ZIP', 1);
        manager.addFlag('TEST.ZIP', 2);
        manager.removeFlag('TEST.ZIP', 1);

        expect(manager.getCount()).toBe(1);
        expect(manager.getForConference(2).length).toBe(1);
      });

      it('should remove all conferences when confNum=-1', () => {
        manager.addFlag('TEST.ZIP', 1);
        manager.addFlag('TEST.ZIP', 2);
        const result = manager.removeFlag('TEST.ZIP', -1);

        expect(result).toBe(true);
        expect(manager.getCount()).toBe(0);
      });

      it('should return false when file not found', () => {
        const result = manager.removeFlag('NONEXISTENT.ZIP', 1);

        expect(result).toBe(false);
      });

      it('should return false when conference does not match', () => {
        manager.addFlag('TEST.ZIP', 1);
        const result = manager.removeFlag('TEST.ZIP', 2);

        expect(result).toBe(false);
        expect(manager.getCount()).toBe(1);
      });
    });

    describe('clearAll', () => {
      it('should remove all flags', () => {
        manager.addFlags('FILE1.ZIP FILE2.LHA FILE3.TXT', 1);
        manager.clearAll();

        expect(manager.getCount()).toBe(0);
      });

      it('should handle empty list', () => {
        manager.clearAll();

        expect(manager.getCount()).toBe(0);
      });
    });

    describe('isFlagged', () => {
      it('should return true for flagged file', () => {
        manager.addFlag('TEST.ZIP', 1);

        expect(manager.isFlagged('TEST.ZIP', 1)).toBe(true);
      });

      it('should return false for non-flagged file', () => {
        expect(manager.isFlagged('TEST.ZIP', 1)).toBe(false);
      });

      it('should be case-insensitive', () => {
        manager.addFlag('TEST.ZIP', 1);

        expect(manager.isFlagged('test.zip', 1)).toBe(true);
      });

      it('should trim whitespace', () => {
        manager.addFlag('TEST.ZIP', 1);

        expect(manager.isFlagged('  TEST.ZIP  ', 1)).toBe(true);
      });

      it('should match wildcard conference (-1)', () => {
        manager.addFlag('TEST.ZIP', -1);

        expect(manager.isFlagged('TEST.ZIP', 1)).toBe(true);
        expect(manager.isFlagged('TEST.ZIP', 2)).toBe(true);
      });

      it('should match when checking with confNum=-1', () => {
        manager.addFlag('TEST.ZIP', 1);

        expect(manager.isFlagged('TEST.ZIP', -1)).toBe(true);
      });

      it('should not match different conferences', () => {
        manager.addFlag('TEST.ZIP', 1);

        expect(manager.isFlagged('TEST.ZIP', 2)).toBe(false);
      });
    });

    describe('getAll', () => {
      it('should return all flagged files', () => {
        manager.addFlag('FILE1.ZIP', 1);
        manager.addFlag('FILE2.LHA', 2);

        const flags = manager.getAll();

        expect(flags.length).toBe(2);
      });

      it('should return copy of internal array', () => {
        manager.addFlag('TEST.ZIP', 1);
        const flags1 = manager.getAll();
        flags1.push({ filename: 'EXTERNAL.ZIP', confNum: 99 });

        const flags2 = manager.getAll();
        expect(flags2.length).toBe(1);
      });

      it('should return empty array when no flags', () => {
        const flags = manager.getAll();

        expect(flags).toEqual([]);
      });
    });

    describe('getForConference', () => {
      it('should return files for specific conference', () => {
        manager.addFlag('FILE1.ZIP', 1);
        manager.addFlag('FILE2.LHA', 2);
        manager.addFlag('FILE3.TXT', 1);

        const flags = manager.getForConference(1);

        expect(flags.length).toBe(2);
        expect(flags.every(f => f.confNum === 1)).toBe(true);
      });

      it('should include wildcard flags (-1)', () => {
        manager.addFlag('FILE1.ZIP', -1);
        manager.addFlag('FILE2.LHA', 1);

        const flags = manager.getForConference(1);

        expect(flags.length).toBe(2);
      });

      it('should return empty array for conference with no flags', () => {
        manager.addFlag('FILE1.ZIP', 1);

        const flags = manager.getForConference(99);

        expect(flags).toEqual([]);
      });
    });

    describe('getCount', () => {
      it('should return number of flagged files', () => {
        manager.addFlags('FILE1.ZIP FILE2.LHA FILE3.TXT', 1);

        expect(manager.getCount()).toBe(3);
      });

      it('should return 0 for empty list', () => {
        expect(manager.getCount()).toBe(0);
      });
    });

    describe('getDisplayString', () => {
      it('should display "No file flags" when empty', () => {
        const display = manager.getDisplayString();

        expect(display).toBe('No file flags');
      });

      it('should display space-separated filenames', () => {
        manager.addFlags('FILE1.ZIP FILE2.LHA FILE3.TXT', 1);

        const display = manager.getDisplayString();

        expect(display).toBe('FILE1.ZIP FILE2.LHA FILE3.TXT');
      });

      it('should handle single file', () => {
        manager.addFlag('SINGLE.ZIP', 1);

        const display = manager.getDisplayString();

        expect(display).toBe('SINGLE.ZIP');
      });

      it('should truncate to maxLen', () => {
        manager.addFlags('FILE1.ZIP FILE2.LHA', 1);

        const display = manager.getDisplayString(12);

        expect(display.length).toBeLessThanOrEqual(12);
        expect(display).toBe('FILE1.ZIP FI');
      });

      it('should handle maxLen shorter than first file', () => {
        manager.addFlag('VERYLONGFILENAME.ZIP', 1);

        const display = manager.getDisplayString(5);

        expect(display).toBe('VERYL');
      });

      it('should handle maxLen=-1 (no limit)', () => {
        manager.addFlags('A.ZIP B.LHA C.TXT', 1);

        const display = manager.getDisplayString(-1);

        expect(display).toBe('A.ZIP B.LHA C.TXT');
      });
    });

    describe('load', () => {
      it('should load from flagged file', async () => {
        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        mockFs.set(flaggedPath, '1 FILE1.ZIP\n2 FILE2.LHA\n');

        await manager.load();

        expect(manager.getCount()).toBe(2);
        expect(manager.isFlagged('FILE1.ZIP', 1)).toBe(true);
        expect(manager.isFlagged('FILE2.LHA', 2)).toBe(true);
      });

      it('should load from dump file', async () => {
        const dumpPath = path.join(testBbsPath, 'Partdownload', `dump${testUserSlot}`);
        mockFs.set(dumpPath, 'FILE1.ZIP FILE2.LHA FILE3.TXT');

        await manager.load();

        expect(manager.getCount()).toBe(3);
        expect(manager.isFlagged('FILE1.ZIP', -1)).toBe(true);
      });

      it('should combine flagged and dump files', async () => {
        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        const dumpPath = path.join(testBbsPath, 'Partdownload', `dump${testUserSlot}`);
        mockFs.set(flaggedPath, '1 FILE1.ZIP\n');
        mockFs.set(dumpPath, 'FILE2.LHA');

        await manager.load();

        expect(manager.getCount()).toBe(2);
      });

      it('should skip invalid lines', async () => {
        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        mockFs.set(flaggedPath, '1 FILE1.ZIP\nINVALID\n2 FILE2.LHA\n');

        await manager.load();

        expect(manager.getCount()).toBe(2);
      });

      it('should handle missing files gracefully', async () => {
        await expect(manager.load()).resolves.not.toThrow();
        expect(manager.getCount()).toBe(0);
      });

      it('should skip empty lines', async () => {
        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        mockFs.set(flaggedPath, '1 FILE1.ZIP\n\n2 FILE2.LHA\n');

        await manager.load();

        expect(manager.getCount()).toBe(2);
      });

      it('should clear existing flags before loading', async () => {
        manager.addFlag('EXISTING.ZIP', 1);

        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        mockFs.set(flaggedPath, '2 LOADED.ZIP\n');

        await manager.load();

        expect(manager.getCount()).toBe(1);
        expect(manager.isFlagged('EXISTING.ZIP', 1)).toBe(false);
        expect(manager.isFlagged('LOADED.ZIP', 2)).toBe(true);
      });

      it('should handle read errors gracefully', async () => {
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
          throw new Error('Read error');
        });

        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        mockFs.set(flaggedPath, 'dummy');

        await expect(manager.load()).resolves.not.toThrow();
      });
    });

    describe('save', () => {
      it('should save flagged files', async () => {
        manager.addFlag('FILE1.ZIP', 1);
        manager.addFlag('FILE2.LHA', 2);

        await manager.save();

        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        const content = mockFs.get(flaggedPath);

        expect(content).toContain('1 FILE1.ZIP');
        expect(content).toContain('2 FILE2.LHA');
      });

      it('should create Partdownload directory', async () => {
        manager.addFlag('TEST.ZIP', 1);

        await manager.save();

        expect(fs.mkdirSync).toHaveBeenCalled();
      });

      it('should delete old files before saving', async () => {
        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        const dumpPath = path.join(testBbsPath, 'Partdownload', `dump${testUserSlot}`);
        mockFs.set(flaggedPath, 'old content');
        mockFs.set(dumpPath, 'old dump');

        manager.addFlag('NEW.ZIP', 1);
        await manager.save();

        expect(fs.unlinkSync).toHaveBeenCalledWith(flaggedPath);
        expect(fs.unlinkSync).toHaveBeenCalledWith(dumpPath);
      });

      it('should not create files when no flags', async () => {
        await manager.save();

        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        expect(mockFs.has(flaggedPath)).toBe(false);
      });

      it('should handle write errors gracefully', async () => {
        (fs.writeFileSync as jest.Mock).mockImplementation(() => {
          throw new Error('Write error');
        });

        manager.addFlag('TEST.ZIP', 1);

        await expect(manager.save()).resolves.not.toThrow();
        expect(console.error).toHaveBeenCalled();
      });

      it('should format each flag on separate line', async () => {
        manager.addFlag('FILE1.ZIP', 1);
        manager.addFlag('FILE2.LHA', 2);

        await manager.save();

        const flaggedPath = path.join(testBbsPath, 'Partdownload', `flagged${testUserSlot}`);
        const content = mockFs.get(flaggedPath);
        const lines = content!.split('\n').filter(l => l.length > 0);

        expect(lines.length).toBe(2);
      });
    });
  });

  describe('Helper functions', () => {
    describe('getShowFlagsMessage', () => {
      it('should show "No file flags" when empty', () => {
        const message = getShowFlagsMessage(manager);

        expect(message).toBe('No file flags\r\n');
      });

      it('should show flagged files with newline', () => {
        manager.addFlags('FILE1.ZIP FILE2.LHA', 1);

        const message = getShowFlagsMessage(manager);

        expect(message).toContain('FILE1.ZIP');
        expect(message).toContain('FILE2.LHA');
        expect(message.endsWith('\r\n')).toBe(true);
      });
    });

    describe('getFlagFilesPrompt', () => {
      it('should return ANSI-colored prompt', () => {
        const prompt = getFlagFilesPrompt();

        expect(prompt).toContain('Filename(s) to flag');
        expect(prompt).toContain('\x1b[');
      });

      it('should include F(rom) option', () => {
        const prompt = getFlagFilesPrompt();

        expect(prompt).toContain('F');
        expect(prompt).toContain('rom');
      });

      it('should include C(lear) option', () => {
        const prompt = getFlagFilesPrompt();

        expect(prompt).toContain('C');
        expect(prompt).toContain('lear');
      });
    });

    describe('getClearFlagsPrompt', () => {
      it('should return ANSI-colored prompt', () => {
        const prompt = getClearFlagsPrompt();

        expect(prompt).toContain('Filename(s) to Clear');
        expect(prompt).toContain('\x1b[');
      });

      it('should include * (all) option', () => {
        const prompt = getClearFlagsPrompt();

        expect(prompt).toContain('*');
        expect(prompt).toContain('All');
      });
    });

    describe('getFlagFromPrompt', () => {
      it('should return ANSI-colored prompt', () => {
        const prompt = getFlagFromPrompt();

        expect(prompt).toContain('Filename to start flagging from');
        expect(prompt).toContain('\x1b[');
      });
    });
  });

  describe('integration tests', () => {
    it('should handle complete flag workflow', async () => {
      // Add flags
      manager.addFlags('FILE1.ZIP FILE2.LHA FILE3.TXT', 1);
      expect(manager.getCount()).toBe(3);

      // Save
      await manager.save();

      // Create new manager and load
      const manager2 = new FileFlagManager(testBbsPath, testUserSlot, testNodeNumber);
      await manager2.load();

      expect(manager2.getCount()).toBe(3);
      expect(manager2.isFlagged('FILE1.ZIP', 1)).toBe(true);
      expect(manager2.isFlagged('FILE2.LHA', 1)).toBe(true);
      expect(manager2.isFlagged('FILE3.TXT', 1)).toBe(true);
    });

    it('should handle multiple conferences', () => {
      manager.addFlag('SHARED.ZIP', -1);
      manager.addFlag('CONF1.LHA', 1);
      manager.addFlag('CONF2.TXT', 2);

      expect(manager.getForConference(1).length).toBe(2); // SHARED + CONF1
      expect(manager.getForConference(2).length).toBe(2); // SHARED + CONF2
      expect(manager.getCount()).toBe(3);
    });

    it('should handle flag manipulation workflow', () => {
      // Add batch
      manager.addFlags('FILE1.ZIP FILE2.LHA FILE3.TXT', 1);
      expect(manager.getCount()).toBe(3);

      // Remove one
      manager.removeFlag('FILE2.LHA', 1);
      expect(manager.getCount()).toBe(2);

      // Display remaining
      const display = manager.getDisplayString();
      expect(display).toContain('FILE1.ZIP');
      expect(display).toContain('FILE3.TXT');
      expect(display).not.toContain('FILE2.LHA');

      // Clear all
      manager.clearAll();
      expect(manager.getCount()).toBe(0);
    });
  });
});
