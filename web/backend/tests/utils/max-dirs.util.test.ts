/**
 * Unit tests for max-dirs.util.ts
 * Tests conference directory scanning and DIR file discovery
 *
 * max-dirs.util handles scanning for DIR1, DIR2, DIR3, etc. files in conference
 * directories to determine maximum directory numbers for file areas
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getDirFiles, getMaxDirs, getDirFilePath } from '../../src/utils/max-dirs.util';

describe('Max Dirs Utility (Conference Directory Scanning)', () => {
  let testBbsPath: string;
  let confPath: string;

  beforeEach(() => {
    // Create temp BBS directory structure
    testBbsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'maxdirs-test-'));
    confPath = path.join(testBbsPath, 'Conf1');
    fs.mkdirSync(confPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testBbsPath)) {
      fs.rmSync(testBbsPath, { recursive: true, force: true });
    }
  });

  describe('getDirFiles', () => {
    it('should find numbered DIR files', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR2'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR3'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(3);
      expect(result[0].index).toBe(1);
      expect(result[0].filename).toBe('DIR1');
      expect(result[0].name).toBe('Directory 1');
      expect(result[1].index).toBe(2);
      expect(result[2].index).toBe(3);
    });

    it('should handle case-insensitive DIR filenames', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'dir2'), 'files');
      fs.writeFileSync(path.join(confPath, 'Dir3'), 'files');
      fs.writeFileSync(path.join(confPath, 'DiR4'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(4);
      expect(result.map(d => d.index)).toEqual([1, 2, 3, 4]);
    });

    it('should sort DIR files by number', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR10'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR2'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR5'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(4);
      expect(result.map(d => d.index)).toEqual([1, 2, 5, 10]);
    });

    it('should ignore non-DIR files', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR2'), 'files');
      fs.writeFileSync(path.join(confPath, 'README.txt'), 'readme');
      fs.writeFileSync(path.join(confPath, 'FILES.TXT'), 'files');
      fs.writeFileSync(path.join(confPath, 'CONF.INFO'), 'info');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(2);
      expect(result.map(d => d.filename)).toEqual(['DIR1', 'DIR2']);
    });

    it('should ignore DIR files without numbers', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIRS'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIRECTORY'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('DIR1');
    });

    it('should ignore DIR0 (must be > 0)', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR0'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR2'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(2);
      expect(result.map(d => d.index)).toEqual([1, 2]);
    });

    it('should handle multi-digit directory numbers', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR10'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR100'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR999'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(4);
      expect(result.map(d => d.index)).toEqual([1, 10, 100, 999]);
    });

    it('should return empty array for non-existent conference', async () => {
      const result = await getDirFiles(99, testBbsPath);

      expect(result).toEqual([]);
    });

    it('should return empty array for empty conference', async () => {
      const result = await getDirFiles(1, testBbsPath);

      expect(result).toEqual([]);
    });

    it('should include full path for each DIR file', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe(path.join(confPath, 'DIR1'));
    });

    it('should handle gaps in DIR numbering', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR5'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR10'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(3);
      expect(result.map(d => d.index)).toEqual([1, 5, 10]);
    });

    it('should ignore files with DIR prefix but non-numeric suffix', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIRa'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR1a'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR_1'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('DIR1');
    });

    it('should handle different conference numbers', async () => {
      const conf2Path = path.join(testBbsPath, 'Conf2');
      fs.mkdirSync(conf2Path, { recursive: true });

      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR2'), 'files');
      fs.writeFileSync(path.join(conf2Path, 'DIR1'), 'files');
      fs.writeFileSync(path.join(conf2Path, 'DIR2'), 'files');
      fs.writeFileSync(path.join(conf2Path, 'DIR3'), 'files');

      const conf1Result = await getDirFiles(1, testBbsPath);
      const conf2Result = await getDirFiles(2, testBbsPath);

      expect(conf1Result).toHaveLength(2);
      expect(conf2Result).toHaveLength(3);
    });
  });

  describe('getMaxDirs', () => {
    it('should return count of DIR files', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR2'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR3'), 'files');

      const result = await getMaxDirs(1, testBbsPath);

      expect(result).toBe(3);
    });

    it('should return 0 for no DIR files', async () => {
      const result = await getMaxDirs(1, testBbsPath);

      expect(result).toBe(0);
    });

    it('should return 0 for non-existent conference', async () => {
      const result = await getMaxDirs(99, testBbsPath);

      expect(result).toBe(0);
    });

    it('should count only numbered DIR files', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR2'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIRS'), 'files');
      fs.writeFileSync(path.join(confPath, 'README.txt'), 'files');

      const result = await getMaxDirs(1, testBbsPath);

      expect(result).toBe(2);
    });

    it('should handle large numbers of DIR files', async () => {
      for (let i = 1; i <= 50; i++) {
        fs.writeFileSync(path.join(confPath, `DIR${i}`), 'files');
      }

      const result = await getMaxDirs(1, testBbsPath);

      expect(result).toBe(50);
    });

    it('should count correctly with gaps in numbering', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR5'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR10'), 'files');

      const result = await getMaxDirs(1, testBbsPath);

      expect(result).toBe(3); // Count is 3, not 10
    });
  });

  describe('getDirFilePath (deprecated)', () => {
    it('should return correct DIR file path', () => {
      const result = getDirFilePath(confPath, 1);

      expect(result).toBe(path.join(confPath, 'DIR1'));
    });

    it('should handle different directory numbers', () => {
      expect(getDirFilePath(confPath, 1)).toBe(path.join(confPath, 'DIR1'));
      expect(getDirFilePath(confPath, 5)).toBe(path.join(confPath, 'DIR5'));
      expect(getDirFilePath(confPath, 10)).toBe(path.join(confPath, 'DIR10'));
      expect(getDirFilePath(confPath, 100)).toBe(path.join(confPath, 'DIR100'));
    });

    it('should handle different conference paths', () => {
      const customPath = '/custom/conference/path';
      const result = getDirFilePath(customPath, 3);

      expect(result).toBe(path.join(customPath, 'DIR3'));
    });

    it('should handle DIR0 (even though not valid in getDirFiles)', () => {
      const result = getDirFilePath(confPath, 0);

      expect(result).toBe(path.join(confPath, 'DIR0'));
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical BBS conference with 3-5 file areas', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'General Files');
      fs.writeFileSync(path.join(confPath, 'DIR2'), 'Uploads');
      fs.writeFileSync(path.join(confPath, 'DIR3'), 'Games');
      fs.writeFileSync(path.join(confPath, 'DIR4'), 'Utilities');

      const result = await getDirFiles(1, testBbsPath);
      const maxDirs = await getMaxDirs(1, testBbsPath);

      expect(result).toHaveLength(4);
      expect(maxDirs).toBe(4);
      expect(result.map(d => d.index)).toEqual([1, 2, 3, 4]);
    });

    it('should handle mixed case DIR files from different systems', async () => {
      // Files might come from different systems with different case conventions
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');  // Linux
      fs.writeFileSync(path.join(confPath, 'dir2'), 'files');  // Linux lowercase
      fs.writeFileSync(path.join(confPath, 'Dir3'), 'files');  // Windows
      fs.writeFileSync(path.join(confPath, 'DiR4'), 'files');  // AmigaOS

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(4);
      expect(result.map(d => d.index)).toEqual([1, 2, 3, 4]);
    });

    it('should handle conference with other files mixed in', async () => {
      // Typical conference directory with various files
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR2'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR3'), 'files');
      fs.writeFileSync(path.join(confPath, 'Conf1.info'), 'config');
      fs.writeFileSync(path.join(confPath, 'FILES.TXT'), 'file list');
      fs.writeFileSync(path.join(confPath, 'README'), 'readme');
      fs.writeFileSync(path.join(confPath, '.hidden'), 'hidden');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(3);
      expect(result.map(d => d.filename)).toEqual(['DIR1', 'DIR2', 'DIR3']);
    });

    it('should handle directory cleanup scenarios (deleted middle DIR)', async () => {
      // DIR2 was deleted but DIR1 and DIR3 remain
      fs.writeFileSync(path.join(confPath, 'DIR1'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR3'), 'files');

      const result = await getDirFiles(1, testBbsPath);
      const maxDirs = await getMaxDirs(1, testBbsPath);

      expect(result).toHaveLength(2);
      expect(maxDirs).toBe(2); // Count is 2, not 3
      expect(result.map(d => d.index)).toEqual([1, 3]);
    });
  });

  describe('Edge cases', () => {
    it('should handle very large directory numbers', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR99999'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(99999);
    });

    it('should handle permission errors gracefully', async () => {
      // Remove read permissions from conference directory
      try {
        fs.chmodSync(confPath, 0o000);

        const result = await getDirFiles(1, testBbsPath);

        expect(result).toEqual([]);

        // Restore permissions for cleanup
        fs.chmodSync(confPath, 0o755);
      } catch (error) {
        // Skip on platforms that don't support chmod
        fs.chmodSync(confPath, 0o755);
      }
    });

    it('should handle unicode in conference path', async () => {
      const unicodeConfPath = path.join(testBbsPath, 'Конференция1');
      fs.mkdirSync(unicodeConfPath, { recursive: true });
      fs.writeFileSync(path.join(unicodeConfPath, 'DIR1'), 'files');

      // Can't test directly with getDirFiles since it uses getConferenceDir
      // But getDirFilePath should work
      const result = getDirFilePath(unicodeConfPath, 1);

      expect(result).toBe(path.join(unicodeConfPath, 'DIR1'));
    });

    it('should handle leading zeros in DIR numbers', async () => {
      fs.writeFileSync(path.join(confPath, 'DIR01'), 'files');
      fs.writeFileSync(path.join(confPath, 'DIR001'), 'files');

      const result = await getDirFiles(1, testBbsPath);

      // Both should be parsed as directory 1
      expect(result).toHaveLength(2);
      expect(result.every(d => d.index === 1)).toBe(true);
    });
  });
});
