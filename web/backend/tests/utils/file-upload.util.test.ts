/**
 * Unit tests for file-upload.util.ts
 * Tests file upload validation and formatting (express.e file upload functions)
 */

import {
  validateFilename,
  FileStatus,
  getFileStatusMarker,
  formatFileSize,
  formatUploadDate,
  isPrivateUpload,
  capitalizeFilename,
  buildDirFileEntry,
  addSentByLine
} from '../../src/utils/file-upload.util';

describe('file-upload.util', () => {
  describe('validateFilename', () => {
    it('should accept valid filenames', () => {
      expect(validateFilename('test.txt')).toEqual({ valid: true });
      expect(validateFilename('FILE.ZIP')).toEqual({ valid: true });
      expect(validateFilename('data.lha')).toEqual({ valid: true });
      expect(validateFilename('prog.exe')).toEqual({ valid: true });
    });

    it('should reject RZ as filename', () => {
      const result = validateFilename('RZ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('RZ is an invalid name for a file');
    });

    it('should reject RZ variants (less than 4 chars)', () => {
      expect(validateFilename('rz').valid).toBe(false);
      expect(validateFilename('RZA').valid).toBe(false);
      expect(validateFilename('rz1').valid).toBe(false);
    });

    it('should accept RZ variants with 4+ chars', () => {
      expect(validateFilename('RZAA').valid).toBe(true);
      expect(validateFilename('RZ12').valid).toBe(true);
      expect(validateFilename('rzdata.zip').valid).toBe(true);
    });

    it('should reject colon character', () => {
      const result = validateFilename('file:test.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You may not include any special symbols');
    });

    it('should reject slash character', () => {
      const result = validateFilename('dir/file.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You may not include any special symbols');
    });

    it('should reject asterisk character', () => {
      const result = validateFilename('file*.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You may not include any special symbols');
    });

    it('should reject space character', () => {
      const result = validateFilename('my file.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You may not include any special symbols');
    });

    it('should reject hash character', () => {
      const result = validateFilename('file#1.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You may not include any special symbols');
    });

    it('should reject plus character', () => {
      const result = validateFilename('file+.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You may not include any special symbols');
    });

    it('should reject question mark character', () => {
      const result = validateFilename('file?.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You may not include any special symbols');
    });

    it('should reject filenames longer than 12 characters', () => {
      const result = validateFilename('verylongfilename.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Files longer than 12 characters are not allowed');
    });

    it('should accept exactly 12 character filenames', () => {
      expect(validateFilename('exactly12chr').valid).toBe(true);
    });

    it('should reject empty filename', () => {
      const result = validateFilename('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Filename cannot be empty');
    });

    it('should accept filenames with dots', () => {
      expect(validateFilename('file.tar.gz').valid).toBe(true);
    });

    it('should accept filenames with underscores', () => {
      expect(validateFilename('my_file.txt').valid).toBe(true);
    });

    it('should accept filenames with hyphens', () => {
      expect(validateFilename('my-file.txt').valid).toBe(true);
    });
  });

  describe('getFileStatusMarker', () => {
    it('should return D for duplicate files', () => {
      expect(getFileStatusMarker(true, 'not_tested', false)).toBe(FileStatus.DUPLICATE);
      expect(getFileStatusMarker(true, 'success', false)).toBe(FileStatus.DUPLICATE);
      expect(getFileStatusMarker(true, 'failure', false)).toBe(FileStatus.DUPLICATE);
      expect(getFileStatusMarker(true, 'not_tested', true)).toBe(FileStatus.DUPLICATE);
    });

    it('should return / for private uploads', () => {
      expect(getFileStatusMarker(false, 'not_tested', true)).toBe(FileStatus.PRIVATE);
      expect(getFileStatusMarker(false, 'success', true)).toBe(FileStatus.PRIVATE);
      expect(getFileStatusMarker(false, 'failure', true)).toBe(FileStatus.PRIVATE);
    });

    it('should return F for failed test', () => {
      expect(getFileStatusMarker(false, 'failure', false)).toBe(FileStatus.FAILED);
    });

    it('should return P for passed test', () => {
      expect(getFileStatusMarker(false, 'success', false)).toBe(FileStatus.PASSED);
    });

    it('should return N for not tested', () => {
      expect(getFileStatusMarker(false, 'not_tested', false)).toBe(FileStatus.NOT_TESTED);
    });

    it('should prioritize duplicate over all other statuses', () => {
      expect(getFileStatusMarker(true, 'failure', true)).toBe(FileStatus.DUPLICATE);
    });

    it('should prioritize private over test status', () => {
      expect(getFileStatusMarker(false, 'failure', true)).toBe(FileStatus.PRIVATE);
      expect(getFileStatusMarker(false, 'success', true)).toBe(FileStatus.PRIVATE);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes as KB with K suffix', () => {
      expect(formatFileSize(1024)).toBe('    1K');
      expect(formatFileSize(2048)).toBe('    2K');
      expect(formatFileSize(10240)).toBe('   10K');
    });

    it('should round up partial KB', () => {
      expect(formatFileSize(1500)).toBe('    2K');
      expect(formatFileSize(1)).toBe('    1K');
      expect(formatFileSize(1023)).toBe('    1K');
    });

    it('should pad to 6 characters', () => {
      expect(formatFileSize(1024)).toHaveLength(6);
      expect(formatFileSize(10240)).toHaveLength(6);
      expect(formatFileSize(102400)).toHaveLength(6);
      expect(formatFileSize(1024000)).toHaveLength(6);
    });

    it('should handle zero bytes', () => {
      expect(formatFileSize(0)).toBe('    0K');
    });

    it('should handle large files', () => {
      expect(formatFileSize(1048576)).toBe(' 1024K'); // 1 MB
      expect(formatFileSize(10485760)).toBe('10240K'); // 10 MB
    });

    it('should handle very large files', () => {
      expect(formatFileSize(104857600)).toBe('102400K'); // 100 MB - note no padding when > 5 digits
    });

    it('should handle single byte', () => {
      expect(formatFileSize(1)).toBe('    1K');
    });
  });

  describe('formatUploadDate', () => {
    it('should format date as DD-Mon-YY', () => {
      const date = new Date('2026-01-07');
      expect(formatUploadDate(date)).toBe('07-Jan-26');
    });

    it('should pad single-digit days', () => {
      const date = new Date('2026-01-01');
      expect(formatUploadDate(date)).toBe('01-Jan-26');
    });

    it('should handle all months', () => {
      expect(formatUploadDate(new Date('2026-01-15'))).toBe('15-Jan-26');
      expect(formatUploadDate(new Date('2026-02-15'))).toBe('15-Feb-26');
      expect(formatUploadDate(new Date('2026-03-15'))).toBe('15-Mar-26');
      expect(formatUploadDate(new Date('2026-04-15'))).toBe('15-Apr-26');
      expect(formatUploadDate(new Date('2026-05-15'))).toBe('15-May-26');
      expect(formatUploadDate(new Date('2026-06-15'))).toBe('15-Jun-26');
      expect(formatUploadDate(new Date('2026-07-15'))).toBe('15-Jul-26');
      expect(formatUploadDate(new Date('2026-08-15'))).toBe('15-Aug-26');
      expect(formatUploadDate(new Date('2026-09-15'))).toBe('15-Sep-26');
      expect(formatUploadDate(new Date('2026-10-15'))).toBe('15-Oct-26');
      expect(formatUploadDate(new Date('2026-11-15'))).toBe('15-Nov-26');
      expect(formatUploadDate(new Date('2026-12-15'))).toBe('15-Dec-26');
    });

    it('should use 2-digit year', () => {
      expect(formatUploadDate(new Date('2026-01-01'))).toBe('01-Jan-26');
      expect(formatUploadDate(new Date('1999-12-31'))).toBe('31-Dec-99');
      expect(formatUploadDate(new Date('2000-01-01'))).toBe('01-Jan-00');
    });

    it('should handle end of month dates', () => {
      expect(formatUploadDate(new Date('2026-01-31'))).toBe('31-Jan-26');
      expect(formatUploadDate(new Date('2026-02-28'))).toBe('28-Feb-26');
      expect(formatUploadDate(new Date('2024-02-29'))).toBe('29-Feb-24'); // Leap year
    });
  });

  describe('isPrivateUpload', () => {
    it('should return true when description starts with /', () => {
      expect(isPrivateUpload('/Private file')).toBe(true);
      expect(isPrivateUpload('/')).toBe(true);
      expect(isPrivateUpload('/For sysop only')).toBe(true);
    });

    it('should return false when description does not start with /', () => {
      expect(isPrivateUpload('Public file')).toBe(false);
      expect(isPrivateUpload('')).toBe(false);
      expect(isPrivateUpload('File / document')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isPrivateUpload('/private')).toBe(true);
      expect(isPrivateUpload('/PRIVATE')).toBe(true);
    });
  });

  describe('capitalizeFilename', () => {
    it('should capitalize when flag is true', () => {
      expect(capitalizeFilename('test.txt', true)).toBe('TEST.TXT');
      expect(capitalizeFilename('MyFile.zip', true)).toBe('MYFILE.ZIP');
      expect(capitalizeFilename('lowercase', true)).toBe('LOWERCASE');
    });

    it('should not capitalize when flag is false', () => {
      expect(capitalizeFilename('test.txt', false)).toBe('test.txt');
      expect(capitalizeFilename('MyFile.zip', false)).toBe('MyFile.zip');
      expect(capitalizeFilename('UPPERCASE', false)).toBe('UPPERCASE');
    });

    it('should handle empty string', () => {
      expect(capitalizeFilename('', true)).toBe('');
      expect(capitalizeFilename('', false)).toBe('');
    });

    it('should handle already uppercase files', () => {
      expect(capitalizeFilename('FILE.TXT', true)).toBe('FILE.TXT');
    });
  });

  describe('buildDirFileEntry', () => {
    it('should build DIR file entry with correct format', () => {
      const entry = buildDirFileEntry(
        'test.txt',
        '    5K',
        '07-Jan-26',
        'Test file',
        'P'
      );

      expect(entry).toBe('test.txt    P     5K  07-Jan-26  Test file');
    });

    it('should place status marker at position 13 for short filenames', () => {
      const entry = buildDirFileEntry('a.txt', '   10K', '01-Jan-26', 'File', 'N');
      expect(entry[12]).toBe('N'); // Status marker at position 13 (0-indexed = 12)
    });

    it('should handle exactly 12 character filenames', () => {
      const entry = buildDirFileEntry(
        'exactly12chr',
        '    5K',
        '07-Jan-26',
        'Desc',
        'P'
      );

      expect(entry).toBe('exactly12chrP     5K  07-Jan-26  Desc');
    });

    it('should handle exactly 12 character filenames with status marker', () => {
      // 'verylongname' is 12 chars, so status marker gets added at position 13
      const entry = buildDirFileEntry(
        'verylongname',
        '    5K',
        '07-Jan-26',
        'Desc',
        'F'
      );

      expect(entry).toBe('verylongnameF     5K  07-Jan-26  Desc');
    });

    it('should handle 13+ character filenames without status marker', () => {
      // Filenames >= 13 chars don't get status marker inserted
      const entry = buildDirFileEntry(
        'verylongname1',
        '    5K',
        '07-Jan-26',
        'Desc',
        'F'
      );

      expect(entry).toBe('verylongname1     5K  07-Jan-26  Desc');
    });

    it('should handle all status markers', () => {
      expect(buildDirFileEntry('f', '  1K', '01-Jan-26', 'D', 'P')).toContain('P');
      expect(buildDirFileEntry('f', '  1K', '01-Jan-26', 'D', 'F')).toContain('F');
      expect(buildDirFileEntry('f', '  1K', '01-Jan-26', 'D', 'N')).toContain('N');
      expect(buildDirFileEntry('f', '  1K', '01-Jan-26', 'D', 'D')).toContain('D');
      expect(buildDirFileEntry('f', '  1K', '01-Jan-26', 'D', '/')).toContain('/');
    });

    it('should handle empty description', () => {
      const entry = buildDirFileEntry('file.txt', '   5K', '07-Jan-26', '', 'P');
      expect(entry).toBe('file.txt    P    5K  07-Jan-26  ');
    });

    it('should handle long descriptions', () => {
      const longDesc = 'This is a very long description that exceeds typical length';
      const entry = buildDirFileEntry('file.txt', '   5K', '07-Jan-26', longDesc, 'P');
      expect(entry).toContain(longDesc);
    });

    it('should preserve whitespace in description', () => {
      const entry = buildDirFileEntry('file.txt', '   5K', '07-Jan-26', '  Indented  ', 'P');
      expect(entry).toBe('file.txt    P    5K  07-Jan-26    Indented  ');
    });
  });

  describe('addSentByLine', () => {
    it('should add "Sent by:" line when flag is true', () => {
      const desc = ['First line', 'Second line'];
      const result = addSentByLine(desc, 'testuser', true);

      expect(result).toEqual([
        'First line',
        'Second line',
        'Sent by: testuser'
      ]);
    });

    it('should not add "Sent by:" line when flag is false', () => {
      const desc = ['First line', 'Second line'];
      const result = addSentByLine(desc, 'testuser', false);

      expect(result).toEqual(['First line', 'Second line']);
    });

    it('should handle empty description array', () => {
      const result = addSentByLine([], 'testuser', true);
      expect(result).toEqual(['Sent by: testuser']);
    });

    it('should handle single-line description', () => {
      const result = addSentByLine(['Only line'], 'testuser', true);
      expect(result).toEqual(['Only line', 'Sent by: testuser']);
    });

    it('should not modify original array', () => {
      const original = ['Line 1', 'Line 2'];
      const result = addSentByLine(original, 'testuser', true);

      expect(original).toEqual(['Line 1', 'Line 2']);
      expect(result).toEqual(['Line 1', 'Line 2', 'Sent by: testuser']);
      expect(result).not.toBe(original);
    });

    it('should handle usernames with special characters', () => {
      const result = addSentByLine(['File'], 'User-123_Test', true);
      expect(result).toEqual(['File', 'Sent by: User-123_Test']);
    });

    it('should handle empty username', () => {
      const result = addSentByLine(['File'], '', true);
      expect(result).toEqual(['File', 'Sent by: ']);
    });
  });

  describe('FileStatus enum', () => {
    it('should have correct status values', () => {
      expect(FileStatus.PASSED).toBe('P');
      expect(FileStatus.FAILED).toBe('F');
      expect(FileStatus.NOT_TESTED).toBe('N');
      expect(FileStatus.DUPLICATE).toBe('D');
      expect(FileStatus.PRIVATE).toBe('/');
      expect(FileStatus.HOLD).toBe('H');
      expect(FileStatus.LCFILES).toBe('L');
    });
  });

  describe('Edge cases', () => {
    it('should handle filenames with multiple dots', () => {
      expect(validateFilename('a.b.c.d').valid).toBe(true);
    });

    it('should handle filenames with numbers', () => {
      expect(validateFilename('file123.txt').valid).toBe(true);
    });

    it('should handle all lowercase filenames', () => {
      expect(validateFilename('lowercase').valid).toBe(true);
    });

    it('should handle all uppercase filenames', () => {
      expect(validateFilename('UPPERCASE').valid).toBe(true);
    });

    it('should handle mixed case filenames', () => {
      expect(validateFilename('MiXeD.CaSe').valid).toBe(true);
    });

    it('should handle formatFileSize with negative bytes gracefully', () => {
      // Math.ceil of negative divided by 1024 would be negative
      // But this is an edge case that shouldn't happen in practice
      const result = formatFileSize(-1024);
      expect(result).toContain('K');
    });

    it('should handle formatUploadDate with different timezones', () => {
      // Date should work regardless of timezone
      const date = new Date(Date.UTC(2026, 0, 7)); // Jan 7, 2026 UTC
      const result = formatUploadDate(date);
      expect(result).toMatch(/\d{2}-[A-Z][a-z]{2}-\d{2}/);
    });

    it('should handle buildDirFileEntry with special chars in description', () => {
      const entry = buildDirFileEntry('file.txt', '   5K', '07-Jan-26', 'Desc with / and * chars', 'P');
      expect(entry).toContain('Desc with / and * chars');
    });
  });
});
