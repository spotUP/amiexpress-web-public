/**
 * Input Normalizer Utility Unit Tests
 *
 * Tests input sanitization and normalization for case-insensitive,
 * whitespace-tolerant comparisons.
 */

import {
  sanitizeInput,
  normalizeForComparison,
} from '../../src/utils/input-normalizer.util';

describe('Input Normalizer Utility Functions', () => {
  describe('sanitizeInput', () => {
    it('should trim leading whitespace', () => {
      expect(sanitizeInput('  hello')).toBe('hello');
      expect(sanitizeInput('\thello')).toBe('hello');
      expect(sanitizeInput('\nhello')).toBe('hello');
    });

    it('should trim trailing whitespace', () => {
      expect(sanitizeInput('hello  ')).toBe('hello');
      expect(sanitizeInput('hello\t')).toBe('hello');
      expect(sanitizeInput('hello\n')).toBe('hello');
    });

    it('should trim both leading and trailing whitespace', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
      expect(sanitizeInput('\t\nhello\n\t')).toBe('hello');
    });

    it('should preserve internal whitespace', () => {
      expect(sanitizeInput('hello world')).toBe('hello world');
      expect(sanitizeInput('hello  world')).toBe('hello  world');
    });

    it('should handle null', () => {
      expect(sanitizeInput(null)).toBe('');
    });

    it('should handle undefined', () => {
      expect(sanitizeInput(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(sanitizeInput('   ')).toBe('');
      expect(sanitizeInput('\t\n')).toBe('');
    });

    it('should preserve case', () => {
      expect(sanitizeInput('Hello World')).toBe('Hello World');
      expect(sanitizeInput('UPPERCASE')).toBe('UPPERCASE');
      expect(sanitizeInput('lowercase')).toBe('lowercase');
    });

    it('should handle special characters', () => {
      expect(sanitizeInput('hello@world.com')).toBe('hello@world.com');
      expect(sanitizeInput('user_123')).toBe('user_123');
      expect(sanitizeInput('test-value')).toBe('test-value');
    });

    it('should handle numbers', () => {
      expect(sanitizeInput('12345')).toBe('12345');
      expect(sanitizeInput('  123  ')).toBe('123');
    });

    it('should handle ANSI escape sequences', () => {
      expect(sanitizeInput('\x1b[31mred\x1b[0m')).toBe('\x1b[31mred\x1b[0m');
    });

    it('should handle unicode characters', () => {
      expect(sanitizeInput('  café  ')).toBe('café');
      expect(sanitizeInput('  日本語  ')).toBe('日本語');
    });

    it('should handle newlines in middle of text', () => {
      expect(sanitizeInput('hello\nworld')).toBe('hello\nworld');
      expect(sanitizeInput('\nhello\nworld\n')).toBe('hello\nworld');
    });

    it('should handle carriage returns', () => {
      expect(sanitizeInput('hello\r\nworld')).toBe('hello\r\nworld');
      expect(sanitizeInput('\r\nhello\r\n')).toBe('hello');
    });
  });

  describe('normalizeForComparison', () => {
    it('should convert to lowercase', () => {
      expect(normalizeForComparison('HELLO')).toBe('hello');
      expect(normalizeForComparison('Hello')).toBe('hello');
      expect(normalizeForComparison('HeLLo')).toBe('hello');
    });

    it('should trim and convert to lowercase', () => {
      expect(normalizeForComparison('  HELLO  ')).toBe('hello');
      expect(normalizeForComparison('\tHello\n')).toBe('hello');
    });

    it('should handle null', () => {
      expect(normalizeForComparison(null)).toBe('');
    });

    it('should handle undefined', () => {
      expect(normalizeForComparison(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      expect(normalizeForComparison('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(normalizeForComparison('   ')).toBe('');
      expect(normalizeForComparison('\t\n')).toBe('');
    });

    it('should preserve internal whitespace', () => {
      expect(normalizeForComparison('Hello World')).toBe('hello world');
      expect(normalizeForComparison('HELLO  WORLD')).toBe('hello  world');
    });

    it('should handle special characters', () => {
      expect(normalizeForComparison('User@Example.COM')).toBe('user@example.com');
      expect(normalizeForComparison('Test_123')).toBe('test_123');
      expect(normalizeForComparison('VALUE-1')).toBe('value-1');
    });

    it('should handle numbers', () => {
      expect(normalizeForComparison('12345')).toBe('12345');
      expect(normalizeForComparison('  ABC123  ')).toBe('abc123');
    });

    it('should make comparisons case-insensitive', () => {
      const input1 = normalizeForComparison('  TeSTuSeR  ');
      const input2 = normalizeForComparison('testuser');
      const input3 = normalizeForComparison('TESTUSER');
      expect(input1).toBe(input2);
      expect(input2).toBe(input3);
    });

    it('should handle unicode characters', () => {
      expect(normalizeForComparison('  CAFÉ  ')).toBe('café');
      // Note: Unicode lowercase behavior may vary by locale
    });

    it('should handle mixed case with special chars', () => {
      expect(normalizeForComparison('User@Domain.COM')).toBe('user@domain.com');
      expect(normalizeForComparison('File_Name.TXT')).toBe('file_name.txt');
    });

    it('should handle ANSI escape sequences', () => {
      expect(normalizeForComparison('\x1b[31mRED\x1b[0m')).toBe('\x1b[31mred\x1b[0m');
    });

    it('should handle command inputs', () => {
      expect(normalizeForComparison('  QUIT  ')).toBe('quit');
      expect(normalizeForComparison('\tHelp\n')).toBe('help');
      expect(normalizeForComparison('  WHO  ')).toBe('who');
    });
  });

  describe('integration tests', () => {
    it('should enable case-insensitive username comparison', () => {
      const user1 = '  JohnDoe  ';
      const user2 = 'johndoe';
      const user3 = 'JOHNDOE';
      const user4 = 'JoHnDoE';

      expect(normalizeForComparison(user1)).toBe(normalizeForComparison(user2));
      expect(normalizeForComparison(user2)).toBe(normalizeForComparison(user3));
      expect(normalizeForComparison(user3)).toBe(normalizeForComparison(user4));
    });

    it('should enable case-insensitive command comparison', () => {
      const commands = ['quit', 'QUIT', 'Quit', '  quit  ', '\tQUIT\n'];
      const normalized = commands.map(normalizeForComparison);

      expect(new Set(normalized).size).toBe(1);
      expect(normalized[0]).toBe('quit');
    });

    it('should handle user input variations', () => {
      const inputs = [
        '  yes  ',
        'YES',
        'Yes',
        '\tyes\n',
        'yes\r\n',
      ];

      const normalized = inputs.map(normalizeForComparison);
      expect(normalized.every(n => n === 'yes')).toBe(true);
    });

    it('should sanitize without changing case', () => {
      const input = '  TestUser123  ';
      const sanitized = sanitizeInput(input);
      expect(sanitized).toBe('TestUser123');
      expect(sanitized).not.toBe('testuser123');
    });

    it('should normalize for comparison changing case', () => {
      const input = '  TestUser123  ';
      const normalized = normalizeForComparison(input);
      expect(normalized).toBe('testuser123');
    });

    it('should handle email addresses', () => {
      const email1 = '  User@Example.COM  ';
      const email2 = 'user@example.com';

      expect(normalizeForComparison(email1)).toBe(normalizeForComparison(email2));
    });

    it('should handle file names', () => {
      const file1 = '  README.TXT  ';
      const file2 = 'readme.txt';
      const file3 = 'README.txt';

      expect(normalizeForComparison(file1)).toBe(normalizeForComparison(file2));
      expect(normalizeForComparison(file2)).toBe(normalizeForComparison(file3));
    });

    it('should differentiate inputs that differ beyond case/whitespace', () => {
      expect(normalizeForComparison('user1')).not.toBe(normalizeForComparison('user2'));
      expect(normalizeForComparison('test')).not.toBe(normalizeForComparison('testing'));
    });

    it('should handle empty and null consistently', () => {
      const empty1 = normalizeForComparison('');
      const empty2 = normalizeForComparison('   ');
      const empty3 = normalizeForComparison(null);
      const empty4 = normalizeForComparison(undefined);

      expect(empty1).toBe(empty2);
      expect(empty2).toBe(empty3);
      expect(empty3).toBe(empty4);
      expect(empty1).toBe('');
    });
  });
});
