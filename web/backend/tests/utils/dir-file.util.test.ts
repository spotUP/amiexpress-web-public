/**
 * DIR File Writing Utility Unit Tests
 *
 * Tests DIR file entry creation in classic BBS format
 */

// Mock dependencies BEFORE imports
const actualFs = jest.requireActual('fs');
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  appendFile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utils/file-upload.util', () => ({
  formatFileSize: jest.fn((size: number) => {
    // Mirror production default: raw bytes, right-aligned in 7 chars
    if (size <= 9999999) return String(size).padStart(7);
    return String(size);
  }),
  formatUploadDate: jest.fn((date: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate().toString().padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  }),
}));
jest.mock('../../src/utils/ascii-art.util', () => ({
  looksLikeAsciiArt: jest.fn((line: string) => {
    return line.includes('=====') || line.includes('-----');
  }),
}));

import * as path from 'path';
import * as fs from 'fs/promises';
import {
  getDirFilePath,
  buildDirEntryLine,
  buildDescriptionLines,
  buildSentByLine,
  writeDirEntry,
  writeUploadToDirFile,
} from '../../src/utils/dir-file.util';
import { formatFileSize, formatUploadDate } from '../../src/utils/file-upload.util';
import { looksLikeAsciiArt } from '../../src/utils/ascii-art.util';

