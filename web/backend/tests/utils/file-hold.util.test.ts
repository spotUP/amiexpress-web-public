// @ts-nocheck
/**
 * Unit tests for file-hold.util.ts
 * Tests HOLD directory file movement (express.e:19380-19410)
 *
 * Uses real filesystem (temp dirs) because file-hold.util is loaded via
 * MessageIndexManager → database.ts → setup.ts, so jest.mock('path') and
 * jest.mock('fs/promises') cannot intercept the pre-loaded module references.
 */

import * as os from 'os';
import * as realPath from 'path';
import * as realFs from 'fs';
import { promisify } from 'util';

// Mock database (file-hold uses dynamic require('../database') at runtime)
jest.mock('../../src/database', () => ({
  db: {
    query: jest.fn()
  }
}));

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

describe('file-hold.util', () => {
  let testDir: string;
  let confDir: string;
  let srcFile: string;

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create temp directory structure: testDir/Conf1/ (conference directory)
    testDir = realFs.mkdtempSync(realPath.join(os.tmpdir(), 'file-hold-test-'));
    confDir = realPath.join(testDir, 'Conf1');
    realFs.mkdirSync(confDir, { recursive: true });

    // Create a source file to be moved
    srcFile = realPath.join(testDir, 'file.zip');
    realFs.writeFileSync(srcFile, 'test content');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (realFs.existsSync(testDir)) {
      realFs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getHoldDir', () => {
    it('should return HOLD directory path', () => {
      const result = getHoldDir('/bbs/Conf1');
      expect(result).toBe(realPath.join('/bbs/Conf1', 'HOLD'));
    });

    it('should handle different conference paths', () => {
      expect(getHoldDir('/data/Conf5')).toBe(realPath.join('/data/Conf5', 'HOLD'));
      expect(getHoldDir('Conf1')).toBe(realPath.join('Conf1', 'HOLD'));
    });

    it('should use path.join semantics', () => {
      const result = getHoldDir('/bbs/Conf1');
      expect(result).toContain('HOLD');
      expect(result).toContain('Conf1');
    });
  });

  describe('getLCFilesDir', () => {
    it('should return LCFILES directory path', () => {
      const result = getLCFilesDir('/bbs/Conf1');
      expect(result).toBe(realPath.join('/bbs/Conf1', 'LCFILES'));
    });

    it('should handle different conference paths', () => {
      expect(getLCFilesDir('/data/Conf3')).toBe(realPath.join('/data/Conf3', 'LCFILES'));
      expect(getLCFilesDir('Conf1')).toBe(realPath.join('Conf1', 'LCFILES'));
    });

    it('should include LCFILES in result', () => {
      const result = getLCFilesDir('/bbs/Conf1');
      expect(result).toContain('LCFILES');
    });
  });

  describe('moveToHold', () => {
    it('should move file to HOLD directory', async () => {
      const result = await moveToHold(srcFile, 'file.zip', confDir);

      const expectedPath = realPath.join(confDir, 'HOLD', 'file.zip');
      expect(result).toBe(expectedPath);
      expect(realFs.existsSync(expectedPath)).toBe(true);
      expect(realFs.existsSync(srcFile)).toBe(false);
    });

    it('should create HOLD directory if it does not exist', async () => {
      const holdDir = realPath.join(confDir, 'HOLD');
      expect(realFs.existsSync(holdDir)).toBe(false);

      await moveToHold(srcFile, 'file.zip', confDir);

      expect(realFs.existsSync(holdDir)).toBe(true);
    });

    it('should update HELD tracking file when not exists', async () => {
      await moveToHold(srcFile, 'file.zip', confDir);

      const heldFile = realPath.join(confDir, 'HOLD', 'HELD');
      expect(realFs.existsSync(heldFile)).toBe(true);
      expect(realFs.readFileSync(heldFile, 'utf8')).toBe('1');
    });

    it('should increment HELD count when file exists', async () => {
      const holdDir = realPath.join(confDir, 'HOLD');
      realFs.mkdirSync(holdDir, { recursive: true });
      realFs.writeFileSync(realPath.join(holdDir, 'HELD'), '5');

      await moveToHold(srcFile, 'file.zip', confDir);

      expect(realFs.readFileSync(realPath.join(holdDir, 'HELD'), 'utf8')).toBe('6');
    });

    it('should handle invalid HELD tracking content', async () => {
      const holdDir = realPath.join(confDir, 'HOLD');
      realFs.mkdirSync(holdDir, { recursive: true });
      realFs.writeFileSync(realPath.join(holdDir, 'HELD'), 'invalid');

      await moveToHold(srcFile, 'file.zip', confDir);

      // parseInt('invalid') = NaN, treated as 0, incremented to 1
      expect(realFs.readFileSync(realPath.join(holdDir, 'HELD'), 'utf8')).toBe('1');
    });

    it('should handle whitespace in HELD tracking', async () => {
      const holdDir = realPath.join(confDir, 'HOLD');
      realFs.mkdirSync(holdDir, { recursive: true });
      realFs.writeFileSync(realPath.join(holdDir, 'HELD'), '  10  \n');

      await moveToHold(srcFile, 'file.zip', confDir);

      expect(realFs.readFileSync(realPath.join(holdDir, 'HELD'), 'utf8')).toBe('11');
    });

    it('should log success message', async () => {
      await moveToHold(srcFile, 'file.zip', confDir);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[HOLD]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('file.zip'));
    });

    it('should handle rename errors (source not found)', async () => {
      const nonExistentSrc = realPath.join(testDir, 'doesnotexist.zip');
      await expect(moveToHold(nonExistentSrc, 'doesnotexist.zip', confDir)).rejects.toThrow();
    });
  });

  describe('moveToLCFiles', () => {
    it('should move file to LCFILES directory', async () => {
      const result = await moveToLCFiles(srcFile, 'file.zip', confDir);

      const expectedPath = realPath.join(confDir, 'LCFILES', 'file.zip');
      expect(result).toBe(expectedPath);
      expect(realFs.existsSync(expectedPath)).toBe(true);
      expect(realFs.existsSync(srcFile)).toBe(false);
    });

    it('should create LCFILES directory if it does not exist', async () => {
      const lcfilesDir = realPath.join(confDir, 'LCFILES');
      expect(realFs.existsSync(lcfilesDir)).toBe(false);

      await moveToLCFiles(srcFile, 'file.zip', confDir);

      expect(realFs.existsSync(lcfilesDir)).toBe(true);
    });

    it('should log success message', async () => {
      await moveToLCFiles(srcFile, 'file.zip', confDir);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[LCFILES]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('file.zip'));
    });

    it('should handle rename errors', async () => {
      const nonExistentSrc = realPath.join(testDir, 'doesnotexist.zip');
      await expect(moveToLCFiles(nonExistentSrc, 'doesnotexist.zip', confDir)).rejects.toThrow();
    });

    it('should handle paths with special characters', async () => {
      const specialSrc = realPath.join(testDir, 'file [v1.0].zip');
      realFs.writeFileSync(specialSrc, 'test');

      const result = await moveToLCFiles(specialSrc, 'file [v1.0].zip', confDir);

      expect(result).toContain('file [v1.0].zip');
      expect(realFs.existsSync(result)).toBe(true);
    });
  });

  describe('getRootConferenceDir', () => {
    it('should return conference directory path', () => {
      const result = getRootConferenceDir(1, '/bbs');
      expect(result).toBe(realPath.join('/bbs', 'Conf1'));
    });

    it('should handle different conference IDs', () => {
      expect(getRootConferenceDir(5, '/bbs')).toBe(realPath.join('/bbs', 'Conf5'));
      expect(getRootConferenceDir(10, '/data')).toBe(realPath.join('/data', 'Conf10'));
    });

    it('should include correct conference name', () => {
      expect(getRootConferenceDir(1, '/bbs')).toContain('Conf1');
      expect(getRootConferenceDir(12, '/bbs')).toContain('Conf12');
    });
  });

  describe('getConferenceDir', () => {
    it('should delegate to getRootConferenceDir', () => {
      const result = getConferenceDir(1, '/bbs');
      expect(result).toBe(realPath.join('/bbs', 'Conf1'));
    });

    it('should handle different conference IDs', () => {
      expect(getConferenceDir(3, '/data')).toBe(realPath.join('/data', 'Conf3'));
    });
  });

  describe('getConferenceDirCandidates', () => {
    it('should return array with root conference directory', () => {
      const result = getConferenceDirCandidates(1, '/bbs');
      expect(result).toEqual([realPath.join('/bbs', 'Conf1')]);
    });

    it('should return single element array', () => {
      const result = getConferenceDirCandidates(5, '/data');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(realPath.join('/data', 'Conf5'));
    });
  });

  describe('getFileAreaDir', () => {
    it('should return absolute file area path', async () => {
      const { db } = require('../../src/database');
      db.query.mockResolvedValueOnce({ rows: [{ path: '/absolute/path/files' }] });

      const result = await getFileAreaDir(1, '/bbs');

      expect(result).toBe('/absolute/path/files');
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('SELECT path FROM file_areas'), [1]);
    });

    it('should return relative file area path joined with BBS path', async () => {
      const { db } = require('../../src/database');
      db.query.mockResolvedValueOnce({ rows: [{ path: 'Conf1/Files' }] });

      const result = await getFileAreaDir(1, '/bbs');

      expect(result).toBe(realPath.join('/bbs', 'Conf1/Files'));
    });

    it('should throw error when file area not found', async () => {
      const { db } = require('../../src/database');
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(getFileAreaDir(999, '/bbs')).rejects.toThrow('File area 999 not found');
    });

    it('should handle database query errors', async () => {
      const { db } = require('../../src/database');
      db.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(getFileAreaDir(1, '/bbs')).rejects.toThrow('Database error');
    });

    it('should correctly identify absolute paths', async () => {
      const { db } = require('../../src/database');
      db.query.mockResolvedValueOnce({ rows: [{ path: '/usr/local/bbs/files' }] });

      const result = await getFileAreaDir(1, '/bbs');

      expect(result).toBe('/usr/local/bbs/files'); // absolute stays absolute
    });

    it('should correctly handle relative paths', async () => {
      const { db } = require('../../src/database');
      db.query.mockResolvedValueOnce({ rows: [{ path: 'files/area1' }] });

      const result = await getFileAreaDir(1, '/bbs');

      expect(result).toBe(realPath.join('/bbs', 'files/area1'));
    });
  });

  describe('moveToFileArea', () => {
    it('should move file to file area directory', async () => {
      const { db } = require('../../src/database');
      const areaDir = realPath.join(testDir, 'area1');
      db.query.mockResolvedValueOnce({ rows: [{ path: areaDir }] });

      const result = await moveToFileArea(srcFile, 'file.zip', 1, testDir);

      expect(result).toBe(realPath.join(areaDir, 'file.zip'));
      expect(realFs.existsSync(realPath.join(areaDir, 'file.zip'))).toBe(true);
      expect(realFs.existsSync(srcFile)).toBe(false);
    });

    it('should create file area directory if it does not exist', async () => {
      const { db } = require('../../src/database');
      const areaDir = realPath.join(testDir, 'newarea');
      db.query.mockResolvedValueOnce({ rows: [{ path: areaDir }] });

      await moveToFileArea(srcFile, 'file.zip', 1, testDir);

      expect(realFs.existsSync(areaDir)).toBe(true);
    });

    it('should log success message', async () => {
      const { db } = require('../../src/database');
      const areaDir = realPath.join(testDir, 'area2');
      db.query.mockResolvedValueOnce({ rows: [{ path: areaDir }] });

      await moveToFileArea(srcFile, 'file.zip', 1, testDir);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[FileArea]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('file.zip'));
    });

    it('should handle rename errors (source not found)', async () => {
      const { db } = require('../../src/database');
      const areaDir = realPath.join(testDir, 'area3');
      db.query.mockResolvedValueOnce({ rows: [{ path: areaDir }] });

      const nonExistentSrc = realPath.join(testDir, 'doesnotexist.zip');
      await expect(moveToFileArea(nonExistentSrc, 'doesnotexist.zip', 1, testDir)).rejects.toThrow();
    });
  });

  describe('moveToFiles', () => {
    it('should move file to Files directory', async () => {
      const result = await moveToFiles(srcFile, 'file.zip', confDir);

      const expectedPath = realPath.join(confDir, 'Files', 'file.zip');
      expect(result).toBe(expectedPath);
      expect(realFs.existsSync(expectedPath)).toBe(true);
      expect(realFs.existsSync(srcFile)).toBe(false);
    });

    it('should create Files directory if it does not exist', async () => {
      const filesDir = realPath.join(confDir, 'Files');
      expect(realFs.existsSync(filesDir)).toBe(false);

      await moveToFiles(srcFile, 'file.zip', confDir);

      expect(realFs.existsSync(filesDir)).toBe(true);
    });

    it('should log success message', async () => {
      await moveToFiles(srcFile, 'file.zip', confDir);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Files]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('file.zip'));
    });

    it('should handle rename errors', async () => {
      const nonExistentSrc = realPath.join(testDir, 'doesnotexist.zip');
      await expect(moveToFiles(nonExistentSrc, 'doesnotexist.zip', confDir)).rejects.toThrow();
    });
  });

  describe('moveUploadedFile', () => {
    it('should move file to HOLD for "hold" status', async () => {
      const result = await moveUploadedFile(srcFile, 'file.zip', 'hold', 1, testDir);

      const expectedConf = realPath.join(testDir, 'Conf1');
      expect(result).toBe(realPath.join(expectedConf, 'HOLD', 'file.zip'));
      expect(realFs.existsSync(result)).toBe(true);
    });

    it('should move file to HOLD for "private" status', async () => {
      const result = await moveUploadedFile(srcFile, 'file.zip', 'private', 1, testDir);
      expect(result).toContain('HOLD');
      expect(realFs.existsSync(result)).toBe(true);
    });

    it('should move file to LCFILES for "lcfiles" status', async () => {
      const result = await moveUploadedFile(srcFile, 'file.zip', 'lcfiles', 1, testDir);
      expect(result).toContain('LCFILES');
      expect(realFs.existsSync(result)).toBe(true);
    });

    it('should move file to Files for "active" status', async () => {
      const result = await moveUploadedFile(srcFile, 'file.zip', 'active', 1, testDir);
      expect(result).toContain('Files');
      expect(realFs.existsSync(result)).toBe(true);
    });

    it('should use correct conference directory for different IDs', async () => {
      const conf5Dir = realPath.join(testDir, 'Conf5');
      realFs.mkdirSync(conf5Dir, { recursive: true });
      const result = await moveUploadedFile(srcFile, 'file.zip', 'active', 5, testDir);
      expect(result).toContain('Conf5');
    });
  });

  describe('Edge cases', () => {
    it('should handle filename with multiple dots', async () => {
      const multiDotSrc = realPath.join(testDir, 'file.tar.gz');
      realFs.writeFileSync(multiDotSrc, 'test');

      const result = await moveToFiles(multiDotSrc, 'file.tar.gz', confDir);

      expect(result).toContain('file.tar.gz');
      expect(realFs.existsSync(result)).toBe(true);
    });

    it('should handle very long filenames', async () => {
      const longName = 'a'.repeat(50) + '.zip';
      const longSrc = realPath.join(testDir, longName);
      realFs.writeFileSync(longSrc, 'test');

      const result = await moveToFiles(longSrc, longName, confDir);

      expect(result).toContain(longName);
      expect(realFs.existsSync(result)).toBe(true);
    });

    it('should handle negative count in HELD tracking gracefully', async () => {
      const holdDir = realPath.join(confDir, 'HOLD');
      realFs.mkdirSync(holdDir, { recursive: true });
      realFs.writeFileSync(realPath.join(holdDir, 'HELD'), '-5');

      await moveToHold(srcFile, 'file.zip', confDir);

      const count = realFs.readFileSync(realPath.join(holdDir, 'HELD'), 'utf8');
      expect(parseInt(count)).toBe(-4);
    });
  });
});
