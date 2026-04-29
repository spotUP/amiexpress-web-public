/**
 * DIR File Reader Utility Unit Tests
 *
 * Tests classic BBS DIR file format parsing
 */

// Mock dependencies BEFORE imports.
// jest.mock() is hoisted above top-level code, so requireActual must run
// inside the factory — the previous outer `const actualFs` was undefined at
// hoist time and threw "Cannot access 'actualFs' before initialization".
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      readFile: jest.fn(),
    },
  };
});
jest.mock('../../src/utils/amigafs', () => ({
  findCaseInsensitive: jest.fn(),
}));
jest.mock('../../src/utils/date-time.util', () => ({
  getSystemTime: jest.fn(() => new Date('2025-01-07T12:00:00Z')),
}));

import * as path from 'path';
import * as fs from 'fs';
import { findCaseInsensitive } from '../../src/utils/amigafs';
import {
  isNewFileEntry,
  parseDirEntry,
  parseDirFile,
  formatDirEntry,
  readDirFile,
  getDirFilePath,
  getHoldDirFilePath,
  DirFileEntry,
} from '../../src/utils/dir-file-reader.util';

describe('DIR File Reader Utility', () => {
  const mockReadFile = (fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>);
  const mockFindCaseInsensitive = findCaseInsensitive as jest.MockedFunction<typeof findCaseInsensitive>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isNewFileEntry', () => {
    it('should identify valid file entry line', () => {
      const line = 'testfile.txt P  123K  23-Oct-25  Test description';
      expect(isNewFileEntry(line)).toBe(true);
    });

    it('should accept P status marker', () => {
      const line = 'file1.txt    P  100K  01-Jan-25  Passed';
      expect(isNewFileEntry(line)).toBe(true);
    });

    it('should accept F status marker', () => {
      const line = 'file2.txt    F  200K  02-Feb-25  Failed';
      expect(isNewFileEntry(line)).toBe(true);
    });

    it('should accept N status marker', () => {
      const line = 'file3.txt    N  300K  03-Mar-25  Not tested';
      expect(isNewFileEntry(line)).toBe(true);
    });

    it('should accept D status marker', () => {
      const line = 'file4.txt    D  400K  04-Apr-25  Duplicate';
      expect(isNewFileEntry(line)).toBe(true);
    });

    it('should reject line shorter than 14 chars', () => {
      expect(isNewFileEntry('short')).toBe(false);
      expect(isNewFileEntry('12345678901')).toBe(false);
    });

    it('should reject invalid status marker', () => {
      const line = 'filename.txt X  100K  01-Jan-25  Invalid';
      expect(isNewFileEntry(line)).toBe(false);
    });

    it('should reject line without space at position 12', () => {
      const line = 'filenameXXXXXP  100K  01-Jan-25  No space';
      expect(isNewFileEntry(line)).toBe(false);
    });

    it('should reject continuation line (33 spaces)', () => {
      const line = '                                 Continuation text';
      expect(isNewFileEntry(line)).toBe(false);
    });

    it('should reject line with all-spaces filename', () => {
      const line = '            P  100K  01-Jan-25  All spaces';
      expect(isNewFileEntry(line)).toBe(false);
    });

    it('should accept filename with trailing spaces', () => {
      const line = 'test.txt     P  100K  01-Jan-25  Description';
      expect(isNewFileEntry(line)).toBe(true);
    });

    it('should accept minimum valid line (14 chars)', () => {
      const line = 'test.txt     P'; // 12 char filename + space + status
      expect(isNewFileEntry(line)).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isNewFileEntry('')).toBe(false);
    });
  });

  describe('parseDirEntry', () => {
    it('should parse basic file entry', () => {
      const lines = ['testfile.txt P  123K  23-Oct-25  Test description'];
      const entry = parseDirEntry(lines, 0);

      expect(entry).not.toBeNull();
      expect(entry!.filename).toBe('testfile.txt');
      expect(entry!.statusMarker).toBe('P');
      expect(entry!.fileSizeDisplay).toBe('123K');
      expect(entry!.fileSize).toBe(123 * 1024);
      expect(entry!.uploadDateDisplay).toBe('23-Oct-25');
      expect(entry!.description).toBe('Test description');
      expect(entry!.rawLines).toEqual(['testfile.txt P  123K  23-Oct-25  Test description']);
      expect(entry!.lineNumber).toBe(0);
    });

    it('should parse file with kilobyte size', () => {
      const lines = ['file.zip     P  500K  01-Jan-25  Archive'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.fileSizeDisplay).toBe('500K');
      expect(entry!.fileSize).toBe(500 * 1024);
    });

    it('should parse file with megabyte size', () => {
      const lines = ['large.iso    P  5M    01-Jan-25  Big file'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.fileSizeDisplay).toBe('5M');
      expect(entry!.fileSize).toBe(5 * 1024 * 1024);
    });

    it('should parse file with gigabyte size', () => {
      const lines = ['huge.iso     P  2G    01-Jan-25  Huge file'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.fileSizeDisplay).toBe('2G');
      expect(entry!.fileSize).toBe(2 * 1024 * 1024 * 1024);
    });

    it('should parse file with byte size (no suffix)', () => {
      const lines = ['tiny.txt     P  42    01-Jan-25  Tiny file'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.fileSizeDisplay).toBe('42');
      expect(entry!.fileSize).toBe(42);
    });

    it('should parse file with lowercase size suffix', () => {
      const lines = ['file.zip     P  100k  01-Jan-25  Archive'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.fileSizeDisplay).toBe('100k');
      expect(entry!.fileSize).toBe(100 * 1024);
    });

    it('should parse date format DD-MMM-YY', () => {
      const lines = ['file.txt     P  100K  15-Jan-25  Test'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.uploadDateDisplay).toBe('15-Jan-25');
      expect(entry!.uploadDate.getFullYear()).toBe(2025);
      expect(entry!.uploadDate.getMonth()).toBe(0); // January
      expect(entry!.uploadDate.getDate()).toBe(15);
    });

    it('should parse all month abbreviations', () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      months.forEach((month, index) => {
        const lines = [`file.txt     P  100K  01-${month}-25  Test`];
        const entry = parseDirEntry(lines, 0);

        expect(entry!.uploadDate.getMonth()).toBe(index);
      });
    });

    it('should handle lowercase month abbreviations', () => {
      const lines = ['file.txt     P  100K  01-jan-25  Test'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.uploadDate.getMonth()).toBe(0); // January
    });

    it('should handle single-digit day', () => {
      const lines = ['file.txt     P  100K  5-Jan-25  Test'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.uploadDate.getDate()).toBe(5);
    });

    it('should parse multi-word description', () => {
      const lines = ['file.txt     P  100K  01-Jan-25  This is a long description'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.description).toBe('This is a long description');
    });

    it('should parse multi-line description', () => {
      const lines = [
        'file.txt     P  100K  01-Jan-25  First line of description',
        '                                 Second line continuation',
        '                                 Third line continuation',
      ];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.description).toBe('First line of description Second line continuation Third line continuation');
      expect(entry!.rawLines.length).toBe(3);
    });

    it('should stop at next file entry', () => {
      const lines = [
        'file1.txt    P  100K  01-Jan-25  First file',
        'file2.txt    P  200K  02-Feb-25  Second file',
      ];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.filename).toBe('file1.txt');
      expect(entry!.rawLines.length).toBe(1);
    });

    it('should handle continuation line shorter than 33 chars', () => {
      const lines = [
        'file.txt     P  100K  01-Jan-25  First line',
        'short', // Not a continuation
      ];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.description).toBe('First line');
      expect(entry!.rawLines.length).toBe(1);
    });

    it('should handle line with 33 chars but not all spaces', () => {
      const lines = [
        'file.txt     P  100K  01-Jan-25  First line',
        'text at position 0             not continuation',
      ];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.description).toBe('First line');
      expect(entry!.rawLines.length).toBe(1);
    });

    it('should trim filename padding', () => {
      const lines = ['file.txt     P  100K  01-Jan-25  Test'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.filename).toBe('file.txt');
      expect(entry!.filename.length).toBe(8); // No trailing spaces
    });

    it('should handle F status marker', () => {
      const lines = ['file.txt     F  100K  01-Jan-25  Failed'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.statusMarker).toBe('F');
    });

    it('should handle N status marker', () => {
      const lines = ['file.txt     N  100K  01-Jan-25  Not tested'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.statusMarker).toBe('N');
    });

    it('should handle D status marker', () => {
      const lines = ['file.txt     D  100K  01-Jan-25  Duplicate'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.statusMarker).toBe('D');
    });

    it('should return null for invalid entry', () => {
      const lines = ['Not a valid DIR entry'];
      const entry = parseDirEntry(lines, 0);

      expect(entry).toBeNull();
    });

    it('should handle entry without date', () => {
      const lines = ['file.txt     P  100K  Description without date'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.uploadDateDisplay).toBe('');
      expect(entry!.description).toContain('Description');
    });

    it('should handle entry with only filename and status', () => {
      const lines = ['file.txt     P'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.filename).toBe('file.txt');
      expect(entry!.statusMarker).toBe('P');
      expect(entry!.description).toBe('');
    });

    it('should handle continuation line with only spaces after indent', () => {
      const lines = [
        'file.txt     P  100K  01-Jan-25  First line',
        '                                 ',
      ];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.description).toBe('First line ');
      expect(entry!.rawLines.length).toBe(2);
    });

    it('should use system time for upload date when date invalid', () => {
      const lines = ['file.txt     P  100K  InvalidDate  Test'];
      const entry = parseDirEntry(lines, 0);

      // Should use system time (not parsed from invalid date string)
      expect(entry!.uploadDate).toBeInstanceOf(Date);
      expect(entry!.uploadDate.getFullYear()).toBeGreaterThan(2020);
      expect(entry!.uploadDateDisplay).toBe('');
    });

    it('should handle variable-width file sizes', () => {
      const lines = ['file.txt     P  1K    01-Jan-25  Test'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.fileSizeDisplay).toBe('1K');
      expect(entry!.fileSize).toBe(1024);
    });
  });

  describe('parseDirFile', () => {
    it('should parse multiple file entries', () => {
      const content = `file1.txt    P  100K  01-Jan-25  First file
file2.txt    P  200K  02-Feb-25  Second file
file3.txt    P  300K  03-Mar-25  Third file`;

      const entries = parseDirFile(content);

      expect(entries.length).toBe(3);
      expect(entries[0].filename).toBe('file1.txt');
      expect(entries[1].filename).toBe('file2.txt');
      expect(entries[2].filename).toBe('file3.txt');
    });

    it('should handle CRLF line endings', () => {
      const content = `file1.txt    P  100K  01-Jan-25  First file\r\nfile2.txt    P  200K  02-Feb-25  Second file`;

      const entries = parseDirFile(content);

      expect(entries.length).toBe(2);
    });

    it('should handle LF line endings', () => {
      const content = `file1.txt    P  100K  01-Jan-25  First file\nfile2.txt    P  200K  02-Feb-25  Second file`;

      const entries = parseDirFile(content);

      expect(entries.length).toBe(2);
    });

    it('should handle multi-line descriptions', () => {
      const content = `file1.txt    P  100K  01-Jan-25  First line
                                 Second line
file2.txt    P  200K  02-Feb-25  Another file`;

      const entries = parseDirFile(content);

      expect(entries.length).toBe(2);
      expect(entries[0].description).toBe('First line Second line');
      expect(entries[1].description).toBe('Another file');
    });

    it('should skip invalid lines', () => {
      const content = `Invalid line here
file1.txt    P  100K  01-Jan-25  Valid file
Another invalid line
file2.txt    P  200K  02-Feb-25  Another valid`;

      const entries = parseDirFile(content);

      expect(entries.length).toBe(2);
      expect(entries[0].filename).toBe('file1.txt');
      expect(entries[1].filename).toBe('file2.txt');
    });

    it('should handle empty content', () => {
      const entries = parseDirFile('');

      expect(entries).toEqual([]);
    });

    it('should handle content with only invalid lines', () => {
      const content = `Invalid line 1
Invalid line 2
Invalid line 3`;

      const entries = parseDirFile(content);

      expect(entries).toEqual([]);
    });

    it('should handle trailing empty lines', () => {
      const content = `file1.txt    P  100K  01-Jan-25  Test


`;

      const entries = parseDirFile(content);

      expect(entries.length).toBe(1);
    });

    it('should handle complex multi-line entries', () => {
      const content = `file1.txt    P  100K  01-Jan-25  Multi-line description
                                 with continuation line 1
                                 and continuation line 2
file2.txt    P  200K  02-Feb-25  Single line
file3.txt    P  300K  03-Mar-25  Another multi-line
                                 with one continuation`;

      const entries = parseDirFile(content);

      expect(entries.length).toBe(3);
      expect(entries[0].rawLines.length).toBe(3);
      expect(entries[1].rawLines.length).toBe(1);
      expect(entries[2].rawLines.length).toBe(2);
    });

    it('should preserve line numbers', () => {
      const content = `file1.txt    P  100K  01-Jan-25  First
file2.txt    P  200K  02-Feb-25  Second
file3.txt    P  300K  03-Mar-25  Third`;

      const entries = parseDirFile(content);

      expect(entries[0].lineNumber).toBe(0);
      expect(entries[1].lineNumber).toBe(1);
      expect(entries[2].lineNumber).toBe(2);
    });

    it('should handle mixed status markers', () => {
      const content = `file1.txt    P  100K  01-Jan-25  Passed
file2.txt    F  200K  02-Feb-25  Failed
file3.txt    N  300K  03-Mar-25  Not tested
file4.txt    D  400K  04-Apr-25  Duplicate`;

      const entries = parseDirFile(content);

      expect(entries[0].statusMarker).toBe('P');
      expect(entries[1].statusMarker).toBe('F');
      expect(entries[2].statusMarker).toBe('N');
      expect(entries[3].statusMarker).toBe('D');
    });
  });

  describe('formatDirEntry', () => {
    it('should format basic entry', () => {
      const entry: DirFileEntry = {
        filename: 'test.txt',
        statusMarker: 'P',
        fileSize: 123 * 1024,
        fileSizeDisplay: '123K',
        uploadDate: new Date(2025, 0, 15),
        uploadDateDisplay: '15-Jan-25',
        description: 'Test file',
        rawLines: [],
        lineNumber: 0,
      };

      const formatted = formatDirEntry(entry);

      expect(formatted).toContain('test.txt');
      expect(formatted).toContain('P');
      expect(formatted).toContain('123K');
      expect(formatted).toContain('15-Jan-25');
      expect(formatted).toContain('Test file');
      expect(formatted).toMatch(/\r\n$/);
    });

    it('should pad filename to 12 characters', () => {
      const entry: DirFileEntry = {
        filename: 'a.txt',
        statusMarker: 'P',
        fileSize: 1024,
        fileSizeDisplay: '1K',
        uploadDate: new Date(),
        uploadDateDisplay: '01-Jan-25',
        description: 'Test',
        rawLines: [],
        lineNumber: 0,
      };

      const formatted = formatDirEntry(entry);

      // Should have filename followed by space, then status marker at position 13
      expect(formatted.substring(0, 13)).toBe('a.txt        ');
    });

    it('should truncate long description', () => {
      const entry: DirFileEntry = {
        filename: 'test.txt',
        statusMarker: 'P',
        fileSize: 1024,
        fileSizeDisplay: '1K',
        uploadDate: new Date(),
        uploadDateDisplay: '01-Jan-25',
        description: 'This is a very long description that should be truncated to first 10 words',
        rawLines: [],
        lineNumber: 0,
      };

      const formatted = formatDirEntry(entry);

      // Should only include first 10 words
      const words = formatted.split(/\s+/).filter((w) => w.length > 0);
      const descWords = words.slice(5); // Skip filename, status, size, date parts
      expect(descWords.length).toBeLessThanOrEqual(10);
    });

    it('should pad file size', () => {
      const entry: DirFileEntry = {
        filename: 'test.txt',
        statusMarker: 'P',
        fileSize: 1024,
        fileSizeDisplay: '1K',
        uploadDate: new Date(),
        uploadDateDisplay: '01-Jan-25',
        description: 'Test',
        rawLines: [],
        lineNumber: 0,
      };

      const formatted = formatDirEntry(entry);

      expect(formatted).toContain('   1K');
    });
  });

  describe('readDirFile', () => {
    it('should read and parse DIR file', async () => {
      const content = `file1.txt    P  100K  01-Jan-25  First file
file2.txt    P  200K  02-Feb-25  Second file`;

      mockReadFile.mockResolvedValue(content as any);

      const entries = await readDirFile('/test/DIR1');

      expect(mockReadFile).toHaveBeenCalledWith('/test/DIR1', 'latin1');
      expect(entries.length).toBe(2);
      expect(entries[0].filename).toBe('file1.txt');
    });

    it('should use latin1 encoding', async () => {
      mockReadFile.mockResolvedValue('test' as any);

      await readDirFile('/test/DIR1');

      expect(mockReadFile).toHaveBeenCalledWith('/test/DIR1', 'latin1');
    });

    it('should handle empty file', async () => {
      mockReadFile.mockResolvedValue('' as any);

      const entries = await readDirFile('/test/DIR1');

      expect(entries).toEqual([]);
    });

    it('should propagate read errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(readDirFile('/test/DIR1')).rejects.toThrow('File not found');
    });
  });

  describe('getDirFilePath', () => {
    it('should use findCaseInsensitive result if found', () => {
      mockFindCaseInsensitive.mockReturnValue('/conf1/Dir1');

      const result = getDirFilePath('/conf1', 1);

      expect(mockFindCaseInsensitive).toHaveBeenCalledWith('/conf1', 'Dir1');
      expect(result).toBe('/conf1/Dir1');
    });

    it('should fallback to uppercase if not found', () => {
      mockFindCaseInsensitive.mockReturnValue(null);

      const result = getDirFilePath('/conf1', 1);

      expect(result).toBe(path.join('/conf1', 'DIR1'));
    });

    it('should handle different directory numbers', () => {
      mockFindCaseInsensitive.mockReturnValue(null);

      expect(getDirFilePath('/conf1', 5)).toBe(path.join('/conf1', 'DIR5'));
      expect(getDirFilePath('/conf1', 10)).toBe(path.join('/conf1', 'DIR10'));
    });

    it('should handle conference with trailing slash', () => {
      mockFindCaseInsensitive.mockReturnValue(null);

      const result = getDirFilePath('/conf1/', 1);

      expect(result).toContain('DIR1');
    });
  });

  describe('getHoldDirFilePath', () => {
    it('should return hold directory path', () => {
      const result = getHoldDirFilePath('/conf1');

      expect(result).toBe(path.join('/conf1', 'hold', 'held'));
    });

    it('should handle conference with trailing slash', () => {
      const result = getHoldDirFilePath('/conf1/');

      expect(result).toContain('hold');
      expect(result).toContain('held');
    });

    it('should handle different conference paths', () => {
      expect(getHoldDirFilePath('/conf2')).toContain('conf2');
      expect(getHoldDirFilePath('/test/conf')).toContain('test');
    });
  });

  describe('Edge Cases', () => {
    it('should handle entry with very long filename', () => {
      const lines = ['verylongfile P  100K  01-Jan-25  Test'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.filename).toBe('verylongfile');
    });

    it('should handle zero-byte file size', () => {
      const lines = ['empty.txt    P  0     01-Jan-25  Empty'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.fileSize).toBe(0);
    });

    it('should handle large file sizes', () => {
      const lines = ['huge.iso     P  999G  01-Jan-25  Huge'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.fileSize).toBe(999 * 1024 * 1024 * 1024);
    });

    it('should handle continuation line at end of file', () => {
      const lines = [
        'file.txt     P  100K  01-Jan-25  Test',
        '                                 Last line',
      ];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.description).toBe('Test Last line');
      expect(entry!.rawLines.length).toBe(2);
    });

    it('should handle multiple consecutive continuation lines', () => {
      const lines = [
        'file.txt     P  100K  01-Jan-25  Line 1',
        '                                 Line 2',
        '                                 Line 3',
        '                                 Line 4',
        '                                 Line 5',
      ];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.description).toBe('Line 1 Line 2 Line 3 Line 4 Line 5');
      expect(entry!.rawLines.length).toBe(5);
    });

    it('should handle entry with no description', () => {
      const lines = ['file.txt     P  100K  01-Jan-25'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.description).toBe('');
    });

    it('should handle special characters in description', () => {
      const lines = ['file.txt     P  100K  01-Jan-25  Test!@#$%^&*()'];
      const entry = parseDirEntry(lines, 0);

      expect(entry!.description).toBe('Test!@#$%^&*()');
    });
  });
});
