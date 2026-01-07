/**
 * File I/O Utility Unit Tests
 *
 * Tests all file I/O operations including reading, writing, wildcard matching,
 * case-insensitive path resolution, and directory operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  fileWriteLn,
  fileWriteLnPath,
  readIntFromFile,
  writeIntToFile,
  findFirst,
  findAll,
  readLines,
  writeLines,
  appendLine,
  readFile,
  writeFile,
  fileExists,
  dirExists,
  getFileSize,
  getFileModTime,
  copyFile,
  moveFile,
  deleteFile,
  createDirectory,
  deleteDirectory,
} from '../../src/utils/file-io.util';

describe('File I/O Utility Functions', () => {
  const testDir = path.join(__dirname, '../fixtures/file-io-test');
  const testFile = path.join(testDir, 'test.txt');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test files between tests
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        const filePath = path.join(testDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        } else if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        }
      }
    }
  });

  describe('fileWriteLn', () => {
    it('should write line with newline to file descriptor', () => {
      const fd = fs.openSync(testFile, 'w');
      try {
        fileWriteLn(fd, 'Hello, world!');
      } finally {
        fs.closeSync(fd);
      }

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Hello, world!\n');
    });

    it('should write multiple lines', () => {
      const fd = fs.openSync(testFile, 'w');
      try {
        fileWriteLn(fd, 'Line 1');
        fileWriteLn(fd, 'Line 2');
        fileWriteLn(fd, 'Line 3');
      } finally {
        fs.closeSync(fd);
      }

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Line 1\nLine 2\nLine 3\n');
    });

    it('should handle empty lines', () => {
      const fd = fs.openSync(testFile, 'w');
      try {
        fileWriteLn(fd, '');
      } finally {
        fs.closeSync(fd);
      }

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('\n');
    });
  });

  describe('fileWriteLnPath', () => {
    it('should create new file and write line', () => {
      fileWriteLnPath(testFile, 'Test line');

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Test line\n');
    });

    it('should append to file by default', () => {
      fileWriteLnPath(testFile, 'Line 1');
      fileWriteLnPath(testFile, 'Line 2');

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Line 1\nLine 2\n');
    });

    it('should overwrite file when append is false', () => {
      fileWriteLnPath(testFile, 'Line 1');
      fileWriteLnPath(testFile, 'New content', false);

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('New content\n');
    });

    it('should append when append is true', () => {
      fileWriteLnPath(testFile, 'Line 1', false);
      fileWriteLnPath(testFile, 'Line 2', true);

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Line 1\nLine 2\n');
    });
  });

  describe('readIntFromFile', () => {
    it('should read integer from file', () => {
      fs.writeFileSync(testFile, '42');
      expect(readIntFromFile(testFile)).toBe(42);
    });

    it('should read negative integer', () => {
      fs.writeFileSync(testFile, '-123');
      expect(readIntFromFile(testFile)).toBe(-123);
    });

    it('should read integer with whitespace', () => {
      fs.writeFileSync(testFile, '  456  \n');
      expect(readIntFromFile(testFile)).toBe(456);
    });

    it('should read zero', () => {
      fs.writeFileSync(testFile, '0');
      expect(readIntFromFile(testFile)).toBe(0);
    });

    it('should throw on invalid integer', () => {
      fs.writeFileSync(testFile, 'not a number');
      expect(() => readIntFromFile(testFile)).toThrow('Invalid integer');
    });

    it('should throw on empty file', () => {
      fs.writeFileSync(testFile, '');
      expect(() => readIntFromFile(testFile)).toThrow('Invalid integer');
    });

    it('should throw on missing file', () => {
      expect(() => readIntFromFile(path.join(testDir, 'missing.txt'))).toThrow('File not found');
    });

    it('should handle file with decimal (truncates)', () => {
      fs.writeFileSync(testFile, '42.5');
      expect(readIntFromFile(testFile)).toBe(42);
    });
  });

  describe('writeIntToFile', () => {
    it('should write integer to file', () => {
      writeIntToFile(testFile, 42);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('42');
    });

    it('should write negative integer', () => {
      writeIntToFile(testFile, -123);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('-123');
    });

    it('should write zero', () => {
      writeIntToFile(testFile, 0);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('0');
    });

    it('should overwrite existing content', () => {
      writeIntToFile(testFile, 100);
      writeIntToFile(testFile, 200);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('200');
    });
  });

  describe('findFirst', () => {
    beforeEach(() => {
      // Create test files
      fs.writeFileSync(path.join(testDir, 'test1.txt'), '');
      fs.writeFileSync(path.join(testDir, 'test2.txt'), '');
      fs.writeFileSync(path.join(testDir, 'data.dat'), '');
      fs.writeFileSync(path.join(testDir, 'readme.md'), '');
      fs.writeFileSync(path.join(testDir, 'file123.log'), '');
    });

    it('should find file with * wildcard', () => {
      const result = findFirst(testDir, '*.txt');
      expect(result).not.toBeNull();
      expect(result).toMatch(/test[12]\.txt$/);
    });

    it('should find file with ? wildcard', () => {
      const result = findFirst(testDir, 'test?.txt');
      expect(result).not.toBeNull();
      expect(result).toMatch(/test[12]\.txt$/);
    });

    it('should find exact filename', () => {
      const result = findFirst(testDir, 'readme.md');
      expect(result).toBe(path.join(testDir, 'readme.md'));
    });

    it('should be case-insensitive', () => {
      const result = findFirst(testDir, 'README.MD');
      expect(result).toBe(path.join(testDir, 'readme.md'));
    });

    it('should return null for no match', () => {
      const result = findFirst(testDir, '*.exe');
      expect(result).toBeNull();
    });

    it('should return null for missing directory', () => {
      const result = findFirst(path.join(testDir, 'missing'), '*.txt');
      expect(result).toBeNull();
    });

    it('should handle complex wildcards', () => {
      const result = findFirst(testDir, 'file*.log');
      expect(result).toBe(path.join(testDir, 'file123.log'));
    });

    it('should match multiple wildcards', () => {
      const result = findFirst(testDir, '*.???');
      expect(result).not.toBeNull();
      expect(result).toMatch(/\.(txt|dat|log)$/);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(testDir, 'test1.txt'), '');
      fs.writeFileSync(path.join(testDir, 'test2.txt'), '');
      fs.writeFileSync(path.join(testDir, 'data.dat'), '');
      fs.writeFileSync(path.join(testDir, 'readme.md'), '');
    });

    it('should find all matching files with * wildcard', () => {
      const results = findAll(testDir, '*.txt');
      expect(results).toHaveLength(2);
      expect(results.some(f => f.endsWith('test1.txt'))).toBe(true);
      expect(results.some(f => f.endsWith('test2.txt'))).toBe(true);
    });

    it('should find all files with ? wildcard', () => {
      const results = findAll(testDir, 'test?.txt');
      expect(results).toHaveLength(2);
    });

    it('should return empty array for no matches', () => {
      const results = findAll(testDir, '*.exe');
      expect(results).toEqual([]);
    });

    it('should return empty array for missing directory', () => {
      const results = findAll(path.join(testDir, 'missing'), '*.txt');
      expect(results).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const results = findAll(testDir, '*.TXT');
      expect(results).toHaveLength(2);
    });

    it('should match all files with *', () => {
      const results = findAll(testDir, '*');
      expect(results.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('readLines', () => {
    it('should read lines from file', () => {
      fs.writeFileSync(testFile, 'Line 1\nLine 2\nLine 3');
      const lines = readLines(testFile);
      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should handle empty file', () => {
      fs.writeFileSync(testFile, '');
      const lines = readLines(testFile);
      expect(lines).toEqual(['']);
    });

    it('should handle CRLF line endings', () => {
      fs.writeFileSync(testFile, 'Line 1\r\nLine 2\r\nLine 3');
      const lines = readLines(testFile);
      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should handle file with trailing newline', () => {
      fs.writeFileSync(testFile, 'Line 1\nLine 2\n');
      const lines = readLines(testFile);
      expect(lines).toEqual(['Line 1', 'Line 2', '']);
    });

    it('should throw on missing file', () => {
      expect(() => readLines(path.join(testDir, 'missing.txt'))).toThrow('File not found');
    });
  });

  describe('writeLines', () => {
    it('should write lines to new file', () => {
      writeLines(testFile, ['Line 1', 'Line 2', 'Line 3']);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Line 1\nLine 2\nLine 3\n');
    });

    it('should overwrite existing file by default', () => {
      writeLines(testFile, ['Old line']);
      writeLines(testFile, ['New line 1', 'New line 2']);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('New line 1\nNew line 2\n');
    });

    it('should append when append is true', () => {
      writeLines(testFile, ['Line 1']);
      writeLines(testFile, ['Line 2', 'Line 3'], true);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Line 1\nLine 2\nLine 3\n');
    });

    it('should handle empty array', () => {
      writeLines(testFile, []);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('');
    });
  });

  describe('appendLine', () => {
    it('should append line to new file', () => {
      appendLine(testFile, 'First line');
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('First line\n');
    });

    it('should append to existing file', () => {
      appendLine(testFile, 'Line 1');
      appendLine(testFile, 'Line 2');
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Line 1\nLine 2\n');
    });
  });

  describe('readFile', () => {
    it('should read entire file', () => {
      fs.writeFileSync(testFile, 'Hello, world!');
      expect(readFile(testFile)).toBe('Hello, world!');
    });

    it('should handle empty file', () => {
      fs.writeFileSync(testFile, '');
      expect(readFile(testFile)).toBe('');
    });

    it('should handle multiline content', () => {
      fs.writeFileSync(testFile, 'Line 1\nLine 2\nLine 3');
      expect(readFile(testFile)).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should throw on missing file', () => {
      expect(() => readFile(path.join(testDir, 'missing.txt'))).toThrow('File not found');
    });

    it('should support custom encoding', () => {
      fs.writeFileSync(testFile, 'Test', 'ascii');
      expect(readFile(testFile, 'ascii')).toBe('Test');
    });
  });

  describe('writeFile', () => {
    it('should write file', () => {
      writeFile(testFile, 'Hello, world!');
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Hello, world!');
    });

    it('should overwrite existing file', () => {
      writeFile(testFile, 'Old content');
      writeFile(testFile, 'New content');
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('New content');
    });

    it('should support custom encoding', () => {
      writeFile(testFile, 'Test', 'ascii');
      const content = fs.readFileSync(testFile, 'ascii');
      expect(content).toBe('Test');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', () => {
      fs.writeFileSync(testFile, '');
      expect(fileExists(testFile)).toBe(true);
    });

    it('should return false for missing file', () => {
      expect(fileExists(path.join(testDir, 'missing.txt'))).toBe(false);
    });

    it('should be case-insensitive', () => {
      fs.writeFileSync(path.join(testDir, 'Test.txt'), '');
      expect(fileExists(path.join(testDir, 'test.txt'))).toBe(true);
      expect(fileExists(path.join(testDir, 'TEST.TXT'))).toBe(true);
    });
  });

  describe('dirExists', () => {
    it('should return true for existing directory', () => {
      const subDir = path.join(testDir, 'subdir');
      fs.mkdirSync(subDir);
      expect(dirExists(subDir)).toBe(true);
    });

    it('should return false for missing directory', () => {
      expect(dirExists(path.join(testDir, 'missing'))).toBe(false);
    });

    it('should return false for file (not directory)', () => {
      fs.writeFileSync(testFile, '');
      expect(dirExists(testFile)).toBe(false);
    });

    it('should be case-insensitive', () => {
      const subDir = path.join(testDir, 'SubDir');
      fs.mkdirSync(subDir);
      expect(dirExists(path.join(testDir, 'subdir'))).toBe(true);
      expect(dirExists(path.join(testDir, 'SUBDIR'))).toBe(true);
    });
  });

  describe('getFileSize', () => {
    it('should return file size in bytes', () => {
      fs.writeFileSync(testFile, 'Hello, world!'); // 13 bytes
      expect(getFileSize(testFile)).toBe(13);
    });

    it('should return 0 for empty file', () => {
      fs.writeFileSync(testFile, '');
      expect(getFileSize(testFile)).toBe(0);
    });

    it('should throw on missing file', () => {
      expect(() => getFileSize(path.join(testDir, 'missing.txt'))).toThrow('File not found');
    });
  });

  describe('getFileModTime', () => {
    it('should return file modification time', () => {
      fs.writeFileSync(testFile, 'test');
      const modTime = getFileModTime(testFile);
      expect(typeof modTime.getTime()).toBe('number');
      expect(modTime.getTime()).toBeLessThanOrEqual(Date.now());
      expect(modTime.getTime()).toBeGreaterThan(Date.now() - 10000); // Within last 10 seconds
    });

    it('should throw on missing file', () => {
      expect(() => getFileModTime(path.join(testDir, 'missing.txt'))).toThrow('File not found');
    });

    it('should update when file is modified', (done) => {
      fs.writeFileSync(testFile, 'original');
      const originalTime = getFileModTime(testFile);

      setTimeout(() => {
        fs.writeFileSync(testFile, 'modified');
        const newTime = getFileModTime(testFile);
        expect(newTime.getTime()).toBeGreaterThanOrEqual(originalTime.getTime());
        done();
      }, 100);
    });
  });

  describe('copyFile', () => {
    it('should copy file', () => {
      const srcFile = path.join(testDir, 'source.txt');
      const destFile = path.join(testDir, 'dest.txt');

      fs.writeFileSync(srcFile, 'Test content');
      copyFile(srcFile, destFile);

      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile, 'utf-8')).toBe('Test content');
    });

    it('should throw on missing source file', () => {
      const srcFile = path.join(testDir, 'missing.txt');
      const destFile = path.join(testDir, 'dest.txt');
      expect(() => copyFile(srcFile, destFile)).toThrow('Source file not found');
    });

    it('should overwrite existing destination', () => {
      const srcFile = path.join(testDir, 'source.txt');
      const destFile = path.join(testDir, 'dest.txt');

      fs.writeFileSync(srcFile, 'New content');
      fs.writeFileSync(destFile, 'Old content');
      copyFile(srcFile, destFile);

      expect(fs.readFileSync(destFile, 'utf-8')).toBe('New content');
    });
  });

  describe('moveFile', () => {
    it('should move file', () => {
      const srcFile = path.join(testDir, 'source.txt');
      const destFile = path.join(testDir, 'dest.txt');

      fs.writeFileSync(srcFile, 'Test content');
      moveFile(srcFile, destFile);

      expect(fs.existsSync(srcFile)).toBe(false);
      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile, 'utf-8')).toBe('Test content');
    });

    it('should rename file in same directory', () => {
      const srcFile = path.join(testDir, 'old.txt');
      const destFile = path.join(testDir, 'new.txt');

      fs.writeFileSync(srcFile, 'Content');
      moveFile(srcFile, destFile);

      expect(fs.existsSync(srcFile)).toBe(false);
      expect(fs.existsSync(destFile)).toBe(true);
    });

    it('should throw on missing source file', () => {
      const srcFile = path.join(testDir, 'missing.txt');
      const destFile = path.join(testDir, 'dest.txt');
      expect(() => moveFile(srcFile, destFile)).toThrow('Source file not found');
    });
  });

  describe('deleteFile', () => {
    it('should delete file', () => {
      fs.writeFileSync(testFile, 'test');
      expect(fs.existsSync(testFile)).toBe(true);

      deleteFile(testFile);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should not throw on missing file', () => {
      const missingFile = path.join(testDir, 'missing.txt');
      expect(() => deleteFile(missingFile)).not.toThrow();
    });
  });

  describe('createDirectory', () => {
    it('should create directory', () => {
      const newDir = path.join(testDir, 'newdir');
      createDirectory(newDir);
      expect(fs.existsSync(newDir)).toBe(true);
      expect(fs.statSync(newDir).isDirectory()).toBe(true);
    });

    it('should create nested directories', () => {
      const nestedDir = path.join(testDir, 'level1/level2/level3');
      createDirectory(nestedDir);
      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('should not throw if directory already exists', () => {
      const newDir = path.join(testDir, 'existing');
      fs.mkdirSync(newDir);
      expect(() => createDirectory(newDir)).not.toThrow();
    });
  });

  describe('deleteDirectory', () => {
    it('should delete empty directory', () => {
      const dirToDelete = path.join(testDir, 'todelete');
      fs.mkdirSync(dirToDelete);
      expect(fs.existsSync(dirToDelete)).toBe(true);

      deleteDirectory(dirToDelete);
      expect(fs.existsSync(dirToDelete)).toBe(false);
    });

    it('should delete directory with files', () => {
      const dirToDelete = path.join(testDir, 'todelete');
      fs.mkdirSync(dirToDelete);
      fs.writeFileSync(path.join(dirToDelete, 'file1.txt'), '');
      fs.writeFileSync(path.join(dirToDelete, 'file2.txt'), '');

      deleteDirectory(dirToDelete);
      expect(fs.existsSync(dirToDelete)).toBe(false);
    });

    it('should delete directory recursively', () => {
      const dirToDelete = path.join(testDir, 'todelete');
      const subDir = path.join(dirToDelete, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'file.txt'), '');

      deleteDirectory(dirToDelete);
      expect(fs.existsSync(dirToDelete)).toBe(false);
    });

    it('should not throw on missing directory', () => {
      const missingDir = path.join(testDir, 'missing');
      expect(() => deleteDirectory(missingDir)).not.toThrow();
    });
  });

  describe('integration tests', () => {
    it('should support full file lifecycle', () => {
      const file = path.join(testDir, 'lifecycle.txt');

      // Write
      fileWriteLnPath(file, 'Initial content', false);
      expect(fileExists(file)).toBe(true);

      // Read
      const initialContent = readFile(file);
      expect(initialContent).toBe('Initial content\n');

      // Append
      appendLine(file, 'Appended line');
      const lines = readLines(file);
      expect(lines[0]).toBe('Initial content');
      expect(lines[1]).toBe('Appended line');

      // Copy
      const copyPath = path.join(testDir, 'copy.txt');
      copyFile(file, copyPath);
      expect(fileExists(copyPath)).toBe(true);

      // Move
      const movePath = path.join(testDir, 'moved.txt');
      moveFile(copyPath, movePath);
      expect(fileExists(copyPath)).toBe(false);
      expect(fileExists(movePath)).toBe(true);

      // Delete
      deleteFile(file);
      deleteFile(movePath);
      expect(fileExists(file)).toBe(false);
      expect(fileExists(movePath)).toBe(false);
    });

    it('should work with integers round-trip', () => {
      const file = path.join(testDir, 'number.txt');

      writeIntToFile(file, 42);
      expect(readIntFromFile(file)).toBe(42);

      writeIntToFile(file, -999);
      expect(readIntFromFile(file)).toBe(-999);
    });

    it('should handle case-insensitive paths throughout', () => {
      const file = path.join(testDir, 'CaseSensitive.TXT');
      writeFile(file, 'test');

      expect(fileExists(path.join(testDir, 'casesensitive.txt'))).toBe(true);
      expect(readFile(path.join(testDir, 'CASESENSITIVE.TXT'))).toBe('test');

      const copyPath = path.join(testDir, 'copy.txt');
      copyFile(path.join(testDir, 'casesensitive.txt'), copyPath);
      expect(fileExists(copyPath)).toBe(true);
    });
  });
});
