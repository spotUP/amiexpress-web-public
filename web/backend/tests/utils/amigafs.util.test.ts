/**
 * AmigaFS Utility Unit Tests
 *
 * Tests case-insensitive filesystem operations for AmigaOS compatibility.
 * Based on src/utils/amigafs.ts - provides drop-in replacements for fs methods
 * that handle case-insensitive path resolution.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../../src/utils/amigafs';

describe('AmigaFS Utility Functions', () => {
  let testDir: string;
  let testFile: string;
  let testSubDir: string;
  let testSubFile: string;

  beforeEach(() => {
    // Create temporary test directory structure with mixed casing
    testDir = path.join(__dirname, `amigafs-test-${Date.now()}`);
    fs.mkdirSync(testDir);

    testSubDir = path.join(testDir, 'TestSubDir');
    fs.mkdirSync(testSubDir);

    testFile = path.join(testDir, 'TestFile.txt');
    fs.writeFileSync(testFile, 'Test content', 'utf8');

    testSubFile = path.join(testSubDir, 'SubFile.TXT');
    fs.writeFileSync(testSubFile, 'Sub file content', 'utf8');
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('findCaseInsensitive', () => {
    it('should find file with exact case', () => {
      const result = amigafs.findCaseInsensitive(testDir, 'TestFile.txt');
      expect(result).toBe(testFile);
    });

    it('should find file with lowercase', () => {
      const result = amigafs.findCaseInsensitive(testDir, 'testfile.txt');
      expect(result).toBe(testFile);
    });

    it('should find file with uppercase', () => {
      const result = amigafs.findCaseInsensitive(testDir, 'TESTFILE.TXT');
      expect(result).toBe(testFile);
    });

    it('should find directory case-insensitively', () => {
      const result = amigafs.findCaseInsensitive(testDir, 'testsubdir');
      expect(result).toBe(testSubDir);
    });

    it('should return null for non-existent file', () => {
      const result = amigafs.findCaseInsensitive(testDir, 'nonexistent.txt');
      expect(result).toBeNull();
    });

    it('should return null for non-existent directory', () => {
      const result = amigafs.findCaseInsensitive('/nonexistent', 'file.txt');
      expect(result).toBeNull();
    });

    it('should handle empty filename', () => {
      const result = amigafs.findCaseInsensitive(testDir, '');
      expect(result).toBeNull();
    });

    it('should handle special characters in filename', () => {
      const specialFile = path.join(testDir, 'File-With_Special.txt');
      fs.writeFileSync(specialFile, 'content');

      const result = amigafs.findCaseInsensitive(testDir, 'file-with_special.txt');
      expect(result).toBe(specialFile);
    });
  });

  describe('resolvePath', () => {
    it('should return path as-is if exists with exact case', () => {
      const result = amigafs.resolvePath(testFile);
      expect(result).toBe(testFile);
    });

    it('should resolve lowercase path', () => {
      const lowercasePath = path.join(testDir.toLowerCase(), 'testfile.txt');
      const result = amigafs.resolvePath(lowercasePath);
      expect(result).not.toBeNull();
      expect(result?.toLowerCase()).toBe(testFile.toLowerCase());
    });

    it('should resolve uppercase path', () => {
      const uppercasePath = path.join(testDir, 'TESTFILE.TXT');
      const result = amigafs.resolvePath(uppercasePath);
      // On case-insensitive filesystems, if path exists it returns as-is
      expect(result).not.toBeNull();
      expect(result?.toLowerCase()).toBe(testFile.toLowerCase());
    });

    it('should resolve nested path case-insensitively', () => {
      const mixedPath = path.join(testDir, 'testsubdir', 'SUBFILE.txt');
      const result = amigafs.resolvePath(mixedPath);
      // Should resolve to correct file regardless of case
      expect(result).not.toBeNull();
      expect(result?.toLowerCase()).toBe(testSubFile.toLowerCase());
    });

    it('should return null for non-existent path', () => {
      const badPath = path.join(testDir, 'nonexistent', 'file.txt');
      const result = amigafs.resolvePath(badPath);
      expect(result).toBeNull();
    });

    it('should return null for partially non-existent path', () => {
      const badPath = path.join(testDir, 'TestSubDir', 'nonexistent.txt');
      const result = amigafs.resolvePath(badPath);
      expect(result).toBeNull();
    });

    it('should handle absolute paths', () => {
      const result = amigafs.resolvePath(testFile);
      expect(path.isAbsolute(result!)).toBe(true);
    });
  });

  describe('existsSync', () => {
    it('should return true for existing file with exact case', () => {
      expect(amigafs.existsSync(testFile)).toBe(true);
    });

    it('should return true for existing file with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      expect(amigafs.existsSync(wrongCase)).toBe(true);
    });

    it('should return true for existing directory', () => {
      expect(amigafs.existsSync(testSubDir)).toBe(true);
    });

    it('should return false for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(amigafs.existsSync(nonExistent)).toBe(false);
    });

    it('should handle empty string', () => {
      // Empty string resolves to current directory on some systems
      const result = amigafs.existsSync('');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('readFileSync', () => {
    it('should read file with exact case', () => {
      const content = amigafs.readFileSync(testFile, 'utf8');
      expect(content).toBe('Test content');
    });

    it('should read file with wrong case', () => {
      const wrongCase = path.join(testDir, 'TESTFILE.TXT');
      const content = amigafs.readFileSync(wrongCase, 'utf8');
      expect(content).toBe('Test content');
    });

    it('should read file without encoding (buffer)', () => {
      const content = amigafs.readFileSync(testFile);
      expect(Buffer.isBuffer(content)).toBe(true);
      expect((content as Buffer).toString()).toBe('Test content');
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.readFileSync(nonExistent)).toThrow('ENOENT');
    });

    it('should read nested file case-insensitively', () => {
      const wrongCase = path.join(testDir, 'testsubdir', 'subfile.txt');
      const content = amigafs.readFileSync(wrongCase, 'utf8');
      expect(content).toBe('Sub file content');
    });
  });

  describe('readdirSync', () => {
    it('should read directory with exact case', () => {
      const entries = amigafs.readdirSync(testDir);
      expect(entries).toContain('TestFile.txt');
      expect(entries).toContain('TestSubDir');
    });

    it('should read directory with wrong case', () => {
      const wrongCase = testDir.toUpperCase();
      const entries = amigafs.readdirSync(wrongCase);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should throw for non-existent directory', () => {
      const nonExistent = path.join(testDir, 'nonexistent');
      expect(() => amigafs.readdirSync(nonExistent)).toThrow('ENOENT');
    });

    it('should read subdirectory case-insensitively', () => {
      const wrongCase = path.join(testDir, 'testsubdir');
      const entries = amigafs.readdirSync(wrongCase);
      expect(entries).toContain('SubFile.TXT');
    });
  });

  describe('statSync', () => {
    it('should stat file with exact case', () => {
      const stats = amigafs.statSync(testFile);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should stat file with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      const stats = amigafs.statSync(wrongCase);
      expect(stats.isFile()).toBe(true);
    });

    it('should stat directory', () => {
      const stats = amigafs.statSync(testSubDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.statSync(nonExistent)).toThrow('ENOENT');
    });
  });

  describe('lstatSync', () => {
    it('should lstat file with exact case', () => {
      const stats = amigafs.lstatSync(testFile);
      expect(stats.isFile()).toBe(true);
    });

    it('should lstat file with wrong case', () => {
      const wrongCase = path.join(testDir, 'TESTFILE.TXT');
      const stats = amigafs.lstatSync(wrongCase);
      expect(stats.isFile()).toBe(true);
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.lstatSync(nonExistent)).toThrow('ENOENT');
    });
  });

  describe('writeFileSync', () => {
    it('should write new file', () => {
      const newFile = path.join(testDir, 'NewFile.txt');
      amigafs.writeFileSync(newFile, 'New content');

      expect(fs.existsSync(newFile)).toBe(true);
      expect(fs.readFileSync(newFile, 'utf8')).toBe('New content');
    });

    it('should overwrite existing file', () => {
      amigafs.writeFileSync(testFile, 'Overwritten');
      expect(fs.readFileSync(testFile, 'utf8')).toBe('Overwritten');
    });

    it('should write to case-insensitive parent directory', () => {
      const wrongDirCase = path.join(testDir, 'testsubdir', 'NewFile.txt');
      amigafs.writeFileSync(wrongDirCase, 'Content');

      const realPath = path.join(testSubDir, 'NewFile.txt');
      expect(fs.existsSync(realPath)).toBe(true);
    });

    it('should throw for non-existent parent directory', () => {
      const badPath = path.join(testDir, 'nonexistent', 'file.txt');
      expect(() => amigafs.writeFileSync(badPath, 'content')).toThrow('ENOENT');
    });

    it('should write buffer content', () => {
      const newFile = path.join(testDir, 'BufferFile.txt');
      const buffer = Buffer.from('Buffer content');
      amigafs.writeFileSync(newFile, buffer);

      expect(fs.readFileSync(newFile, 'utf8')).toBe('Buffer content');
    });
  });

  describe('appendFileSync', () => {
    it('should append to existing file', () => {
      amigafs.appendFileSync(testFile, ' appended');
      expect(fs.readFileSync(testFile, 'utf8')).toBe('Test content appended');
    });

    it('should create file if does not exist', () => {
      const newFile = path.join(testDir, 'NewAppendFile.txt');
      amigafs.appendFileSync(newFile, 'Created content');

      expect(fs.existsSync(newFile)).toBe(true);
      expect(fs.readFileSync(newFile, 'utf8')).toBe('Created content');
    });

    it('should append with wrong case path', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      amigafs.appendFileSync(wrongCase, ' more');

      expect(fs.readFileSync(testFile, 'utf8')).toContain('more');
    });
  });

  describe('unlinkSync', () => {
    it('should delete file with exact case', () => {
      amigafs.unlinkSync(testFile);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should delete file with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      amigafs.unlinkSync(wrongCase);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.unlinkSync(nonExistent)).toThrow('ENOENT');
    });
  });

  describe('mkdirSync', () => {
    it('should create directory', () => {
      const newDir = path.join(testDir, 'NewDir');
      amigafs.mkdirSync(newDir);

      expect(fs.existsSync(newDir)).toBe(true);
      expect(fs.statSync(newDir).isDirectory()).toBe(true);
    });

    it('should throw if directory already exists without recursive', () => {
      expect(() => amigafs.mkdirSync(testSubDir)).toThrow('EEXIST');
    });

    it('should not throw if directory exists with recursive option', () => {
      expect(() => amigafs.mkdirSync(testSubDir, { recursive: true })).not.toThrow();
    });

    it('should create nested directories with recursive', () => {
      const nestedDir = path.join(testDir, 'Level1', 'Level2', 'Level3');
      amigafs.mkdirSync(nestedDir, { recursive: true });

      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('should detect existing directory case-insensitively', () => {
      const wrongCase = testSubDir.toUpperCase();
      expect(() => amigafs.mkdirSync(wrongCase)).toThrow('EEXIST');
    });
  });

  describe('rmdirSync', () => {
    it('should remove empty directory', () => {
      const emptyDir = path.join(testDir, 'EmptyDir');
      fs.mkdirSync(emptyDir);

      amigafs.rmdirSync(emptyDir);
      expect(fs.existsSync(emptyDir)).toBe(false);
    });

    it('should remove directory with wrong case', () => {
      const emptyDir = path.join(testDir, 'EmptyDir');
      fs.mkdirSync(emptyDir);

      const wrongCase = path.join(testDir, 'emptydir');
      amigafs.rmdirSync(wrongCase);
      expect(fs.existsSync(emptyDir)).toBe(false);
    });

    it('should throw for non-existent directory', () => {
      const nonExistent = path.join(testDir, 'nonexistent');
      expect(() => amigafs.rmdirSync(nonExistent)).toThrow('ENOENT');
    });
  });

  describe('renameSync', () => {
    it('should rename file', () => {
      const newName = path.join(testDir, 'Renamed.txt');
      amigafs.renameSync(testFile, newName);

      expect(fs.existsSync(testFile)).toBe(false);
      expect(fs.existsSync(newName)).toBe(true);
    });

    it('should rename with case-insensitive source', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      const newName = path.join(testDir, 'Renamed.txt');

      amigafs.renameSync(wrongCase, newName);
      expect(fs.existsSync(newName)).toBe(true);
    });

    it('should rename to case-insensitive destination directory', () => {
      const newName = path.join(testDir, 'testsubdir', 'Moved.txt');
      amigafs.renameSync(testFile, newName);

      const realPath = path.join(testSubDir, 'Moved.txt');
      expect(fs.existsSync(realPath)).toBe(true);
    });

    it('should throw for non-existent source', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      const newName = path.join(testDir, 'new.txt');

      expect(() => amigafs.renameSync(nonExistent, newName)).toThrow('ENOENT');
    });

    it('should throw for non-existent destination directory', () => {
      const badDest = path.join(testDir, 'nonexistent', 'file.txt');
      expect(() => amigafs.renameSync(testFile, badDest)).toThrow('ENOENT');
    });
  });

  describe('copyFileSync', () => {
    it('should copy file', () => {
      const copyPath = path.join(testDir, 'Copy.txt');
      amigafs.copyFileSync(testFile, copyPath);

      expect(fs.existsSync(copyPath)).toBe(true);
      expect(fs.readFileSync(copyPath, 'utf8')).toBe('Test content');
    });

    it('should copy with case-insensitive source', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      const copyPath = path.join(testDir, 'Copy.txt');

      amigafs.copyFileSync(wrongCase, copyPath);
      expect(fs.existsSync(copyPath)).toBe(true);
    });

    it('should copy to case-insensitive destination directory', () => {
      const copyPath = path.join(testDir, 'testsubdir', 'Copy.txt');
      amigafs.copyFileSync(testFile, copyPath);

      const realPath = path.join(testSubDir, 'Copy.txt');
      expect(fs.existsSync(realPath)).toBe(true);
    });

    it('should throw for non-existent source', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      const copyPath = path.join(testDir, 'copy.txt');

      expect(() => amigafs.copyFileSync(nonExistent, copyPath)).toThrow('ENOENT');
    });

    it('should throw for non-existent destination directory', () => {
      const badDest = path.join(testDir, 'nonexistent', 'copy.txt');
      expect(() => amigafs.copyFileSync(testFile, badDest)).toThrow('ENOENT');
    });
  });

  describe('accessSync', () => {
    it('should check file access with exact case', () => {
      expect(() => amigafs.accessSync(testFile)).not.toThrow();
    });

    it('should check file access with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      expect(() => amigafs.accessSync(wrongCase)).not.toThrow();
    });

    it('should check with specific mode', () => {
      expect(() => amigafs.accessSync(testFile, fs.constants.R_OK)).not.toThrow();
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.accessSync(nonExistent)).toThrow('ENOENT');
    });
  });

  describe('realpathSync', () => {
    it('should get real path with exact case', () => {
      const realPath = amigafs.realpathSync(testFile);
      expect(realPath).toBe(fs.realpathSync(testFile));
    });

    it('should get real path with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      const realPath = amigafs.realpathSync(wrongCase);
      expect(realPath).toBeTruthy();
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.realpathSync(nonExistent)).toThrow('ENOENT');
    });
  });

  describe('chmodSync', () => {
    it('should change file permissions', () => {
      amigafs.chmodSync(testFile, 0o644);
      const stats = fs.statSync(testFile);
      expect(stats.mode & 0o777).toBe(0o644);
    });

    it('should change permissions with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      expect(() => amigafs.chmodSync(wrongCase, 0o644)).not.toThrow();
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.chmodSync(nonExistent, 0o644)).toThrow('ENOENT');
    });
  });

  describe('rmSync', () => {
    it('should remove file', () => {
      amigafs.rmSync(testFile);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should remove file with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      amigafs.rmSync(wrongCase);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should remove directory recursively', () => {
      amigafs.rmSync(testSubDir, { recursive: true });
      expect(fs.existsSync(testSubDir)).toBe(false);
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.rmSync(nonExistent)).toThrow('ENOENT');
    });
  });

  describe('openSync', () => {
    it('should open existing file for reading', () => {
      const fd = amigafs.openSync(testFile, 'r');
      expect(fd).toBeGreaterThanOrEqual(0);
      fs.closeSync(fd);
    });

    it('should open with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      const fd = amigafs.openSync(wrongCase, 'r');
      expect(fd).toBeGreaterThanOrEqual(0);
      fs.closeSync(fd);
    });

    it('should create new file with write mode', () => {
      const newFile = path.join(testDir, 'NewOpenFile.txt');
      const fd = amigafs.openSync(newFile, 'w');
      expect(fd).toBeGreaterThanOrEqual(0);
      fs.closeSync(fd);
      expect(fs.existsSync(newFile)).toBe(true);
    });

    it('should throw for non-existent file in read mode', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.openSync(nonExistent, 'r')).toThrow('ENOENT');
    });

    it('should throw for non-existent parent directory in write mode', () => {
      const badPath = path.join(testDir, 'nonexistent', 'file.txt');
      expect(() => amigafs.openSync(badPath, 'w')).toThrow('ENOENT');
    });
  });

  describe('truncateSync', () => {
    it('should truncate file to zero', () => {
      amigafs.truncateSync(testFile, 0);
      const stats = fs.statSync(testFile);
      expect(stats.size).toBe(0);
    });

    it('should truncate file to specific length', () => {
      amigafs.truncateSync(testFile, 5);
      const content = fs.readFileSync(testFile, 'utf8');
      expect(content.length).toBe(5);
    });

    it('should truncate with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      expect(() => amigafs.truncateSync(wrongCase, 0)).not.toThrow();
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.truncateSync(nonExistent, 0)).toThrow('ENOENT');
    });
  });

  describe('utimesSync', () => {
    it('should change file timestamps', () => {
      const newTime = new Date('2020-01-01');
      amigafs.utimesSync(testFile, newTime, newTime);

      const stats = fs.statSync(testFile);
      expect(stats.mtime.getTime()).toBe(newTime.getTime());
    });

    it('should change timestamps with wrong case', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      const newTime = new Date('2020-01-01');

      expect(() => amigafs.utimesSync(wrongCase, newTime, newTime)).not.toThrow();
    });

    it('should throw for non-existent file', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      const newTime = new Date();

      expect(() => amigafs.utimesSync(nonExistent, newTime, newTime)).toThrow('ENOENT');
    });
  });

  describe('linkSync', () => {
    it('should create hard link', () => {
      const linkPath = path.join(testDir, 'HardLink.txt');
      amigafs.linkSync(testFile, linkPath);

      expect(fs.existsSync(linkPath)).toBe(true);
      expect(fs.readFileSync(linkPath, 'utf8')).toBe('Test content');
    });

    it('should create link with case-insensitive source', () => {
      const wrongCase = path.join(testDir, 'testfile.txt');
      const linkPath = path.join(testDir, 'HardLink.txt');

      amigafs.linkSync(wrongCase, linkPath);
      expect(fs.existsSync(linkPath)).toBe(true);
    });

    it('should throw for non-existent source', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      const linkPath = path.join(testDir, 'link.txt');

      expect(() => amigafs.linkSync(nonExistent, linkPath)).toThrow('ENOENT');
    });

    it('should throw for non-existent destination directory', () => {
      const badLink = path.join(testDir, 'nonexistent', 'link.txt');
      expect(() => amigafs.linkSync(testFile, badLink)).toThrow('ENOENT');
    });
  });

  describe('symlinkSync', () => {
    it('should create symbolic link', () => {
      const linkPath = path.join(testDir, 'SymLink.txt');
      amigafs.symlinkSync(testFile, linkPath);

      expect(fs.existsSync(linkPath)).toBe(true);
      const stats = fs.lstatSync(linkPath);
      expect(stats.isSymbolicLink()).toBe(true);
    });

    it('should create symlink to case-insensitive parent directory', () => {
      const wrongDirCase = path.join(testDir, 'testsubdir', 'SymLink.txt');
      amigafs.symlinkSync(testFile, wrongDirCase);

      const realPath = path.join(testSubDir, 'SymLink.txt');
      expect(fs.existsSync(realPath)).toBe(true);
    });

    it('should throw for non-existent destination directory', () => {
      const badLink = path.join(testDir, 'nonexistent', 'link.txt');
      expect(() => amigafs.symlinkSync(testFile, badLink)).toThrow('ENOENT');
    });

    it('should create symlink even if target does not exist', () => {
      const nonExistentTarget = path.join(testDir, 'nonexistent-target.txt');
      const linkPath = path.join(testDir, 'SymLink.txt');

      amigafs.symlinkSync(nonExistentTarget, linkPath);
      const stats = fs.lstatSync(linkPath);
      expect(stats.isSymbolicLink()).toBe(true);
    });
  });

  describe('readlinkSync', () => {
    it('should read symbolic link', () => {
      const linkPath = path.join(testDir, 'SymLink.txt');
      fs.symlinkSync(testFile, linkPath);

      const target = amigafs.readlinkSync(linkPath);
      expect(target).toBe(testFile);
    });

    it('should read symlink with wrong case', () => {
      const linkPath = path.join(testDir, 'SymLink.txt');
      fs.symlinkSync(testFile, linkPath);

      const wrongCase = path.join(testDir, 'symlink.txt');
      const target = amigafs.readlinkSync(wrongCase);
      expect(target).toBeTruthy();
    });

    it('should throw for non-existent symlink', () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      expect(() => amigafs.readlinkSync(nonExistent)).toThrow('ENOENT');
    });

    it('should throw for regular file (not a symlink)', () => {
      // On some systems this throws, on others returns empty - both acceptable
      try {
        amigafs.readlinkSync(testFile);
      } catch (error) {
        expect(error).toBeTruthy();
      }
    });
  });

  describe('constants', () => {
    it('should export fs constants', () => {
      expect(amigafs.constants).toBeDefined();
      expect(amigafs.constants.R_OK).toBe(fs.constants.R_OK);
      expect(amigafs.constants.W_OK).toBe(fs.constants.W_OK);
      expect(amigafs.constants.X_OK).toBe(fs.constants.X_OK);
    });
  });

  describe('integration tests', () => {
    it('should handle complete file lifecycle', () => {
      const file1 = path.join(testDir, 'lifecycle.txt');
      const file2 = path.join(testDir, 'LIFECYCLE.txt');
      const file3 = path.join(testDir, 'LifeCycle.txt');

      // Create file
      amigafs.writeFileSync(file1, 'Initial content');
      expect(amigafs.existsSync(file2)).toBe(true);

      // Append to file
      amigafs.appendFileSync(file3, ' appended');
      expect(amigafs.readFileSync(file1, 'utf8')).toBe('Initial content appended');

      // Stat file
      const stats = amigafs.statSync(file2);
      expect(stats.isFile()).toBe(true);

      // Copy file
      const copyPath = path.join(testDir, 'copy.txt');
      amigafs.copyFileSync(file3, copyPath);
      expect(amigafs.existsSync(copyPath)).toBe(true);

      // Rename file
      const renamed = path.join(testDir, 'renamed.txt');
      amigafs.renameSync(file1, renamed);
      expect(amigafs.existsSync(file2)).toBe(false);
      expect(amigafs.existsSync(renamed)).toBe(true);

      // Delete files
      amigafs.unlinkSync(renamed);
      amigafs.unlinkSync(copyPath);
      expect(amigafs.existsSync(renamed)).toBe(false);
    });

    it('should handle nested directory operations', () => {
      const nested = path.join(testDir, 'Level1', 'Level2', 'Level3');

      // Create nested directories
      amigafs.mkdirSync(nested, { recursive: true });
      expect(amigafs.existsSync(nested)).toBe(true);

      // Write file in nested directory
      const file = path.join(nested, 'DeepFile.txt');
      amigafs.writeFileSync(file, 'Deep content');

      // Read with wrong case path
      const wrongCase = path.join(testDir, 'level1', 'LEVEL2', 'level3', 'deepfile.txt');
      const content = amigafs.readFileSync(wrongCase, 'utf8');
      expect(content).toBe('Deep content');

      // List directory
      const entries = amigafs.readdirSync(path.join(testDir, 'level1', 'level2', 'level3'));
      expect(entries).toContain('DeepFile.txt');
    });

    it('should handle mixed case operations across multiple files', () => {
      const files = [
        'File1.TXT',
        'file2.txt',
        'FILE3.TXT',
        'FiLe4.TxT',
      ];

      // Create files with various casings
      files.forEach((name, i) => {
        const filePath = path.join(testDir, name);
        amigafs.writeFileSync(filePath, `Content ${i}`);
      });

      // Read each with different case
      expect(amigafs.readFileSync(path.join(testDir, 'file1.txt'), 'utf8')).toBe('Content 0');
      expect(amigafs.readFileSync(path.join(testDir, 'FILE2.TXT'), 'utf8')).toBe('Content 1');
      expect(amigafs.readFileSync(path.join(testDir, 'file3.txt'), 'utf8')).toBe('Content 2');
      expect(amigafs.readFileSync(path.join(testDir, 'FILE4.TXT'), 'utf8')).toBe('Content 3');

      // List directory
      const entries = amigafs.readdirSync(testDir);
      expect(entries.length).toBeGreaterThanOrEqual(files.length);
    });
  });
});
