/**
 * Path Utility Unit Tests
 *
 * Tests all path manipulation, Amiga assign resolution, and file operations.
 * Validates path normalization, slash handling, and filesystem operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  checkPathSlash,
  removePathSlash,
  findAssign,
  resolveAssignPath,
  joinPath,
  getDirName,
  getFileName,
  getFileNameWithoutExt,
  getFileExt,
  getFileExtNoDot,
  normalizePath,
  getAbsolutePath,
  getRelativePath,
  isAbsolutePath,
  toUnixPath,
  toWindowsPath,
  ensureDir,
  getParentDir,
  isSubdirectory,
  sanitizeFileName,
  getUniqueFilePath,
} from '../../src/utils/path-util';

describe('Path Utility Functions', () => {
  const testDir = path.join(__dirname, '../fixtures/path-test');

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('checkPathSlash', () => {
    it('should add trailing slash if missing', () => {
      expect(checkPathSlash('path/to/dir')).toBe('path/to/dir/');
      expect(checkPathSlash('/usr/local')).toBe('/usr/local/');
    });

    it('should preserve existing trailing slash', () => {
      expect(checkPathSlash('path/to/dir/')).toBe('path/to/dir/');
      expect(checkPathSlash('/usr/local/')).toBe('/usr/local/');
    });

    it('should handle empty string', () => {
      expect(checkPathSlash('')).toBe('/');
    });

    it('should handle null/undefined', () => {
      expect(checkPathSlash(null as any)).toBe('/');
      expect(checkPathSlash(undefined as any)).toBe('/');
    });

    it('should handle root path', () => {
      expect(checkPathSlash('/')).toBe('/');
    });

    it('should handle Windows-style paths', () => {
      expect(checkPathSlash('C:\\Users\\Test')).toBe('C:\\Users\\Test/');
    });
  });

  describe('removePathSlash', () => {
    it('should remove trailing slash', () => {
      expect(removePathSlash('path/to/dir/')).toBe('path/to/dir');
      expect(removePathSlash('/usr/local/')).toBe('/usr/local');
    });

    it('should handle paths without trailing slash', () => {
      expect(removePathSlash('path/to/dir')).toBe('path/to/dir');
    });

    it('should remove multiple trailing slashes', () => {
      expect(removePathSlash('path///')).toBe('path');
    });

    it('should handle empty string', () => {
      expect(removePathSlash('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(removePathSlash(null as any)).toBe('');
      expect(removePathSlash(undefined as any)).toBe('');
    });

    it('should handle root path', () => {
      expect(removePathSlash('/')).toBe('');
    });
  });

  describe('findAssign', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should find BBS: assign', () => {
      process.env.BBS_DATA_DIR = '/path/to/bbs';
      expect(findAssign('BBS:')).toBe('/path/to/bbs');
    });

    it('should find SYS: assign', () => {
      process.env.AMIGA_SYS_DIR = '/usr/local/amiga';
      expect(findAssign('SYS:')).toBe('/usr/local/amiga');
    });

    it('should be case-insensitive', () => {
      process.env.BBS_DATA_DIR = '/path/to/bbs';
      expect(findAssign('bbs:')).toBe('/path/to/bbs');
      expect(findAssign('BBS')).toBe('/path/to/bbs');
      expect(findAssign('Bbs:')).toBe('/path/to/bbs');
    });

    it('should add colon if missing', () => {
      process.env.BBS_DATA_DIR = '/path/to/bbs';
      expect(findAssign('BBS')).toBe('/path/to/bbs');
    });

    it('should return null for unknown assigns', () => {
      expect(findAssign('UNKNOWN:')).toBeNull();
    });

    it('should support DOORS: assign', () => {
      process.env.DOORS_DIR = '/path/to/doors';
      expect(findAssign('DOORS:')).toBe('/path/to/doors');
    });

    it('should support LIBS: assign', () => {
      process.env.LIBS_DIR = '/path/to/libs';
      expect(findAssign('LIBS:')).toBe('/path/to/libs');
    });

    it('should support T: (temp) assign', () => {
      process.env.TEMP_DIR = '/custom/tmp';
      expect(findAssign('T:')).toBe('/custom/tmp');
    });
  });

  describe('resolveAssignPath', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, BBS_DATA_DIR: '/bbs/data' };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should resolve BBS: assign path', () => {
      const result = resolveAssignPath('BBS:Doors/door.exe');
      expect(result).toBe(path.join('/bbs/data', 'Doors/door.exe'));
    });

    it('should handle paths without assigns', () => {
      expect(resolveAssignPath('/absolute/path')).toBe('/absolute/path');
      expect(resolveAssignPath('relative/path')).toBe('relative/path');
    });

    it('should handle empty string', () => {
      expect(resolveAssignPath('')).toBe('');
    });

    it('should be case-insensitive for assigns', () => {
      const result = resolveAssignPath('bbs:Doors/door.exe');
      expect(result).toBe(path.join('/bbs/data', 'Doors/door.exe'));
    });

    it('should handle unknown assigns as regular paths', () => {
      expect(resolveAssignPath('UNKNOWN:path')).toBe('UNKNOWN:path');
    });
  });

  describe('joinPath', () => {
    it('should join multiple path components', () => {
      expect(joinPath('path', 'to', 'file')).toBe(path.join('path', 'to', 'file'));
    });

    it('should handle single component', () => {
      expect(joinPath('path')).toBe('path');
    });

    it('should normalize slashes', () => {
      const result = joinPath('path/', '/to/', '/file');
      expect(result).toBe(path.join('path/', '/to/', '/file'));
    });
  });

  describe('getDirName', () => {
    it('should get directory from file path', () => {
      expect(getDirName('/path/to/file.txt')).toBe('/path/to');
    });

    it('should handle directory paths with trailing slash', () => {
      expect(getDirName('/path/to/dir/')).toBe('/path/to');
    });

    it('should handle root directory', () => {
      expect(getDirName('/file.txt')).toBe('/');
    });
  });

  describe('getFileName', () => {
    it('should get file name with extension', () => {
      expect(getFileName('/path/to/file.txt')).toBe('file.txt');
    });

    it('should handle paths without extension', () => {
      expect(getFileName('/path/to/file')).toBe('file');
    });

    it('should handle file names only', () => {
      expect(getFileName('file.txt')).toBe('file.txt');
    });
  });

  describe('getFileNameWithoutExt', () => {
    it('should get file name without extension', () => {
      expect(getFileNameWithoutExt('/path/to/file.txt')).toBe('file');
    });

    it('should handle multiple dots', () => {
      expect(getFileNameWithoutExt('/path/to/archive.tar.gz')).toBe('archive.tar');
    });

    it('should handle files without extension', () => {
      expect(getFileNameWithoutExt('/path/to/file')).toBe('file');
    });

    it('should handle dotfiles', () => {
      expect(getFileNameWithoutExt('.bashrc')).toBe('.bashrc');
    });

    it('should handle hidden files with extension', () => {
      expect(getFileNameWithoutExt('.config.json')).toBe('.config');
    });
  });

  describe('getFileExt', () => {
    it('should get extension with dot', () => {
      expect(getFileExt('/path/to/file.txt')).toBe('.txt');
    });

    it('should handle multiple dots', () => {
      expect(getFileExt('archive.tar.gz')).toBe('.gz');
    });

    it('should return empty for no extension', () => {
      expect(getFileExt('/path/to/file')).toBe('');
    });

    it('should handle dotfiles', () => {
      expect(getFileExt('.bashrc')).toBe('');
    });
  });

  describe('getFileExtNoDot', () => {
    it('should get extension without dot', () => {
      expect(getFileExtNoDot('/path/to/file.txt')).toBe('txt');
    });

    it('should return empty for no extension', () => {
      expect(getFileExtNoDot('/path/to/file')).toBe('');
    });

    it('should handle uppercase extensions', () => {
      expect(getFileExtNoDot('FILE.TXT')).toBe('TXT');
    });
  });

  describe('normalizePath', () => {
    it('should resolve . and .. components', () => {
      expect(normalizePath('/path/./to/../file')).toBe(path.normalize('/path/./to/../file'));
    });

    it('should handle multiple slashes', () => {
      expect(normalizePath('/path//to///file')).toBe(path.normalize('/path//to///file'));
    });
  });

  describe('getAbsolutePath', () => {
    it('should convert relative to absolute', () => {
      const result = getAbsolutePath('relative/path');
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('should preserve absolute paths', () => {
      const absPath = '/absolute/path';
      expect(getAbsolutePath(absPath)).toBe(path.resolve(absPath));
    });
  });

  describe('getRelativePath', () => {
    it('should get relative path between two paths', () => {
      const from = '/path/to/start';
      const to = '/path/to/end';
      expect(getRelativePath(from, to)).toBe(path.relative(from, to));
    });

    it('should handle parent directory navigation', () => {
      const from = '/path/to/deep/dir';
      const to = '/path/to/file';
      expect(getRelativePath(from, to)).toBe(path.relative(from, to));
    });
  });

  describe('isAbsolutePath', () => {
    it('should return true for absolute paths', () => {
      expect(isAbsolutePath('/absolute/path')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(isAbsolutePath('relative/path')).toBe(false);
      expect(isAbsolutePath('./relative')).toBe(false);
      expect(isAbsolutePath('../parent')).toBe(false);
    });

    it('should handle Windows absolute paths on Windows', () => {
      // Note: behavior depends on platform
      const windowsPath = 'C:\\Users\\Test';
      expect(isAbsolutePath(windowsPath)).toBe(path.isAbsolute(windowsPath));
    });
  });

  describe('toUnixPath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(toUnixPath('C:\\Users\\Test\\file.txt')).toBe('C:/Users/Test/file.txt');
    });

    it('should preserve forward slashes', () => {
      expect(toUnixPath('/path/to/file')).toBe('/path/to/file');
    });

    it('should handle empty string', () => {
      expect(toUnixPath('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(toUnixPath(null as any)).toBe('');
      expect(toUnixPath(undefined as any)).toBe('');
    });

    it('should handle mixed slashes', () => {
      expect(toUnixPath('path\\to/file')).toBe('path/to/file');
    });
  });

  describe('toWindowsPath', () => {
    it('should convert forward slashes to backslashes', () => {
      expect(toWindowsPath('/path/to/file')).toBe('\\path\\to\\file');
    });

    it('should preserve backslashes', () => {
      expect(toWindowsPath('C:\\Users\\Test')).toBe('C:\\Users\\Test');
    });

    it('should handle empty string', () => {
      expect(toWindowsPath('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(toWindowsPath(null as any)).toBe('');
      expect(toWindowsPath(undefined as any)).toBe('');
    });
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', () => {
      const newDir = path.join(testDir, 'new-dir');
      ensureDir(newDir);
      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should not error if directory already exists', () => {
      const existingDir = path.join(testDir, 'existing-dir');
      fs.mkdirSync(existingDir, { recursive: true });
      expect(() => ensureDir(existingDir)).not.toThrow();
    });

    it('should create nested directories', () => {
      const nestedDir = path.join(testDir, 'level1/level2/level3');
      ensureDir(nestedDir);
      expect(fs.existsSync(nestedDir)).toBe(true);
    });
  });

  describe('getParentDir', () => {
    it('should get parent directory', () => {
      expect(getParentDir('/path/to/file')).toBe('/path/to');
    });

    it('should handle root directory', () => {
      expect(getParentDir('/file')).toBe('/');
    });

    it('should handle relative paths', () => {
      expect(getParentDir('path/to/file')).toBe('path/to');
    });
  });

  describe('isSubdirectory', () => {
    it('should return true for subdirectory', () => {
      expect(isSubdirectory('/path/to/child', '/path/to')).toBe(true);
    });

    it('should return false for non-subdirectory', () => {
      expect(isSubdirectory('/other/path', '/path/to')).toBe(false);
    });

    it('should return false for same directory', () => {
      expect(isSubdirectory('/path/to', '/path/to')).toBe(true);
    });

    it('should return false for parent directory', () => {
      expect(isSubdirectory('/path', '/path/to')).toBe(false);
    });
  });

  describe('sanitizeFileName', () => {
    it('should remove invalid characters', () => {
      expect(sanitizeFileName('file<>name')).toBe('file__name');
      expect(sanitizeFileName('file:name')).toBe('file_name');
      expect(sanitizeFileName('file|name')).toBe('file_name');
      expect(sanitizeFileName('file?name')).toBe('file_name');
      expect(sanitizeFileName('file*name')).toBe('file_name');
    });

    it('should preserve valid characters', () => {
      expect(sanitizeFileName('valid-file_name.txt')).toBe('valid-file_name.txt');
    });

    it('should handle empty string', () => {
      expect(sanitizeFileName('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeFileName(null as any)).toBe('');
      expect(sanitizeFileName(undefined as any)).toBe('');
    });

    it('should remove control characters', () => {
      expect(sanitizeFileName('file\x00name')).toBe('file_name');
      expect(sanitizeFileName('file\x1fname')).toBe('file_name');
    });

    it('should handle quotes', () => {
      expect(sanitizeFileName('file"name')).toBe('file_name');
    });
  });

  describe('getUniqueFilePath', () => {
    it('should return original path if file does not exist', () => {
      const filePath = path.join(testDir, 'nonexistent.txt');
      expect(getUniqueFilePath(filePath)).toBe(filePath);
    });

    it('should append (1) if file exists', () => {
      const filePath = path.join(testDir, 'existing.txt');
      fs.writeFileSync(filePath, 'test');

      const uniquePath = getUniqueFilePath(filePath);
      expect(uniquePath).toBe(path.join(testDir, 'existing (1).txt'));
    });

    it('should increment counter for multiple duplicates', () => {
      const filePath = path.join(testDir, 'duplicate.txt');
      fs.writeFileSync(filePath, 'test');
      fs.writeFileSync(path.join(testDir, 'duplicate (1).txt'), 'test');
      fs.writeFileSync(path.join(testDir, 'duplicate (2).txt'), 'test');

      const uniquePath = getUniqueFilePath(filePath);
      expect(uniquePath).toBe(path.join(testDir, 'duplicate (3).txt'));
    });

    it('should handle files without extension', () => {
      const filePath = path.join(testDir, 'noext');
      fs.writeFileSync(filePath, 'test');

      const uniquePath = getUniqueFilePath(filePath);
      expect(uniquePath).toBe(path.join(testDir, 'noext (1)'));
    });

    it('should preserve extension', () => {
      const filePath = path.join(testDir, 'file.tar.gz');
      fs.writeFileSync(filePath, 'test');

      const uniquePath = getUniqueFilePath(filePath);
      expect(uniquePath).toBe(path.join(testDir, 'file.tar (1).gz'));
    });
  });
});
