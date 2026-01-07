/**
 * String Utility Unit Tests
 *
 * Tests all string manipulation and comparison functions for AmiExpress compatibility.
 * Validates case-insensitive operations, null handling, and edge cases.
 */

import {
  stringCompare,
  stringStartsWith,
  upperChars,
  lowerChars,
  fullTrim,
  removeSlashes,
  removeLeadingSlashes,
  padString,
  truncateString,
  containsIgnoreCase,
  replaceAll,
  replaceAllIgnoreCase,
  splitAndTrim,
  joinStrings,
  repeatString,
  reverseString,
  countOccurrences,
  escapeRegex,
} from '../../src/utils/string-util';

describe('String Utility Functions', () => {
  describe('stringCompare', () => {
    it('should return true for exact matches', () => {
      expect(stringCompare('test', 'test')).toBe(true);
      expect(stringCompare('ABC', 'ABC')).toBe(true);
    });

    it('should return true for case-insensitive matches', () => {
      expect(stringCompare('Test', 'test')).toBe(true);
      expect(stringCompare('ABC', 'abc')).toBe(true);
      expect(stringCompare('MixedCase', 'MIXEDCASE')).toBe(true);
    });

    it('should return false for non-matches', () => {
      expect(stringCompare('test', 'different')).toBe(false);
      expect(stringCompare('abc', 'xyz')).toBe(false);
    });

    it('should handle null values', () => {
      expect(stringCompare(null as any, null as any)).toBe(true);
      expect(stringCompare('test', null as any)).toBe(false);
      expect(stringCompare(null as any, 'test')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(stringCompare('', '')).toBe(true);
      expect(stringCompare('test', '')).toBe(false);
      expect(stringCompare('', 'test')).toBe(false);
    });
  });

  describe('stringStartsWith', () => {
    it('should return true when string starts with prefix', () => {
      expect(stringStartsWith('hello world', 'hello')).toBe(true);
      expect(stringStartsWith('testing', 'test')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(stringStartsWith('Hello', 'hello')).toBe(true);
      expect(stringStartsWith('TESTING', 'test')).toBe(true);
      expect(stringStartsWith('MixedCase', 'mixed')).toBe(true);
    });

    it('should return false when string does not start with prefix', () => {
      expect(stringStartsWith('hello', 'world')).toBe(false);
      expect(stringStartsWith('testing', 'xyz')).toBe(false);
    });

    it('should handle null values', () => {
      expect(stringStartsWith(null as any, 'test')).toBe(false);
      expect(stringStartsWith('test', null as any)).toBe(false);
      expect(stringStartsWith(null as any, null as any)).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(stringStartsWith('test', '')).toBe(true); // All strings start with empty string
      expect(stringStartsWith('', 'test')).toBe(false);
    });
  });

  describe('upperChars', () => {
    it('should convert lowercase to uppercase', () => {
      expect(upperChars('hello')).toBe('HELLO');
      expect(upperChars('test')).toBe('TEST');
    });

    it('should preserve uppercase', () => {
      expect(upperChars('HELLO')).toBe('HELLO');
    });

    it('should handle mixed case', () => {
      expect(upperChars('Hello World')).toBe('HELLO WORLD');
    });

    it('should handle null values', () => {
      expect(upperChars(null as any)).toBe('');
    });

    it('should handle empty strings', () => {
      expect(upperChars('')).toBe('');
    });

    it('should handle special characters', () => {
      expect(upperChars('test123!@#')).toBe('TEST123!@#');
    });
  });

  describe('lowerChars', () => {
    it('should convert uppercase to lowercase', () => {
      expect(lowerChars('HELLO')).toBe('hello');
      expect(lowerChars('TEST')).toBe('test');
    });

    it('should preserve lowercase', () => {
      expect(lowerChars('hello')).toBe('hello');
    });

    it('should handle mixed case', () => {
      expect(lowerChars('Hello World')).toBe('hello world');
    });

    it('should handle null values', () => {
      expect(lowerChars(null as any)).toBe('');
    });

    it('should handle empty strings', () => {
      expect(lowerChars('')).toBe('');
    });
  });

  describe('fullTrim', () => {
    it('should trim whitespace from both ends', () => {
      expect(fullTrim('  test  ')).toBe('test');
      expect(fullTrim('  hello world  ')).toBe('hello world');
    });

    it('should trim tabs and newlines', () => {
      expect(fullTrim('\t\ntest\t\n')).toBe('test');
    });

    it('should preserve internal whitespace', () => {
      expect(fullTrim('  hello   world  ')).toBe('hello   world');
    });

    it('should handle strings without whitespace', () => {
      expect(fullTrim('test')).toBe('test');
    });

    it('should handle null values', () => {
      expect(fullTrim(null as any)).toBe('');
    });

    it('should handle empty strings', () => {
      expect(fullTrim('')).toBe('');
      expect(fullTrim('   ')).toBe('');
    });
  });

  describe('removeSlashes', () => {
    it('should remove single trailing slash', () => {
      expect(removeSlashes('path/')).toBe('path');
    });

    it('should remove multiple trailing slashes', () => {
      expect(removeSlashes('path///')).toBe('path');
    });

    it('should preserve path without trailing slash', () => {
      expect(removeSlashes('path')).toBe('path');
    });

    it('should preserve internal slashes', () => {
      expect(removeSlashes('path/to/file/')).toBe('path/to/file');
    });

    it('should handle null values', () => {
      expect(removeSlashes(null as any)).toBe('');
    });

    it('should handle root path', () => {
      expect(removeSlashes('/')).toBe('');
    });
  });

  describe('removeLeadingSlashes', () => {
    it('should remove single leading slash', () => {
      expect(removeLeadingSlashes('/path')).toBe('path');
    });

    it('should remove multiple leading slashes', () => {
      expect(removeLeadingSlashes('///path')).toBe('path');
    });

    it('should preserve path without leading slash', () => {
      expect(removeLeadingSlashes('path')).toBe('path');
    });

    it('should preserve trailing slashes', () => {
      expect(removeLeadingSlashes('/path/')).toBe('path/');
    });

    it('should handle null values', () => {
      expect(removeLeadingSlashes(null as any)).toBe('');
    });
  });

  describe('padString', () => {
    it('should pad right with spaces by default', () => {
      expect(padString('test', 10)).toBe('test      ');
    });

    it('should pad left when specified', () => {
      expect(padString('test', 10, ' ', true)).toBe('      test');
    });

    it('should pad with custom character', () => {
      expect(padString('test', 10, '-')).toBe('test------');
      expect(padString('test', 10, '0', true)).toBe('000000test');
    });

    it('should not truncate if already long enough', () => {
      expect(padString('testing', 5)).toBe('testing');
    });

    it('should handle exact length match', () => {
      expect(padString('test', 4)).toBe('test');
    });

    it('should handle null values', () => {
      expect(padString(null as any, 5)).toBe('     ');
    });

    it('should handle empty strings', () => {
      expect(padString('', 5, '*')).toBe('*****');
    });
  });

  describe('truncateString', () => {
    it('should truncate long strings with ellipsis', () => {
      expect(truncateString('hello world', 8)).toBe('hello...');
    });

    it('should not truncate strings within limit', () => {
      expect(truncateString('hello', 10)).toBe('hello');
    });

    it('should truncate without ellipsis when specified', () => {
      expect(truncateString('hello world', 5, false)).toBe('hello');
    });

    it('should handle strings at exact limit', () => {
      expect(truncateString('hello', 5)).toBe('hello');
    });

    it('should handle null values', () => {
      expect(truncateString(null as any, 5)).toBe('');
    });

    it('should handle empty strings', () => {
      expect(truncateString('', 5)).toBe('');
    });

    it('should handle very short maxLength', () => {
      expect(truncateString('hello world', 3, false)).toBe('hel');
      // When maxLength <= 3, ellipsis not added (would use all space)
      expect(truncateString('hello world', 3, true)).toBe('hel');
      // Ellipsis only added when maxLength > 3
      expect(truncateString('hello world', 4, true)).toBe('h...');
      expect(truncateString('hello world', 5, true)).toBe('he...');
    });
  });

  describe('containsIgnoreCase', () => {
    it('should find substring case-insensitively', () => {
      expect(containsIgnoreCase('Hello World', 'world')).toBe(true);
      expect(containsIgnoreCase('TESTING', 'test')).toBe(true);
    });

    it('should return false when not found', () => {
      expect(containsIgnoreCase('hello', 'xyz')).toBe(false);
    });

    it('should handle null values', () => {
      expect(containsIgnoreCase(null as any, 'test')).toBe(false);
      expect(containsIgnoreCase('test', null as any)).toBe(false);
    });

    it('should find empty string in any string', () => {
      expect(containsIgnoreCase('test', '')).toBe(true);
    });
  });

  describe('replaceAll', () => {
    it('should replace all occurrences', () => {
      expect(replaceAll('test test test', 'test', 'demo')).toBe('demo demo demo');
    });

    it('should be case-sensitive', () => {
      expect(replaceAll('Test test TEST', 'test', 'demo')).toBe('Test demo TEST');
    });

    it('should handle no matches', () => {
      expect(replaceAll('hello', 'xyz', 'abc')).toBe('hello');
    });

    it('should handle null text', () => {
      expect(replaceAll(null as any, 'test', 'demo')).toBe('');
    });

    it('should handle empty strings', () => {
      expect(replaceAll('', 'test', 'demo')).toBe('');
    });
  });

  describe('replaceAllIgnoreCase', () => {
    it('should replace all occurrences case-insensitively', () => {
      expect(replaceAllIgnoreCase('Test test TEST', 'test', 'demo')).toBe('demo demo demo');
    });

    it('should handle special regex characters', () => {
      expect(replaceAllIgnoreCase('a.b.c', '.', '-')).toBe('a-b-c');
      expect(replaceAllIgnoreCase('(test)', '(', '[')).toBe('[test)');
    });

    it('should handle null values', () => {
      expect(replaceAllIgnoreCase(null as any, 'test', 'demo')).toBe('');
      expect(replaceAllIgnoreCase('test', null as any, 'demo')).toBe('test');
    });
  });

  describe('splitAndTrim', () => {
    it('should split and trim parts', () => {
      expect(splitAndTrim('a, b, c', ',')).toEqual(['a', 'b', 'c']);
    });

    it('should remove empty parts', () => {
      expect(splitAndTrim('a,,b,,c', ',')).toEqual(['a', 'b', 'c']);
    });

    it('should trim whitespace from parts', () => {
      expect(splitAndTrim('  a  |  b  |  c  ', '|')).toEqual(['a', 'b', 'c']);
    });

    it('should handle null values', () => {
      expect(splitAndTrim(null as any, ',')).toEqual([]);
    });

    it('should handle empty strings', () => {
      expect(splitAndTrim('', ',')).toEqual([]);
    });

    it('should handle single value', () => {
      expect(splitAndTrim('test', ',')).toEqual(['test']);
    });
  });

  describe('joinStrings', () => {
    it('should join array with delimiter', () => {
      expect(joinStrings(['a', 'b', 'c'], ', ')).toBe('a, b, c');
    });

    it('should handle single element', () => {
      expect(joinStrings(['test'], ',')).toBe('test');
    });

    it('should handle null values', () => {
      expect(joinStrings(null as any, ',')).toBe('');
    });

    it('should handle empty array', () => {
      expect(joinStrings([], ',')).toBe('');
    });

    it('should handle different delimiters', () => {
      expect(joinStrings(['a', 'b', 'c'], ' | ')).toBe('a | b | c');
      expect(joinStrings(['a', 'b', 'c'], '')).toBe('abc');
    });
  });

  describe('repeatString', () => {
    it('should repeat string N times', () => {
      expect(repeatString('ab', 3)).toBe('ababab');
      expect(repeatString('-', 5)).toBe('-----');
    });

    it('should handle count of 1', () => {
      expect(repeatString('test', 1)).toBe('test');
    });

    it('should handle count of 0', () => {
      expect(repeatString('test', 0)).toBe('');
    });

    it('should handle negative count', () => {
      expect(repeatString('test', -1)).toBe('');
    });

    it('should handle null text', () => {
      expect(repeatString(null as any, 3)).toBe('');
    });

    it('should handle empty string', () => {
      expect(repeatString('', 5)).toBe('');
    });
  });

  describe('reverseString', () => {
    it('should reverse string', () => {
      expect(reverseString('hello')).toBe('olleh');
      expect(reverseString('abc123')).toBe('321cba');
    });

    it('should handle single character', () => {
      expect(reverseString('a')).toBe('a');
    });

    it('should handle null values', () => {
      expect(reverseString(null as any)).toBe('');
    });

    it('should handle empty string', () => {
      expect(reverseString('')).toBe('');
    });

    it('should handle palindromes', () => {
      expect(reverseString('racecar')).toBe('racecar');
    });
  });

  describe('countOccurrences', () => {
    it('should count case-insensitive by default', () => {
      expect(countOccurrences('Test test TEST', 'test')).toBe(3);
    });

    it('should count case-sensitive when specified', () => {
      expect(countOccurrences('Test test TEST', 'test', true)).toBe(1);
      expect(countOccurrences('Test test TEST', 'TEST', true)).toBe(1);
    });

    it('should count overlapping occurrences', () => {
      expect(countOccurrences('aaaa', 'aa')).toBe(2); // Non-overlapping
    });

    it('should return 0 when not found', () => {
      expect(countOccurrences('hello', 'xyz')).toBe(0);
    });

    it('should handle null values', () => {
      expect(countOccurrences(null as any, 'test')).toBe(0);
      expect(countOccurrences('test', null as any)).toBe(0);
    });

    it('should handle empty search string', () => {
      expect(countOccurrences('test', '')).toBe(0);
    });

    it('should count single character', () => {
      expect(countOccurrences('hello', 'l')).toBe(2);
    });
  });

  describe('escapeRegex', () => {
    it('should escape special regex characters', () => {
      expect(escapeRegex('.')).toBe('\\.');
      expect(escapeRegex('*')).toBe('\\*');
      expect(escapeRegex('+')).toBe('\\+');
      expect(escapeRegex('?')).toBe('\\?');
      expect(escapeRegex('^')).toBe('\\^');
      expect(escapeRegex('$')).toBe('\\$');
      expect(escapeRegex('{')).toBe('\\{');
      expect(escapeRegex('}')).toBe('\\}');
      expect(escapeRegex('(')).toBe('\\(');
      expect(escapeRegex(')')).toBe('\\)');
      expect(escapeRegex('|')).toBe('\\|');
      expect(escapeRegex('[')).toBe('\\[');
      expect(escapeRegex(']')).toBe('\\]');
      expect(escapeRegex('\\')).toBe('\\\\');
    });

    it('should escape multiple special characters', () => {
      expect(escapeRegex('a.b*c+d')).toBe('a\\.b\\*c\\+d');
      expect(escapeRegex('(test)')).toBe('\\(test\\)');
    });

    it('should handle null values', () => {
      expect(escapeRegex(null as any)).toBe('');
    });

    it('should handle strings without special characters', () => {
      expect(escapeRegex('hello')).toBe('hello');
    });

    it('should handle empty string', () => {
      expect(escapeRegex('')).toBe('');
    });

    it('should make string safe for RegExp', () => {
      const escaped = escapeRegex('test.file');
      const regex = new RegExp(escaped);
      expect('test.file').toMatch(regex);
      expect('testXfile').not.toMatch(regex); // Dot should not match any char
    });
  });
});
