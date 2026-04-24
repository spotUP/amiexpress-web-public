/**
 * Unit tests for file-hold.util.ts
 * Tests HOLD directory file movement (express.e:19380-19410)
 */

// Prevent DB init: mocking fs/path breaks better-sqlite3 bindings.getRoot
process.env.SKIP_DB_INIT = '1';

import * as path from 'path';
import * as fs from 'fs/promises';
import {
  getHoldDir,
  getLCFilesDir,
  moveToHold,
  moveToLCFiles,
  getRootConferenceDir,
  getConferenceDir,
  getConferenceDirCandidates,
  getFileAreaDir,
  moveToFileArea,
  moveToFiles,
  moveUploadedFile
} from '../../src/utils/file-hold.util';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('path');
jest.mock('../../src/database', () => ({
  db: {
    query: jest.fn()
  }
}));
jest.mock('../../src/config', () => ({
  config: {
    get: jest.fn((key: string) => {
      if (key === 'dataDir') return '/data';
      if (key === 'bbsPath') return '/bbs';
      return undefined;
    })
  }
}));

import { db } from '../../src/database';

describe('file-hold.util', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Setup path mocks
    (path.join as jest.Mock).mockImplementation((...args: string[]) => args.join('/'));
    (path.isAbsolute as jest.Mock).mockImplementation((p: string) => p.startsWith('/'));

    // Setup fs mocks
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.rename as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockResolvedValue('0');
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

    // Setup db mock
    (db.query as jest.Mock).mockResolvedValue({
      rows: [{ path: '/files' }]
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getHoldDir', () => {
    it('should return HOLD directory path', () => {
      const result = getHoldDir('/bbs/Conf1');
      expect(result).toBe('/bbs/Conf1/HOLD');
    });

    it('should handle different conference paths', () => {
      expect(getHoldDir('/data/Conf5')).toBe('/data/Conf5/HOLD');
      expect(getHoldDir('Conf1')).toBe('Conf1/HOLD');
    });

    it('should call path.join with correct arguments', () => {
      getHoldDir('/bbs/Conf1');
      expect(path.join).toHaveBeenCalledWith('/bbs/Conf1', 'HOLD');
    });
  });

  describe('getLCFilesDir', () => {
    it('should return LCFILES directory path', () => {
      const result = getLCFilesDir('/bbs/Conf1');
      expect(result).toBe('/bbs/Conf1/LCFILES');
    });

    it('should handle different conference paths', () => {
      expect(getLCFilesDir('/data/Conf3')).toBe('/data/Conf3/LCFILES');
      expect(getLCFilesDir('Conf1')).toBe('Conf1/LCFILES');
    });

    it('should call path.join with correct arguments', () => {
      getLCFilesDir('/bbs/Conf1');
      expect(path.join).toHaveBeenCalledWith('/bbs/Conf1', 'LCFILES');
    });
  });

  describe('moveToHold', () => {
    it('should move file to HOLD directory', async () => {
      const result = await moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(result).toBe('/bbs/Conf1/HOLD/file.zip');
      expect(fs.mkdir).toHaveBeenCalledWith('/bbs/Conf1/HOLD', { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith('/tmp/file.zip', '/bbs/Conf1/HOLD/file.zip');
    });

    it('should update HELD tracking file', async () => {
      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('Not found'));  // HELD file doesn't exist

      await moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(fs.writeFile).toHaveBeenCalledWith('/bbs/Conf1/HOLD/HELD', '1');
    });

    it('should increment HELD count', async () => {
      (fs.readFile as jest.Mock).mockResolvedValueOnce('5');  // Current count

      await moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(fs.writeFile).toHaveBeenCalledWith('/bbs/Conf1/HOLD/HELD', '6');
    });

    it('should handle rename errors', async () => {
      (fs.rename as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1')).rejects.toThrow('Permission denied');
    });

    it('should create HOLD directory if it does not exist', async () => {
      await moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(fs.mkdir).toHaveBeenCalledWith('/bbs/Conf1/HOLD', { recursive: true });
    });

    it('should log success message', async () => {
      await moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[HOLD]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('file.zip'));
    });

    it('should handle invalid HELD tracking content', async () => {
      (fs.readFile as jest.Mock).mockResolvedValueOnce('invalid');

      await moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      // Should treat invalid content as 0 and increment to 1
      expect(fs.writeFile).toHaveBeenCalledWith('/bbs/Conf1/HOLD/HELD', '1');
    });

    it('should handle HELD tracking write errors gracefully', async () => {
      (fs.writeFile as jest.Mock)
        .mockRejectedValueOnce(new Error('Disk full'))
        .mockResolvedValueOnce(undefined);  // Second writeFile call should not be reached

      // Should not throw even if HELD tracking write fails
      await expect(moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1')).resolves.not.toThrow();
    });
  });

  describe('moveToLCFiles', () => {
    it('should move file to LCFILES directory', async () => {
      const result = await moveToLCFiles('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(result).toBe('/bbs/Conf1/LCFILES/file.zip');
      expect(fs.mkdir).toHaveBeenCalledWith('/bbs/Conf1/LCFILES', { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith('/tmp/file.zip', '/bbs/Conf1/LCFILES/file.zip');
    });

    it('should create LCFILES directory if it does not exist', async () => {
      await moveToLCFiles('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(fs.mkdir).toHaveBeenCalledWith('/bbs/Conf1/LCFILES', { recursive: true });
    });

    it('should handle rename errors', async () => {
      (fs.rename as jest.Mock).mockRejectedValueOnce(new Error('File not found'));

      await expect(moveToLCFiles('/tmp/file.zip', 'file.zip', '/bbs/Conf1')).rejects.toThrow('File not found');
    });

    it('should log success message', async () => {
      await moveToLCFiles('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[LCFILES]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('file.zip'));
    });

    it('should handle paths with special characters', async () => {
      await moveToLCFiles('/tmp/file [v1.0].zip', 'file [v1.0].zip', '/bbs/Conf1');

      expect(fs.rename).toHaveBeenCalledWith('/tmp/file [v1.0].zip', '/bbs/Conf1/LCFILES/file [v1.0].zip');
    });
  });

  describe('getRootConferenceDir', () => {
    it('should return conference directory path', () => {
      const result = getRootConferenceDir(1, '/bbs');
      expect(result).toBe('/bbs/Conf1');
    });

    it('should handle different conference IDs', () => {
      expect(getRootConferenceDir(5, '/bbs')).toBe('/bbs/Conf5');
      expect(getRootConferenceDir(10, '/data')).toBe('/data/Conf10');
    });

    it('should call path.join with correct arguments', () => {
      getRootConferenceDir(1, '/bbs');
      expect(path.join).toHaveBeenCalledWith('/bbs', 'Conf1');
    });
  });

  describe('getConferenceDir', () => {
    it('should delegate to getRootConferenceDir', () => {
      const result = getConferenceDir(1, '/bbs');
      expect(result).toBe('/bbs/Conf1');
    });

    it('should handle different conference IDs', () => {
      expect(getConferenceDir(3, '/data')).toBe('/data/Conf3');
    });
  });

  describe('getConferenceDirCandidates', () => {
    it('should return array with root conference directory', () => {
      const result = getConferenceDirCandidates(1, '/bbs');
      expect(result).toEqual(['/bbs/Conf1']);
    });

    it('should return single element array', () => {
      const result = getConferenceDirCandidates(5, '/data');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('/data/Conf5');
    });
  });

  describe('getFileAreaDir', () => {
    it('should return absolute file area path', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ path: '/absolute/path/files' }]
      });

      const result = await getFileAreaDir(1, '/bbs');

      expect(result).toBe('/absolute/path/files');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT path FROM file_areas'),
        [1]
      );
    });

    it('should return relative file area path joined with BBS path', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ path: 'Conf1/Files' }]
      });

      const result = await getFileAreaDir(1, '/bbs');

      expect(result).toBe('/bbs/Conf1/Files');
    });

    it('should throw error when file area not found', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      });

      await expect(getFileAreaDir(999, '/bbs')).rejects.toThrow('File area 999 not found');
    });

    it('should handle database query errors', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await expect(getFileAreaDir(1, '/bbs')).rejects.toThrow('Database error');
    });

    it('should correctly identify absolute paths', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ path: '/usr/local/bbs/files' }]
      });

      const result = await getFileAreaDir(1, '/bbs');

      expect(path.isAbsolute).toHaveBeenCalledWith('/usr/local/bbs/files');
      expect(result).toBe('/usr/local/bbs/files');
    });

    it('should correctly handle relative paths', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ path: 'files/area1' }]
      });

      const result = await getFileAreaDir(1, '/bbs');

      expect(path.isAbsolute).toHaveBeenCalledWith('files/area1');
      expect(result).toBe('/bbs/files/area1');
    });
  });

  describe('moveToFileArea', () => {
    it('should move file to file area directory', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ path: '/files/area1' }]
      });

      const result = await moveToFileArea('/tmp/file.zip', 'file.zip', 1, '/bbs');

      expect(result).toBe('/files/area1/file.zip');
      expect(fs.mkdir).toHaveBeenCalledWith('/files/area1', { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith('/tmp/file.zip', '/files/area1/file.zip');
    });

    it('should create file area directory if it does not exist', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ path: '/files/area1' }]
      });

      await moveToFileArea('/tmp/file.zip', 'file.zip', 1, '/bbs');

      expect(fs.mkdir).toHaveBeenCalledWith('/files/area1', { recursive: true });
    });

    it('should handle rename errors', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ path: '/files/area1' }]
      });
      (fs.rename as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(moveToFileArea('/tmp/file.zip', 'file.zip', 1, '/bbs')).rejects.toThrow('Permission denied');
    });

    it('should log success message', async () => {
      const { db } = require('../../src/database');
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ path: '/files/area1' }]
      });

      await moveToFileArea('/tmp/file.zip', 'file.zip', 1, '/bbs');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[FileArea]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('file.zip'));
    });
  });

  describe('moveToFiles', () => {
    it('should move file to Files directory', async () => {
      const result = await moveToFiles('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(result).toBe('/bbs/Conf1/Files/file.zip');
      expect(fs.mkdir).toHaveBeenCalledWith('/bbs/Conf1/Files', { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith('/tmp/file.zip', '/bbs/Conf1/Files/file.zip');
    });

    it('should create Files directory if it does not exist', async () => {
      await moveToFiles('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(fs.mkdir).toHaveBeenCalledWith('/bbs/Conf1/Files', { recursive: true });
    });

    it('should handle rename errors', async () => {
      (fs.rename as jest.Mock).mockRejectedValueOnce(new Error('Disk full'));

      await expect(moveToFiles('/tmp/file.zip', 'file.zip', '/bbs/Conf1')).rejects.toThrow('Disk full');
    });

    it('should log success message', async () => {
      await moveToFiles('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Files]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('file.zip'));
    });
  });

  describe('moveUploadedFile', () => {
    it('should move file to HOLD for "hold" status', async () => {
      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

      const result = await moveUploadedFile('/tmp/file.zip', 'file.zip', 'hold', 1, '/bbs');

      expect(result).toBe('/bbs/Conf1/HOLD/file.zip');
      expect(fs.rename).toHaveBeenCalledWith('/tmp/file.zip', '/bbs/Conf1/HOLD/file.zip');
    });

    it('should move file to HOLD for "private" status', async () => {
      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

      const result = await moveUploadedFile('/tmp/file.zip', 'file.zip', 'private', 1, '/bbs');

      expect(result).toBe('/bbs/Conf1/HOLD/file.zip');
    });

    it('should move file to LCFILES for "lcfiles" status', async () => {
      const result = await moveUploadedFile('/tmp/file.zip', 'file.zip', 'lcfiles', 1, '/bbs');

      expect(result).toBe('/bbs/Conf1/LCFILES/file.zip');
    });

    it('should move file to Files for "active" status', async () => {
      const result = await moveUploadedFile('/tmp/file.zip', 'file.zip', 'active', 1, '/bbs');

      expect(result).toBe('/bbs/Conf1/Files/file.zip');
    });

    it('should use correct conference directory for different IDs', async () => {
      await moveUploadedFile('/tmp/file.zip', 'file.zip', 'active', 5, '/bbs');

      expect(fs.rename).toHaveBeenCalledWith('/tmp/file.zip', '/bbs/Conf5/Files/file.zip');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty filename', async () => {
      await moveToFiles('/tmp/', '', '/bbs/Conf1');

      expect(fs.rename).toHaveBeenCalledWith('/tmp/', '/bbs/Conf1/Files/');
    });

    it('should handle filename with multiple dots', async () => {
      await moveToFiles('/tmp/file.tar.gz', 'file.tar.gz', '/bbs/Conf1');

      expect(fs.rename).toHaveBeenCalledWith('/tmp/file.tar.gz', '/bbs/Conf1/Files/file.tar.gz');
    });

    it('should handle very long filenames', async () => {
      const longName = 'a'.repeat(255);
      await moveToFiles(`/tmp/${longName}`, longName, '/bbs/Conf1');

      expect(fs.rename).toHaveBeenCalledWith(`/tmp/${longName}`, `/bbs/Conf1/Files/${longName}`);
    });

    it('should handle whitespace trimming in HELD tracking', async () => {
      (fs.readFile as jest.Mock).mockResolvedValueOnce('  10  \n');

      await moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      expect(fs.writeFile).toHaveBeenCalledWith('/bbs/Conf1/HOLD/HELD', '11');
    });

    it('should handle negative count in HELD tracking gracefully', async () => {
      (fs.readFile as jest.Mock).mockResolvedValueOnce('-5');

      await moveToHold('/tmp/file.zip', 'file.zip', '/bbs/Conf1');

      // parseInt('-5') = -5, then increment to -4
      expect(fs.writeFile).toHaveBeenCalledWith('/bbs/Conf1/HOLD/HELD', '-4');
    });
  });
});
