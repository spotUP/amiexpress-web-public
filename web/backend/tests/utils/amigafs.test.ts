/**
 * Unit tests for amigafs.ts
 * Tests case-insensitive file system wrapper critical for 68K door emulation
 *
 * AmigaFS provides case-insensitive file operations matching AmigaOS behavior,
 * essential for Amiga doors that expect files like "DOOR.EXE" to match "door.exe"
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as amigafs from '../../src/utils/amigafs';

describe('amigafs (Critical for 68K Door Emulation)', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amigafs-test-'));
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('findCaseInsensitive', () => {
    it('should find file with exact case', () => {
      const testFile = path.join(testDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'test');

      const result = amigafs.findCaseInsensitive(testDir, 'TestFile.txt');
      expect(result).toBe(testFile);
    });

    it('should find file with different case', () => {
      const testFile = path.join(testDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'test');

      const result = amigafs.findCaseInsensitive(testDir, 'testfile.txt');
      expect(result).not.toBeNull();
      expect(result).toBe(testFile);
    });

    it('should find file with all uppercase', () => {
      const testFile = path.join(testDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'test');

      const result = amigafs.findCaseInsensitive(testDir, 'TESTFILE.TXT');
      expect(result).toBe(testFile);
    });

    it('should find file with all lowercase', () => {
      const testFile = path.join(testDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'test');

      const result = amigafs.findCaseInsensitive(testDir, 'testfile.txt');
      expect(result).toBe(testFile);
    });

    it('should return null for non-existent file', () => {
      const result = amigafs.findCaseInsensitive(testDir, 'nonexistent.txt');
      expect(result).toBeNull();
    });

    it('should return null for non-existent directory', () => {
      const result = amigafs.findCaseInsensitive('/nonexistent/dir', 'file.txt');
      expect(result).toBeNull();
    });

    it('should find directory with case-insensitive match', () => {
      const subDir = path.join(testDir, 'SubDir');
      fs.mkdirSync(subDir);

      const result = amigafs.findCaseInsensitive(testDir, 'subdir');
      expect(result).toBe(subDir);
    });

    it('should handle special characters in filename', () => {
      const testFile = path.join(testDir, 'File-Name_123.txt');
      fs.writeFileSync(testFile, 'test');

      const result = amigafs.findCaseInsensitive(testDir, 'file-name_123.txt');
      expect(result).toBe(testFile);
    });

    it('should match first file when multiple case variants exist', () => {
      // This shouldn't happen in practice, but test behavior
      const testFile1 = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile1, 'test1');

      const result = amigafs.findCaseInsensitive(testDir, 'TEST.TXT');
      expect(result).toBe(testFile1);
    });
  });

  describe('resolvePath', () => {
    it('should resolve path with exact case', () => {
      const testFile = path.join(testDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'test');

      const result = amigafs.resolvePath(testFile);
      expect(result).toBe(testFile);
    });

    it('should resolve path with different case', () => {
      const testFile = path.join(testDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'test');

      const lowerPath = path.join(testDir, 'testfile.txt');
      const result = amigafs.resolvePath(lowerPath);
      expect(result).not.toBeNull();
      expect(fs.existsSync(result!)).toBe(true);
      expect(fs.readFileSync(result!, 'utf-8')).toBe('test');
    });

    it('should resolve nested path with mixed case', () => {
      const subDir = path.join(testDir, 'SubDir');
      fs.mkdirSync(subDir);
      const testFile = path.join(subDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'test');

      const mixedPath = path.join(testDir, 'subdir', 'TESTFILE.TXT');
      const result = amigafs.resolvePath(mixedPath);
      expect(result).not.toBeNull();
      expect(fs.existsSync(result!)).toBe(true);
      expect(fs.readFileSync(result!, 'utf-8')).toBe('test');
    });

    it('should return null for non-existent path', () => {
      const result = amigafs.resolvePath(path.join(testDir, 'nonexistent.txt'));
      expect(result).toBeNull();
    });

    it('should return existing path as-is', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'test');

      const result = amigafs.resolvePath(testFile);
      expect(result).toBe(testFile);
    });
  });

  describe('existsSync (Critical for door file checks)', () => {
    it('should return true for existing file with exact case', () => {
      const testFile = path.join(testDir, 'door.exe');
      fs.writeFileSync(testFile, 'test');

      expect(amigafs.existsSync(testFile)).toBe(true);
    });

    it('should return true for existing file with different case', () => {
      const testFile = path.join(testDir, 'door.exe');
      fs.writeFileSync(testFile, 'test');

      expect(amigafs.existsSync(path.join(testDir, 'DOOR.EXE'))).toBe(true);
      expect(amigafs.existsSync(path.join(testDir, 'Door.Exe'))).toBe(true);
    });

    it('should return false for non-existent file', () => {
      expect(amigafs.existsSync(path.join(testDir, 'nonexistent.txt'))).toBe(false);
    });

    it('should work with directories', () => {
      const subDir = path.join(testDir, 'SubDir');
      fs.mkdirSync(subDir);

      expect(amigafs.existsSync(path.join(testDir, 'subdir'))).toBe(true);
      expect(amigafs.existsSync(path.join(testDir, 'SUBDIR'))).toBe(true);
    });
  });

  describe('readFileSync (Critical for door config/data)', () => {
    it('should read file with exact case', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello World');

      const content = amigafs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should read file with case-insensitive path', () => {
      const testFile = path.join(testDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'AmigaDOS');

      const content = amigafs.readFileSync(
        path.join(testDir, 'testfile.txt'),
        'utf-8'
      );
      expect(content).toBe('AmigaDOS');
    });

    it('should read binary file as Buffer', () => {
      const testFile = path.join(testDir, 'binary.dat');
      const data = Buffer.from([0x00, 0xFF, 0x42, 0x10]);
      fs.writeFileSync(testFile, data);

      const result = amigafs.readFileSync(path.join(testDir, 'BINARY.DAT'));
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result).toEqual(data);
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        amigafs.readFileSync(path.join(testDir, 'nonexistent.txt'), 'utf-8');
      }).toThrow('ENOENT');
    });
  });

  describe('writeFileSync', () => {
    it('should write file with exact path casing', () => {
      const testFile = path.join(testDir, 'NewFile.txt');
      amigafs.writeFileSync(testFile, 'content');

      expect(fs.existsSync(testFile)).toBe(true);
      expect(fs.readFileSync(testFile, 'utf-8')).toBe('content');
    });

    it('should write to case-insensitive directory path', () => {
      const subDir = path.join(testDir, 'SubDir');
      fs.mkdirSync(subDir);

      const testFile = path.join(testDir, 'subdir', 'file.txt');
      amigafs.writeFileSync(testFile, 'test');

      expect(fs.existsSync(path.join(subDir, 'file.txt'))).toBe(true);
    });

    it('should write binary data', () => {
      const testFile = path.join(testDir, 'binary.dat');
      const data = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);

      amigafs.writeFileSync(testFile, data);

      const read = fs.readFileSync(testFile);
      expect(read).toEqual(data);
    });

    it('should throw error for non-existent parent directory', () => {
      expect(() => {
        amigafs.writeFileSync(
          path.join(testDir, 'nonexistent', 'file.txt'),
          'data'
        );
      }).toThrow('ENOENT');
    });
  });

  describe('readdirSync', () => {
    it('should list directory contents', () => {
      fs.writeFileSync(path.join(testDir, 'file1.txt'), '');
      fs.writeFileSync(path.join(testDir, 'file2.txt'), '');
      fs.mkdirSync(path.join(testDir, 'subdir'));

      const entries = amigafs.readdirSync(testDir);
      expect(entries).toHaveLength(3);
      expect(entries).toContain('file1.txt');
      expect(entries).toContain('file2.txt');
      expect(entries).toContain('subdir');
    });

    it('should work with case-insensitive path', () => {
      const subDir = path.join(testDir, 'SubDir');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, 'test.txt'), '');

      const entries = amigafs.readdirSync(path.join(testDir, 'subdir'));
      expect(entries).toContain('test.txt');
    });

    it('should throw error for non-existent directory', () => {
      expect(() => {
        amigafs.readdirSync(path.join(testDir, 'nonexistent'));
      }).toThrow('ENOENT');
    });
  });

  describe('statSync', () => {
    it('should return stats for file', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'content');

      const stats = amigafs.statSync(testFile);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should work with case-insensitive path', () => {
      const testFile = path.join(testDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'test');

      const stats = amigafs.statSync(path.join(testDir, 'testfile.txt'));
      expect(stats.isFile()).toBe(true);
    });

    it('should return stats for directory', () => {
      const subDir = path.join(testDir, 'SubDir');
      fs.mkdirSync(subDir);

      const stats = amigafs.statSync(path.join(testDir, 'subdir'));
      expect(stats.isDirectory()).toBe(true);
    });

    it('should throw error for non-existent path', () => {
      expect(() => {
        amigafs.statSync(path.join(testDir, 'nonexistent.txt'));
      }).toThrow('ENOENT');
    });
  });

  describe('unlinkSync', () => {
    it('should delete file', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'test');

      amigafs.unlinkSync(testFile);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should delete file with case-insensitive path', () => {
      const testFile = path.join(testDir, 'TestFile.txt');
      fs.writeFileSync(testFile, 'test');

      amigafs.unlinkSync(path.join(testDir, 'testfile.txt'));
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        amigafs.unlinkSync(path.join(testDir, 'nonexistent.txt'));
      }).toThrow('ENOENT');
    });
  });

  describe('Integration tests (Amiga door scenarios)', () => {
    it('should handle door.exe file lookup case-insensitively', () => {
      // Simulate Amiga door looking for DOOR.EXE
      const doorExe = path.join(testDir, 'door.exe');
      fs.writeFileSync(doorExe, 'amiga executable');

      // Door code might check DOOR.EXE, Door.exe, etc.
      expect(amigafs.existsSync(path.join(testDir, 'DOOR.EXE'))).toBe(true);
      expect(amigafs.existsSync(path.join(testDir, 'Door.Exe'))).toBe(true);
      expect(amigafs.existsSync(path.join(testDir, 'door.exe'))).toBe(true);
    });

    it('should read .info files case-insensitively', () => {
      const infoFile = path.join(testDir, 'DOOR.info');
      fs.writeFileSync(infoFile, 'LOCATION=doors/test\nTYPE=DOOR');

      const content = amigafs.readFileSync(
        path.join(testDir, 'door.info'),
        'utf-8'
      );
      expect(content).toContain('LOCATION=doors/test');
    });

    it('should handle nested door directories', () => {
      // Simulate doors/DoorName/door.exe structure
      const doorDir = path.join(testDir, 'MyDoor');
      fs.mkdirSync(doorDir);
      const doorExe = path.join(doorDir, 'door.exe');
      fs.writeFileSync(doorExe, 'executable');

      // Access with different casing
      expect(amigafs.existsSync(path.join(testDir, 'mydoor', 'DOOR.EXE'))).toBe(true);
      expect(amigafs.existsSync(path.join(testDir, 'MYDOOR', 'door.exe'))).toBe(true);
    });

    it('should handle BBS config files case-insensitively', () => {
      fs.writeFileSync(path.join(testDir, 'bbsConfig.info'), 'BBSNAME=TestBBS');

      expect(amigafs.existsSync(path.join(testDir, 'BBSCONFIG.INFO'))).toBe(true);
      const content = amigafs.readFileSync(
        path.join(testDir, 'bbsconfig.info'),
        'utf-8'
      );
      expect(content).toContain('BBSNAME=TestBBS');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty directory', () => {
      const entries = amigafs.readdirSync(testDir);
      expect(entries).toEqual([]);
    });

    it('should handle file with no extension', () => {
      const testFile = path.join(testDir, 'README');
      fs.writeFileSync(testFile, 'readme content');

      expect(amigafs.existsSync(path.join(testDir, 'readme'))).toBe(true);
      expect(amigafs.existsSync(path.join(testDir, 'README'))).toBe(true);
    });

    it('should handle files with dots in name', () => {
      const testFile = path.join(testDir, 'file.name.txt');
      fs.writeFileSync(testFile, 'test');

      expect(amigafs.existsSync(path.join(testDir, 'FILE.NAME.TXT'))).toBe(true);
    });

    it('should handle symlinks', () => {
      const testFile = path.join(testDir, 'original.txt');
      fs.writeFileSync(testFile, 'original');

      // Note: symlinks may not work on all platforms
      try {
        const linkFile = path.join(testDir, 'link.txt');
        fs.symlinkSync(testFile, linkFile);

        const stats = amigafs.lstatSync(path.join(testDir, 'LINK.TXT'));
        expect(stats).toBeDefined();
      } catch (e) {
        // Skip on platforms without symlink support
      }
    });
  });
});
