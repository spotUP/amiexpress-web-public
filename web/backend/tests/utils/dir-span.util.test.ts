/**
 * Unit tests for dir-span.util.ts
 * Tests directory span parsing for file listings (express.e:26857+)
 */

import {
  parseDirSpan,
  getDirSpanPrompt,
  getDirDisplayName,
  isValidDirNum,
  DirSpan
} from '../../src/utils/dir-span.util';

describe('parseDirSpan', () => {
  describe('Special directory codes', () => {
    it('should parse U as upload directory (maxDirs)', () => {
      const result = parseDirSpan('U', 10);
      expect(result).toEqual({
        startDir: 10,
        endDir: 10,
        success: true
      });
    });

    it('should parse u (lowercase) as upload directory', () => {
      const result = parseDirSpan('u', 5);
      expect(result).toEqual({
        startDir: 5,
        endDir: 5,
        success: true
      });
    });

    it('should parse A as all directories (1 to maxDirs)', () => {
      const result = parseDirSpan('A', 8);
      expect(result).toEqual({
        startDir: 1,
        endDir: 8,
        success: true
      });
    });

    it('should parse a (lowercase) as all directories', () => {
      const result = parseDirSpan('a', 12);
      expect(result).toEqual({
        startDir: 1,
        endDir: 12,
        success: true
      });
    });

    it('should parse L as LCFILES directory (0)', () => {
      const result = parseDirSpan('L', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: true
      });
    });

    it('should parse l (lowercase) as LCFILES directory', () => {
      const result = parseDirSpan('l', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: true
      });
    });

    it('should parse H as HOLD directory with access', () => {
      const result = parseDirSpan('H', 10, true);
      expect(result).toEqual({
        startDir: -1,
        endDir: -1,
        success: true
      });
    });

    it('should parse h (lowercase) as HOLD directory with access', () => {
      const result = parseDirSpan('h', 10, true);
      expect(result).toEqual({
        startDir: -1,
        endDir: -1,
        success: true
      });
    });

    it('should deny H without HOLD access', () => {
      const result = parseDirSpan('H', 10, false);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'No access to HOLD directory'
      });
    });

    it('should deny H when hasHoldAccess not specified (defaults to false)', () => {
      const result = parseDirSpan('H', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'No access to HOLD directory'
      });
    });
  });

  describe('Numeric directory input', () => {
    it('should parse valid directory number', () => {
      const result = parseDirSpan('5', 10);
      expect(result).toEqual({
        startDir: 5,
        endDir: 5,
        success: true
      });
    });

    it('should parse minimum directory number (1)', () => {
      const result = parseDirSpan('1', 10);
      expect(result).toEqual({
        startDir: 1,
        endDir: 1,
        success: true
      });
    });

    it('should parse maximum directory number (maxDirs)', () => {
      const result = parseDirSpan('10', 10);
      expect(result).toEqual({
        startDir: 10,
        endDir: 10,
        success: true
      });
    });

    it('should reject directory number below 1', () => {
      const result = parseDirSpan('0', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'No such directory (1-10)'
      });
    });

    it('should reject negative directory number', () => {
      const result = parseDirSpan('-5', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'No such directory (1-10)'
      });
    });

    it('should reject directory number above maxDirs', () => {
      const result = parseDirSpan('15', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'No such directory (1-10)'
      });
    });

    it('should handle single directory in conference (maxDirs=1)', () => {
      const result = parseDirSpan('1', 1);
      expect(result).toEqual({
        startDir: 1,
        endDir: 1,
        success: true
      });
    });

    it('should handle large maxDirs value', () => {
      const result = parseDirSpan('999', 1000);
      expect(result).toEqual({
        startDir: 999,
        endDir: 999,
        success: true
      });
    });
  });

  describe('Edge cases and whitespace', () => {
    it('should handle leading whitespace', () => {
      const result = parseDirSpan('  A', 10);
      expect(result).toEqual({
        startDir: 1,
        endDir: 10,
        success: true
      });
    });

    it('should handle trailing whitespace', () => {
      const result = parseDirSpan('U  ', 10);
      expect(result).toEqual({
        startDir: 10,
        endDir: 10,
        success: true
      });
    });

    it('should handle whitespace around number', () => {
      const result = parseDirSpan('  5  ', 10);
      expect(result).toEqual({
        startDir: 5,
        endDir: 5,
        success: true
      });
    });

    it('should handle empty string', () => {
      const result = parseDirSpan('', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'No directory specified'
      });
    });

    it('should handle whitespace-only string', () => {
      const result = parseDirSpan('   ', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'No directory specified'
      });
    });

    it('should handle tab characters', () => {
      const result = parseDirSpan('\tA\t', 10);
      expect(result).toEqual({
        startDir: 1,
        endDir: 10,
        success: true
      });
    });
  });

  describe('Invalid input', () => {
    it('should reject non-numeric, non-letter input', () => {
      const result = parseDirSpan('@', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'Invalid directory specification'
      });
    });

    it('should reject invalid letter codes', () => {
      const result = parseDirSpan('X', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'Invalid directory specification'
      });
    });

    it('should parse alphanumeric input starting with letter (uses first char)', () => {
      // 'A5' is treated as 'A' (All directories) because first char is checked before parseInt
      const result = parseDirSpan('A5', 10);
      expect(result).toEqual({
        startDir: 1,
        endDir: 10,
        success: true
      });
    });

    it('should parse decimal numbers (parseInt truncates to integer)', () => {
      // parseInt('5.5') returns 5, so this is accepted as directory 5
      const result = parseDirSpan('5.5', 10);
      expect(result).toEqual({
        startDir: 5,
        endDir: 5,
        success: true
      });
    });

    it('should reject special characters', () => {
      const result = parseDirSpan('$5', 10);
      expect(result).toEqual({
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'Invalid directory specification'
      });
    });
  });

  describe('Return value structure', () => {
    it('should include all required fields on success', () => {
      const result = parseDirSpan('5', 10);
      expect(result).toHaveProperty('startDir');
      expect(result).toHaveProperty('endDir');
      expect(result).toHaveProperty('success');
      expect(result.error).toBeUndefined();
    });

    it('should include error field on failure', () => {
      const result = parseDirSpan('99', 10);
      expect(result).toHaveProperty('startDir');
      expect(result).toHaveProperty('endDir');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
    });

    it('should not include error field on success', () => {
      const result = parseDirSpan('A', 10);
      expect(result.error).toBeUndefined();
    });
  });
});

