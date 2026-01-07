/**
 * Unit tests for params.util.ts
 * Tests parameter parsing utility for command line arguments
 */

import { ParamsUtil } from '../../src/utils/params.util';

describe('ParamsUtil', () => {
  describe('parse', () => {
    it('should parse space-separated parameters', () => {
      const result = ParamsUtil.parse('NS R 1-10');
      expect(result).toEqual(['NS', 'R', '1-10']);
    });

    it('should convert parameters to uppercase', () => {
      const result = ParamsUtil.parse('ns r myfile.txt');
      expect(result).toEqual(['NS', 'R', 'MYFILE.TXT']);
    });

    it('should filter empty strings', () => {
      const result = ParamsUtil.parse('NS  R   1-10');  // Multiple spaces
      expect(result).toEqual(['NS', 'R', '1-10']);
    });

    it('should return empty array for empty string', () => {
      const result = ParamsUtil.parse('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace only', () => {
      const result = ParamsUtil.parse('   ');
      expect(result).toEqual([]);
    });

    it('should handle single parameter', () => {
      const result = ParamsUtil.parse('NS');
      expect(result).toEqual(['NS']);
    });

    it('should trim individual parameters', () => {
      const result = ParamsUtil.parse(' NS  R  1-10 ');
      expect(result).toEqual(['NS', 'R', '1-10']);
    });

    it('should handle mixed case input', () => {
      const result = ParamsUtil.parse('Ns rR MixedCase');
      expect(result).toEqual(['NS', 'RR', 'MIXEDCASE']);
    });
  });

  describe('hasFlag', () => {
    it('should return true if flag is present', () => {
      const params = ['NS', 'R', '1-10'];
      expect(ParamsUtil.hasFlag(params, 'NS')).toBe(true);
      expect(ParamsUtil.hasFlag(params, 'R')).toBe(true);
    });

    it('should return false if flag is not present', () => {
      const params = ['NS', 'R', '1-10'];
      expect(ParamsUtil.hasFlag(params, 'F')).toBe(false);
      expect(ParamsUtil.hasFlag(params, 'Q')).toBe(false);
    });

    it('should be case-insensitive', () => {
      const params = ['NS', 'R'];
      expect(ParamsUtil.hasFlag(params, 'ns')).toBe(true);
      expect(ParamsUtil.hasFlag(params, 'Ns')).toBe(true);
      expect(ParamsUtil.hasFlag(params, 'NS')).toBe(true);
    });

    it('should return false for empty params array', () => {
      const params: string[] = [];
      expect(ParamsUtil.hasFlag(params, 'NS')).toBe(false);
    });

    it('should handle numeric flags', () => {
      const params = ['1', '2', '3'];
      expect(ParamsUtil.hasFlag(params, '1')).toBe(true);
      expect(ParamsUtil.hasFlag(params, '4')).toBe(false);
    });
  });

  describe('extractRange', () => {
    it('should extract valid range', () => {
      const params = ['NS', '1-10', 'R'];
      const range = ParamsUtil.extractRange(params);
      expect(range).toEqual({ start: 1, end: 10 });
    });

    it('should return first range if multiple present', () => {
      const params = ['1-10', '20-30'];
      const range = ParamsUtil.extractRange(params);
      expect(range).toEqual({ start: 1, end: 10 });
    });

    it('should return null if no range found', () => {
      const params = ['NS', 'R', 'Q'];
      const range = ParamsUtil.extractRange(params);
      expect(range).toBeNull();
    });

    it('should handle large range numbers', () => {
      const params = ['1000-5000'];
      const range = ParamsUtil.extractRange(params);
      expect(range).toEqual({ start: 1000, end: 5000 });
    });

    it('should not match single numbers', () => {
      const params = ['100'];
      const range = ParamsUtil.extractRange(params);
      expect(range).toBeNull();
    });

    it('should not match invalid format', () => {
      const params = ['1--10', 'a-b', '1-'];
      const range = ParamsUtil.extractRange(params);
      expect(range).toBeNull();
    });

    it('should handle range at end of params', () => {
      const params = ['NS', 'R', '50-100'];
      const range = ParamsUtil.extractRange(params);
      expect(range).toEqual({ start: 50, end: 100 });
    });

    it('should handle empty params array', () => {
      const params: string[] = [];
      const range = ParamsUtil.extractRange(params);
      expect(range).toBeNull();
    });
  });

  describe('extractNumber', () => {
    it('should extract first number from params', () => {
      const params = ['NS', '10', 'R'];
      const num = ParamsUtil.extractNumber(params);
      expect(num).toBe(10);
    });

    it('should return first number if multiple present', () => {
      const params = ['10', '20', '30'];
      const num = ParamsUtil.extractNumber(params);
      expect(num).toBe(10);
    });

    it('should return null if no number found', () => {
      const params = ['NS', 'R', 'Q'];
      const num = ParamsUtil.extractNumber(params);
      expect(num).toBeNull();
    });

    it('should not match ranges', () => {
      const params = ['1-10'];
      const num = ParamsUtil.extractNumber(params);
      expect(num).toBeNull();
    });

    it('should handle large numbers', () => {
      const params = ['99999'];
      const num = ParamsUtil.extractNumber(params);
      expect(num).toBe(99999);
    });

    it('should not match alphanumeric strings', () => {
      const params = ['FILE10', '20ABC'];
      const num = ParamsUtil.extractNumber(params);
      expect(num).toBeNull();
    });

    it('should handle zero', () => {
      const params = ['0'];
      const num = ParamsUtil.extractNumber(params);
      expect(num).toBe(0);
    });

    it('should handle empty params array', () => {
      const params: string[] = [];
      const num = ParamsUtil.extractNumber(params);
      expect(num).toBeNull();
    });

    it('should not match negative numbers', () => {
      const params = ['-10'];
      const num = ParamsUtil.extractNumber(params);
      expect(num).toBeNull();
    });
  });

  describe('extractDate', () => {
    it('should extract valid MM/DD/YY date', () => {
      const params = ['NS', '01/15/23', 'R'];
      const date = ParamsUtil.extractDate(params);
      expect(date).toBeInstanceOf(Date);
      expect(date!.getFullYear()).toBe(2023);
      expect(date!.getMonth()).toBe(0); // January (0-indexed)
      expect(date!.getDate()).toBe(15);
    });

    it('should extract valid MM/DD/YYYY date', () => {
      const params = ['NS', '06/20/2024', 'R'];
      const date = ParamsUtil.extractDate(params);
      expect(date).toBeInstanceOf(Date);
      expect(date!.getFullYear()).toBe(2024);
      expect(date!.getMonth()).toBe(5); // June (0-indexed)
      expect(date!.getDate()).toBe(20);
    });

    it('should handle 2-digit year < 50 as 2000+', () => {
      const params = ['12/31/49'];
      const date = ParamsUtil.extractDate(params);
      expect(date!.getFullYear()).toBe(2049);
    });

    it('should handle 2-digit year >= 50 as 1900+', () => {
      const params = ['01/01/50'];
      const date = ParamsUtil.extractDate(params);
      expect(date!.getFullYear()).toBe(1950);
    });

    it('should handle 2-digit year >= 90 as 1900+', () => {
      const params = ['07/04/99'];
      const date = ParamsUtil.extractDate(params);
      expect(date!.getFullYear()).toBe(1999);
    });

    it('should return null if no date found', () => {
      const params = ['NS', 'R', 'Q'];
      const date = ParamsUtil.extractDate(params);
      expect(date).toBeNull();
    });

    it('should not match invalid date format', () => {
      const params = ['2023-01-15', '1/1/1', 'NOTADATE'];
      const date = ParamsUtil.extractDate(params);
      expect(date).toBeNull();
    });

    it('should handle single digit month and day', () => {
      const params = ['1/5/23'];
      const date = ParamsUtil.extractDate(params);
      expect(date!.getMonth()).toBe(0); // January
      expect(date!.getDate()).toBe(5);
    });

    it('should handle double digit month and day', () => {
      const params = ['12/25/2024'];
      const date = ParamsUtil.extractDate(params);
      expect(date!.getMonth()).toBe(11); // December
      expect(date!.getDate()).toBe(25);
    });

    it('should return first date if multiple present', () => {
      const params = ['01/15/23', '02/20/24'];
      const date = ParamsUtil.extractDate(params);
      expect(date!.getFullYear()).toBe(2023);
      expect(date!.getMonth()).toBe(0);
    });

    it('should handle empty params array', () => {
      const params: string[] = [];
      const date = ParamsUtil.extractDate(params);
      expect(date).toBeNull();
    });

    it('should handle date at end of params', () => {
      const params = ['NS', 'R', '03/15/2025'];
      const date = ParamsUtil.extractDate(params);
      expect(date!.getFullYear()).toBe(2025);
      expect(date!.getMonth()).toBe(2); // March
      expect(date!.getDate()).toBe(15);
    });
  });

  describe('Integration tests', () => {
    it('should handle complex parameter string with all types', () => {
      const paramStr = 'NS R 1-10 05/15/23 MYFILE';
      const params = ParamsUtil.parse(paramStr);

      expect(ParamsUtil.hasFlag(params, 'NS')).toBe(true);
      expect(ParamsUtil.hasFlag(params, 'R')).toBe(true);
      expect(ParamsUtil.extractRange(params)).toEqual({ start: 1, end: 10 });

      const date = ParamsUtil.extractDate(params);
      expect(date!.getFullYear()).toBe(2023);
      expect(date!.getMonth()).toBe(4); // May
      expect(date!.getDate()).toBe(15);
    });

    it('should handle file listing scan parameters', () => {
      const params = ParamsUtil.parse('NS U F 1-50');

      expect(ParamsUtil.hasFlag(params, 'NS')).toBe(true); // Non-stop
      expect(ParamsUtil.hasFlag(params, 'U')).toBe(true);  // Upload
      expect(ParamsUtil.hasFlag(params, 'F')).toBe(true);  // Flag
      expect(ParamsUtil.extractRange(params)).toEqual({ start: 1, end: 50 });
    });

    it('should handle message scan parameters', () => {
      const params = ParamsUtil.parse('R NS 100-200');

      expect(ParamsUtil.hasFlag(params, 'R')).toBe(true);  // Read
      expect(ParamsUtil.hasFlag(params, 'NS')).toBe(true); // Non-stop
      expect(ParamsUtil.extractRange(params)).toEqual({ start: 100, end: 200 });
    });

    it('should handle empty or whitespace gracefully', () => {
      const params1 = ParamsUtil.parse('');
      const params2 = ParamsUtil.parse('   ');

      expect(params1).toEqual([]);
      expect(params2).toEqual([]);
      expect(ParamsUtil.hasFlag(params1, 'NS')).toBe(false);
      expect(ParamsUtil.extractRange(params2)).toBeNull();
    });
  });
});