describe('DIR File Writing Utility', () => {
  const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
  const mockAppendFile = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
  const mockFormatFileSize = formatFileSize as jest.MockedFunction<typeof formatFileSize>;
  const mockFormatUploadDate = formatUploadDate as jest.MockedFunction<typeof formatUploadDate>;
  const mockLooksLikeAsciiArt = looksLikeAsciiArt as jest.MockedFunction<typeof looksLikeAsciiArt>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatFileSize.mockImplementation((size: number) => {
      // Mirror production default: raw bytes, right-aligned in 7 chars
      if (size <= 9999999) return String(size).padStart(7);
      return String(size);
    });
    mockFormatUploadDate.mockImplementation((date: Date) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = date.getDate().toString().padStart(2, '0');
      const month = months[date.getMonth()];
      const year = date.getFullYear().toString().slice(-2);
      return `${day}-${month}-${year}`;
    });
    mockLooksLikeAsciiArt.mockImplementation((line: string) => {
      return line.includes('=====') || line.includes('-----');
    });
  });

  describe('getDirFilePath', () => {
    it('should return active file path with DIR number', () => {
      const result = getDirFilePath('/conf1', 'active', 5);
      expect(result).toBe(path.join('/conf1', 'DIR5'));
    });

    it('should return DIR1 by default for active status', () => {
      const result = getDirFilePath('/conf1', 'active');
      expect(result).toBe(path.join('/conf1', 'DIR1'));
    });

    it('should return HOLD/HELD for hold status', () => {
      const result = getDirFilePath('/conf1', 'hold', 5);
      expect(result).toBe(path.join('/conf1', 'HOLD', 'HELD'));
    });

    it('should return HOLD/HELD for private status', () => {
      const result = getDirFilePath('/conf1', 'private', 5);
      expect(result).toBe(path.join('/conf1', 'HOLD', 'HELD'));
    });

    it('should return LCFILES/uploads.lc for lcfiles status', () => {
      const result = getDirFilePath('/conf1', 'lcfiles', 5);
      expect(result).toBe(path.join('/conf1', 'LCFILES', 'uploads.lc'));
    });

    it('should ignore maxDirs for hold status', () => {
      const result1 = getDirFilePath('/conf1', 'hold', 1);
      const result2 = getDirFilePath('/conf1', 'hold', 99);
      expect(result1).toBe(result2);
    });

    it('should ignore maxDirs for lcfiles status', () => {
      const result1 = getDirFilePath('/conf1', 'lcfiles', 1);
      const result2 = getDirFilePath('/conf1', 'lcfiles', 99);
      expect(result1).toBe(result2);
    });

    it('should handle different maxDirs values', () => {
      expect(getDirFilePath('/conf1', 'active', 1)).toContain('DIR1');
      expect(getDirFilePath('/conf1', 'active', 10)).toContain('DIR10');
      expect(getDirFilePath('/conf1', 'active', 99)).toContain('DIR99');
    });

    it('should handle different conference paths', () => {
      expect(getDirFilePath('/conf2', 'active', 3)).toContain('conf2');
      expect(getDirFilePath('/test/conf', 'active', 3)).toContain('test');
    });
  });

  describe('buildDirEntryLine', () => {
    it('should build basic DIR entry line', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('test.txt', 123 * 1024, date, 'Test file', 'P');

      expect(line).toContain('test.txt');
      expect(line).toContain('125952'); // 123*1024=125952, raw bytes format
      expect(line).toContain('15-Jan-25');
      expect(line).toContain('Test file');
      expect(line).toMatch(/\n$/);
    });

    it('should insert status marker at position 13', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('test.txt', 1024, date, 'Test', 'P');

      expect(line[13]).toBe('P');
    });

    it('should handle P status marker', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('file.zip', 1024, date, 'Passed', 'P');

      expect(line[13]).toBe('P');
    });

    it('should handle F status marker', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('file.zip', 1024, date, 'Failed', 'F');

      expect(line[13]).toBe('F');
    });

    it('should handle N status marker', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('file.zip', 1024, date, 'Not tested', 'N');

      expect(line[13]).toBe('N');
    });

    it('should handle D status marker', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('file.zip', 1024, date, 'Duplicate', 'D');

      expect(line[13]).toBe('D');
    });

    it('should pad short filename to 13 characters', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('a.txt', 1024, date, 'Test', 'P');

      // Should have filename padded with spaces up to position 13
      expect(line.substring(0, 13)).toBe('a.txt        ');
    });

    it('should handle exactly 12 character filename', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('12chars.file', 1024, date, 'Test', 'P');

      expect(line.substring(0, 12)).toBe('12chars.file');
      expect(line[13]).toBe('P');
    });

    it('should handle LC file with long filename', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('verylongfilename.txt', 1024, date, 'LC file', 'P', true);

      expect(line).toContain('verylongfilename.txt');
      expect(line).toContain('1024'); // raw bytes format for 1024 bytes
    });

    it('should not pad LC file with long filename', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('verylongfilename.txt', 1024, date, 'LC file', 'P', true);

      // Should not have status marker at position 13 for long filenames
      expect(line).not.toMatch(/^.{13}P/);
    });

    it('should format different file sizes correctly', () => {
      const date = new Date(2025, 0, 15);

      // 500*1024=512000 → " 512000" (7 chars, 1 space + 6 digits) → pos13=P, pos14=' ' → "P 512000"
      const lineK = buildDirEntryLine('file1.txt', 500 * 1024, date, 'Test', 'P');
      expect(lineK).toContain('P 512000');

      // 5*1024*1024=5242880 → "5242880" (7 chars, no leading space) → pos13=P overwrites space, pos14='5' → "P5242880"
      const lineM = buildDirEntryLine('file2.txt', 5 * 1024 * 1024, date, 'Test', 'P');
      expect(lineM).toContain('P5242880');

      // 500 → "    500" (4 spaces + 500 = 7 chars) → pos13=P → "P    500"
      const lineBytes = buildDirEntryLine('file3.txt', 500, date, 'Test', 'P');
      expect(lineBytes).toContain('P    500');
    });

    it('should handle empty description', () => {
      const date = new Date(2025, 0, 15);
      const line = buildDirEntryLine('file.txt', 1024, date, '', 'P');

      expect(line).toContain('file.txt');
      expect(line).toMatch(/\n$/);
    });

    it('should preserve description text', () => {
      const date = new Date(2025, 0, 15);
      const desc = 'This is a test description';
      const line = buildDirEntryLine('file.txt', 1024, date, desc, 'P');

      expect(line).toContain(desc);
    });

    it('should call formatFileSize', () => {
      const date = new Date(2025, 0, 15);
      buildDirEntryLine('file.txt', 1024, date, 'Test', 'P');

      expect(mockFormatFileSize).toHaveBeenCalledWith(1024);
    });

    it('should call formatUploadDate', () => {
      const date = new Date(2025, 0, 15);
      buildDirEntryLine('file.txt', 1024, date, 'Test', 'P');

      expect(mockFormatUploadDate).toHaveBeenCalledWith(date);
    });
  });

  describe('buildDescriptionLines', () => {
    it('should format single continuation line', () => {
      const lines = ['Second line'];
      const result = buildDescriptionLines(lines);

      expect(result).toContain('Second line');
      expect(result).toMatch(/^ {33}Second line\n$/);
    });

    it('should format multiple continuation lines', () => {
      const lines = ['Line 2', 'Line 3', 'Line 4'];
      const result = buildDescriptionLines(lines);

      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
      expect(result).toContain('Line 4');
    });

    it('should indent with exactly 33 spaces', () => {
      const lines = ['Test'];
      const result = buildDescriptionLines(lines);

      expect(result.substring(0, 33)).toBe(' '.repeat(33));
    });

    it('should append newline to each line', () => {
      const lines = ['Line 1', 'Line 2'];
      const result = buildDescriptionLines(lines);

      const resultLines = result.split('\n').filter(l => l.length > 0);
      expect(resultLines).toHaveLength(2);
    });

    it('should filter out empty lines', () => {
      const lines = ['Line 1', '', 'Line 2', ''];
      const result = buildDescriptionLines(lines);

      const resultLines = result.split('\n').filter(l => l.length > 0);
      expect(resultLines).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const result = buildDescriptionLines([]);

      expect(result).toBe('');
    });

    it('should preserve special characters', () => {
      const lines = ['Test!@#$%^&*()'];
      const result = buildDescriptionLines(lines);

      expect(result).toContain('Test!@#$%^&*()');
    });

    it('should handle very long lines', () => {
      const lines = ['x'.repeat(1000)];
      const result = buildDescriptionLines(lines);

      expect(result).toContain('x'.repeat(1000));
    });
  });

  describe('buildSentByLine', () => {
    it('should format sent by line', () => {
      const result = buildSentByLine('TestUser');

      expect(result).toContain('Sent by: TestUser');
      expect(result).toMatch(/\n$/);
    });

    it('should indent with exactly 33 spaces', () => {
      const result = buildSentByLine('TestUser');

      expect(result.substring(0, 33)).toBe(' '.repeat(33));
    });

    it('should handle different usernames', () => {
      expect(buildSentByLine('Alice')).toContain('Alice');
      expect(buildSentByLine('Bob123')).toContain('Bob123');
      expect(buildSentByLine('User@Domain')).toContain('User@Domain');
    });

    it('should handle empty username', () => {
      const result = buildSentByLine('');

      expect(result).toContain('Sent by: ');
    });

    it('should handle long username', () => {
      const username = 'VeryLongUsernameHere';
      const result = buildSentByLine(username);

      expect(result).toContain(username);
    });
  });

  describe('writeDirEntry', () => {
    it('should create directory and write entry', async () => {
      const date = new Date(2025, 0, 15);
      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        'Test file',
        'P',
        'TestUser'
      );

      expect(mockMkdir).toHaveBeenCalledWith('/conf1', { recursive: true });
      expect(mockAppendFile).toHaveBeenCalledWith(
        '/conf1/DIR1',
        expect.any(String),
        'latin1'
      );
    });

    it('should use latin1 encoding', async () => {
      const date = new Date(2025, 0, 15);
      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        'Test',
        'P',
        'User'
      );

      expect(mockAppendFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'latin1'
      );
    });

    it('should include sent by line by default', async () => {
      const date = new Date(2025, 0, 15);
      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        'Test',
        'P',
        'TestUser'
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Sent by: TestUser');
    });

    it('should omit sent by line when disabled', async () => {
      const date = new Date(2025, 0, 15);
      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        'Test',
        'P',
        'TestUser',
        false
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Sent by:');
    });

    it('should handle multi-line description', async () => {
      const date = new Date(2025, 0, 15);
      const description = 'Line 1\nLine 2\nLine 3';

      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        description,
        'P',
        'User'
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Line 1');
      expect(writtenContent).toContain('Line 2');
      expect(writtenContent).toContain('Line 3');
    });

    it('uses the literal first DIZ line as primary, NOT a "more readable" filtered pick', async () => {
      // Behavior changed 2026-05-18 (commit 3716da37e) — express.e:19285
      // takes ReadStr's first line as fcomment unconditionally. The
      // previous "skip ASCII art" picking broke AquaScan rendering on
      // telnet/SSH because the door's column-aware parser expects the
      // entry's first description text to MATCH the DIZ's first line.
      const date = new Date(2025, 0, 15);
      const description = '=====\nActual description';

      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        description,
        'P',
        'User'
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      // First line MUST contain "=====" (the first DIZ line) per express.e
      // parity. "Actual description" appears on the continuation line.
      const lines = writtenContent.split('\n');
      expect(lines[0]).toContain('=====');
      expect(writtenContent).toContain('Actual description');
    });

    it('should handle description with CRLF line endings', async () => {
      const date = new Date(2025, 0, 15);
      const description = 'Line 1\r\nLine 2\r\nLine 3';

      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        description,
        'P',
        'User'
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Line 1');
      expect(writtenContent).toContain('Line 2');
    });

    it('should handle empty description lines', async () => {
      const date = new Date(2025, 0, 15);
      const description = 'Line 1\n\n\nLine 2';

      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        description,
        'P',
        'User'
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Line 1');
      expect(writtenContent).toContain('Line 2');
    });

    it('uses the literal first DIZ line as primary even when multiple art lines precede content', async () => {
      // Same parity rationale as the previous test — first DIZ line
      // becomes the entry primary even when it's `=====`. Door
      // renderers expect this exact format.
      const date = new Date(2025, 0, 15);
      const description = '=====\n-----\nReal description';

      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        description,
        'P',
        'User'
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      const firstLine = writtenContent.split('\n')[0];
      expect(firstLine).toContain('=====');
      // The "real" content still ends up in the file, just on continuation lines.
      expect(writtenContent).toContain('Real description');
    });

    it('should handle all-ASCII-art description', async () => {
      const date = new Date(2025, 0, 15);
      const description = '=====\n-----';

      await writeDirEntry(
        '/conf1/DIR1',
        'test.txt',
        1024,
        date,
        description,
        'P',
        'User'
      );

      // Should still write something
      expect(mockAppendFile).toHaveBeenCalled();
      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('=====');
    });

    it('should handle LC file flag', async () => {
      const date = new Date(2025, 0, 15);
      await writeDirEntry(
        '/conf1/LCFILES/uploads.lc',
        'verylongfilename.txt',
        1024,
        date,
        'LC file',
        'P',
        'User',
        true,
        true
      );

      expect(mockAppendFile).toHaveBeenCalled();
    });

    it('should propagate errors', async () => {
      mockAppendFile.mockRejectedValueOnce(new Error('Write failed'));

      const date = new Date(2025, 0, 15);
      await expect(
        writeDirEntry('/conf1/DIR1', 'test.txt', 1024, date, 'Test', 'P', 'User')
      ).rejects.toThrow('Write failed');
    });

    it('should handle directory creation error', async () => {
      mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));

      const date = new Date(2025, 0, 15);
      await expect(
        writeDirEntry('/conf1/DIR1', 'test.txt', 1024, date, 'Test', 'P', 'User')
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('writeUploadToDirFile', () => {
    it('should write to active DIR file', async () => {
      const date = new Date(2025, 0, 15);
      await writeUploadToDirFile(
        'test.txt',
        1024,
        date,
        'Test file',
        'P',
        'TestUser',
        '/conf1',
        'active',
        5
      );

      expect(mockAppendFile).toHaveBeenCalledWith(
        path.join('/conf1', 'DIR5'),
        expect.any(String),
        'latin1'
      );
    });

    it('should write to HOLD directory', async () => {
      const date = new Date(2025, 0, 15);
      await writeUploadToDirFile(
        'test.txt',
        1024,
        date,
        'Test',
        'P',
        'User',
        '/conf1',
        'hold',
        5
      );

      expect(mockAppendFile).toHaveBeenCalledWith(
        path.join('/conf1', 'HOLD', 'HELD'),
        expect.any(String),
        'latin1'
      );
    });

    it('should write to LCFILES directory', async () => {
      const date = new Date(2025, 0, 15);
      await writeUploadToDirFile(
        'test.txt',
        1024,
        date,
        'Test',
        'P',
        'User',
        '/conf1',
        'lcfiles',
        5
      );

      expect(mockAppendFile).toHaveBeenCalledWith(
        path.join('/conf1', 'LCFILES', 'uploads.lc'),
        expect.any(String),
        'latin1'
      );
    });

    it('should write to HOLD for private status', async () => {
      const date = new Date(2025, 0, 15);
      await writeUploadToDirFile(
        'test.txt',
        1024,
        date,
        'Test',
        'P',
        'User',
        '/conf1',
        'private',
        5
      );

      expect(mockAppendFile).toHaveBeenCalledWith(
        path.join('/conf1', 'HOLD', 'HELD'),
        expect.any(String),
        'latin1'
      );
    });

    it('should mark LC files with isLCFile flag', async () => {
      const date = new Date(2025, 0, 15);
      await writeUploadToDirFile(
        'verylongfilename.txt',
        1024,
        date,
        'LC file',
        'P',
        'User',
        '/conf1',
        'lcfiles',
        5
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('verylongfilename.txt');
    });

    it('should include sent by line by default', async () => {
      const date = new Date(2025, 0, 15);
      await writeUploadToDirFile(
        'test.txt',
        1024,
        date,
        'Test',
        'P',
        'TestUser',
        '/conf1',
        'active',
        1
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Sent by: TestUser');
    });

    it('should omit sent by line when disabled', async () => {
      const date = new Date(2025, 0, 15);
      await writeUploadToDirFile(
        'test.txt',
        1024,
        date,
        'Test',
        'P',
        'TestUser',
        '/conf1',
        'active',
        1,
        false
      );

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Sent by:');
    });

    it('should use default maxDirs of 1', async () => {
      const date = new Date(2025, 0, 15);
      await writeUploadToDirFile(
        'test.txt',
        1024,
        date,
        'Test',
        'P',
        'User',
        '/conf1',
        'active'
      );

      expect(mockAppendFile).toHaveBeenCalledWith(
        path.join('/conf1', 'DIR1'),
        expect.any(String),
        'latin1'
      );
    });

    it('should handle different status markers', async () => {
      const date = new Date(2025, 0, 15);

      await writeUploadToDirFile('f1.txt', 1024, date, 'Test', 'P', 'User', '/conf1', 'active', 1);
      await writeUploadToDirFile('f2.txt', 1024, date, 'Test', 'F', 'User', '/conf1', 'active', 1);
      await writeUploadToDirFile('f3.txt', 1024, date, 'Test', 'N', 'User', '/conf1', 'active', 1);
      await writeUploadToDirFile('f4.txt', 1024, date, 'Test', 'D', 'User', '/conf1', 'active', 1);

      expect(mockAppendFile).toHaveBeenCalledTimes(4);
    });

    it('should propagate errors', async () => {
      mockAppendFile.mockRejectedValueOnce(new Error('Write failed'));

      const date = new Date(2025, 0, 15);
      await expect(
        writeUploadToDirFile('test.txt', 1024, date, 'Test', 'P', 'User', '/conf1', 'active', 1)
      ).rejects.toThrow('Write failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-byte file', async () => {
      const date = new Date(2025, 0, 15);
      await writeDirEntry('/conf1/DIR1', 'empty.txt', 0, date, 'Empty', 'P', 'User');

      expect(mockAppendFile).toHaveBeenCalled();
    });

    it('should handle very large file size', async () => {
      const date = new Date(2025, 0, 15);
      const size = 999 * 1024 * 1024; // 999M
      await writeDirEntry('/conf1/DIR1', 'huge.iso', size, date, 'Huge', 'P', 'User');

      expect(mockAppendFile).toHaveBeenCalled();
    });

    it('should handle special characters in filename', async () => {
      const date = new Date(2025, 0, 15);
      await writeDirEntry('/conf1/DIR1', 'file-name_v2.1.txt', 1024, date, 'Test', 'P', 'User');

      expect(mockAppendFile).toHaveBeenCalled();
    });

    it('should handle special characters in description', async () => {
      const date = new Date(2025, 0, 15);
      const desc = 'Test !@#$%^&*()';
      await writeDirEntry('/conf1/DIR1', 'test.txt', 1024, date, desc, 'P', 'User');

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain(desc);
    });

    it('should handle very long description lines', async () => {
      const date = new Date(2025, 0, 15);
      const desc = 'x'.repeat(1000);
      await writeDirEntry('/conf1/DIR1', 'test.txt', 1024, date, desc, 'P', 'User');

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('x'.repeat(1000));
    });

    it('should handle description with only whitespace lines', async () => {
      const date = new Date(2025, 0, 15);
      const desc = '   \n   \nReal text';
      await writeDirEntry('/conf1/DIR1', 'test.txt', 1024, date, desc, 'P', 'User');

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Real text');
    });

    it('should handle username with special characters', async () => {
      const date = new Date(2025, 0, 15);
      await writeDirEntry('/conf1/DIR1', 'test.txt', 1024, date, 'Test', 'P', 'User@Domain.com');

      const writtenContent = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Sent by: User@Domain.com');
    });
  });
});