describe('getDirSpanPrompt', () => {
  describe('With HOLD access', () => {
    it('should include HOLD option in prompt', () => {
      const prompt = getDirSpanPrompt(10, true);
      expect(prompt).toContain('H');
      expect(prompt).toContain('old');
    });

    it('should include directory range', () => {
      const prompt = getDirSpanPrompt(10, true);
      expect(prompt).toContain('1-10');
    });

    it('should include All option', () => {
      const prompt = getDirSpanPrompt(10, true);
      expect(prompt).toContain('A');
      expect(prompt).toContain('ll');
    });

    it('should include Upload option', () => {
      const prompt = getDirSpanPrompt(10, true);
      expect(prompt).toContain('U');
      expect(prompt).toContain('pload');
    });

    it('should include Enter=none option', () => {
      const prompt = getDirSpanPrompt(10, true);
      expect(prompt).toContain('Enter');
      expect(prompt).toContain('=none');
    });

    it('should use ANSI color codes', () => {
      const prompt = getDirSpanPrompt(10, true);
      expect(prompt).toContain('\x1b[36m'); // Cyan
      expect(prompt).toContain('\x1b[32m'); // Green
      expect(prompt).toContain('\x1b[33m'); // Yellow
      expect(prompt).toContain('\x1b[0m');  // Reset
    });

    it('should handle single directory conference', () => {
      const prompt = getDirSpanPrompt(1, true);
      expect(prompt).toContain('1-1');
    });

    it('should handle large maxDirs value', () => {
      const prompt = getDirSpanPrompt(999, true);
      expect(prompt).toContain('1-999');
    });
  });

  describe('Without HOLD access', () => {
    it('should not include HOLD option in prompt', () => {
      const prompt = getDirSpanPrompt(10, false);
      expect(prompt).not.toContain('H');
      expect(prompt).not.toContain('old');
    });

    it('should include directory range', () => {
      const prompt = getDirSpanPrompt(10, false);
      expect(prompt).toContain('1-10');
    });

    it('should include All option', () => {
      const prompt = getDirSpanPrompt(10, false);
      expect(prompt).toContain('A');
      expect(prompt).toContain('ll');
    });

    it('should include Upload option', () => {
      const prompt = getDirSpanPrompt(10, false);
      expect(prompt).toContain('U');
      expect(prompt).toContain('pload');
    });

    it('should use ANSI color codes', () => {
      const prompt = getDirSpanPrompt(10, false);
      expect(prompt).toContain('\x1b[36m');
      expect(prompt).toContain('\x1b[32m');
      expect(prompt).toContain('\x1b[33m');
      expect(prompt).toContain('\x1b[0m');
    });
  });

  describe('Prompt structure', () => {
    it('should end with reset code', () => {
      const prompt = getDirSpanPrompt(10, true);
      expect(prompt).toMatch(/\x1b\[0m$/);
    });

    it('should end with question mark before reset', () => {
      const prompt = getDirSpanPrompt(10, true);
      expect(prompt).toContain('? \x1b[0m');
    });
  });
});

describe('getDirDisplayName', () => {
  describe('Special directories', () => {
    it('should return "HOLD" for directory -1', () => {
      expect(getDirDisplayName(-1, 10)).toBe('HOLD');
    });

    it('should return "LCFILES" for directory 0', () => {
      expect(getDirDisplayName(0, 10)).toBe('LCFILES');
    });

    it('should return "{num} (Upload)" for upload directory (maxDirs)', () => {
      expect(getDirDisplayName(10, 10)).toBe('10 (Upload)');
    });

    it('should handle upload directory with different maxDirs', () => {
      expect(getDirDisplayName(5, 5)).toBe('5 (Upload)');
      expect(getDirDisplayName(1, 1)).toBe('1 (Upload)');
      expect(getDirDisplayName(100, 100)).toBe('100 (Upload)');
    });
  });

  describe('Regular directories', () => {
    it('should return directory number as string', () => {
      expect(getDirDisplayName(1, 10)).toBe('1');
      expect(getDirDisplayName(5, 10)).toBe('5');
      expect(getDirDisplayName(9, 10)).toBe('9');
    });

    it('should handle first directory (not upload)', () => {
      expect(getDirDisplayName(1, 10)).toBe('1');
    });

    it('should handle middle directories', () => {
      expect(getDirDisplayName(5, 10)).toBe('5');
    });

    it('should handle directory just before upload', () => {
      expect(getDirDisplayName(9, 10)).toBe('9');
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid directory numbers gracefully', () => {
      expect(getDirDisplayName(99, 10)).toBe('99');
      expect(getDirDisplayName(-5, 10)).toBe('-5');
    });

    it('should handle zero maxDirs (dir 0 is always LCFILES)', () => {
      expect(getDirDisplayName(0, 0)).toBe('LCFILES');
    });
  });
});

describe('isValidDirNum', () => {
  describe('HOLD directory (-1)', () => {
    it('should be valid with HOLD access', () => {
      expect(isValidDirNum(-1, 10, true)).toBe(true);
    });

    it('should be invalid without HOLD access', () => {
      expect(isValidDirNum(-1, 10, false)).toBe(false);
    });
  });

  describe('LCFILES directory (0)', () => {
    it('should be valid with HOLD access', () => {
      expect(isValidDirNum(0, 10, true)).toBe(true);
    });

    it('should be valid without HOLD access', () => {
      expect(isValidDirNum(0, 10, false)).toBe(true);
    });
  });

  describe('Regular directories (1 to maxDirs)', () => {
    it('should validate minimum directory (1)', () => {
      expect(isValidDirNum(1, 10, false)).toBe(true);
      expect(isValidDirNum(1, 10, true)).toBe(true);
    });

    it('should validate maximum directory (maxDirs)', () => {
      expect(isValidDirNum(10, 10, false)).toBe(true);
      expect(isValidDirNum(10, 10, true)).toBe(true);
    });

    it('should validate middle directories', () => {
      expect(isValidDirNum(5, 10, false)).toBe(true);
      expect(isValidDirNum(7, 10, true)).toBe(true);
    });

    it('should handle single directory conference', () => {
      expect(isValidDirNum(1, 1, false)).toBe(true);
    });

    it('should handle large directory numbers', () => {
      expect(isValidDirNum(500, 1000, false)).toBe(true);
    });
  });

  describe('Invalid directory numbers', () => {
    it('should reject directory below 1', () => {
      expect(isValidDirNum(-2, 10, false)).toBe(false);
      expect(isValidDirNum(-5, 10, true)).toBe(false);
    });

    it('should reject directory above maxDirs', () => {
      expect(isValidDirNum(11, 10, false)).toBe(false);
      expect(isValidDirNum(100, 10, true)).toBe(false);
    });

    it('should reject zero maxDirs range violations', () => {
      expect(isValidDirNum(1, 0, false)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle maxDirs = 0', () => {
      expect(isValidDirNum(0, 0, false)).toBe(true);
      expect(isValidDirNum(1, 0, false)).toBe(false);
    });

    it('should handle negative maxDirs gracefully', () => {
      expect(isValidDirNum(1, -1, false)).toBe(false);
      expect(isValidDirNum(0, -1, false)).toBe(true);
    });

    it('should handle very large directory numbers', () => {
      expect(isValidDirNum(9999, 10000, false)).toBe(true);
      expect(isValidDirNum(10001, 10000, false)).toBe(false);
    });
  });
});
