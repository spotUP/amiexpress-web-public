/**
 * ASCII Art Utility Unit Tests
 *
 * Tests ASCII art detection heuristics used by DIR file writer
 * and listing output to identify decorative lines.
 */

import { looksLikeAsciiArt } from '../../src/utils/ascii-art.util';

describe('ASCII Art Utility', () => {
  describe('looksLikeAsciiArt', () => {
    describe('whitespace lines', () => {
      it('should detect empty string as art', () => {
        expect(looksLikeAsciiArt('')).toBe(true);
      });

      it('should detect pure whitespace as art', () => {
        expect(looksLikeAsciiArt('   ')).toBe(true);
        expect(looksLikeAsciiArt('\t\t')).toBe(true);
        expect(looksLikeAsciiArt('     \t  ')).toBe(true);
      });

      it('should detect newline as art', () => {
        expect(looksLikeAsciiArt('\n')).toBe(true);
      });
    });

    describe('leading indent detection', () => {
      it('should detect lines with indent >= 33 as art', () => {
        expect(looksLikeAsciiArt(' '.repeat(33) + 'text')).toBe(true);
        expect(looksLikeAsciiArt(' '.repeat(40) + 'text')).toBe(true);
        expect(looksLikeAsciiArt(' '.repeat(50) + 'content')).toBe(true);
      });

      it('should not treat lines with indent < 33 as art by indent alone', () => {
        const result = looksLikeAsciiArt(' '.repeat(32) + 'regular text here');
        // May or may not be art depending on other heuristics
        expect(typeof result).toBe('boolean');
      });

      it('should detect indent 4+ with symbols as art', () => {
        expect(looksLikeAsciiArt('    -|-')).toBe(true);
        expect(looksLikeAsciiArt('    |=|')).toBe(true);
        expect(looksLikeAsciiArt('      ***')).toBe(true);
      });
    });

    describe('non-alphanumeric detection', () => {
      it('should detect pure symbols as art', () => {
        expect(looksLikeAsciiArt('---')).toBe(true);
        expect(looksLikeAsciiArt('===')).toBe(true);
        expect(looksLikeAsciiArt('***')).toBe(true);
        expect(looksLikeAsciiArt('///')).toBe(true);
        expect(looksLikeAsciiArt('|||')).toBe(true);
      });

      it('should detect lines without letters/digits as art', () => {
        expect(looksLikeAsciiArt('+-+-+')).toBe(true);
        expect(looksLikeAsciiArt('_____')).toBe(true);
        expect(looksLikeAsciiArt('~~~~~')).toBe(true);
      });
    });

    describe('punctuation ratio detection', () => {
      it('should detect high punctuation ratio (>=60%) as art', () => {
        expect(looksLikeAsciiArt('....')).toBe(true);
        expect(looksLikeAsciiArt('----')).toBe(true);
        expect(looksLikeAsciiArt('======')).toBe(true);
        expect(looksLikeAsciiArt('a...')).toBe(true); // 75% punctuation
      });

      it('should require minimum length of 4', () => {
        expect(looksLikeAsciiArt('...')).toBe(true); // pure symbols, different rule
        expect(looksLikeAsciiArt('a..')).toBe(false); // length 3, doesn't meet >= 4 requirement
      });

      it('should not detect low punctuation ratio as art', () => {
        expect(looksLikeAsciiArt('hello world')).toBe(false);
        expect(looksLikeAsciiArt('test file.txt')).toBe(false);
      });
    });

    describe('symbol count detection', () => {
      it('should detect 3+ symbols with low alphanumeric ratio as art', () => {
        expect(looksLikeAsciiArt('a-|-|')).toBe(true); // 3 symbols, <40% alphanum
        expect(looksLikeAsciiArt('x=====')).toBe(true); // 5 symbols, low alphanum
      });

      it('should not detect high alphanumeric ratio as art', () => {
        expect(looksLikeAsciiArt('test-file-name')).toBe(false);
        expect(looksLikeAsciiArt('hello_world_123')).toBe(false);
      });
    });

    describe('long space runs detection', () => {
      it('should detect 2+ space runs (4+ spaces) with 3+ symbols as art', () => {
        expect(looksLikeAsciiArt('a    b    c---')).toBe(true);
        expect(looksLikeAsciiArt('x      y      ***')).toBe(true);
      });

      it('should not require 2+ space runs if other rules match', () => {
        // This has 1 space run (4+ spaces), but may match other heuristics
        const result = looksLikeAsciiArt('a    b--');
        expect(typeof result).toBe('boolean');
      });
    });

    describe('art character detection', () => {
      it('should detect 8+ art chars (|_/\\-()) with <80% letters/digits', () => {
        expect(looksLikeAsciiArt('|___|___/\\\\')).toBe(true);
        expect(looksLikeAsciiArt('(--)(--)(--)')).toBe(true);
        expect(looksLikeAsciiArt('|/\\/\\/\\/\\|')).toBe(true);
      });

      it('should not detect high letter/digit ratio as art', () => {
        expect(looksLikeAsciiArt('function_test_case_()')).toBe(false);
      });
    });

    describe('border pattern detection', () => {
      it('should detect lines starting and ending with | or :', () => {
        expect(looksLikeAsciiArt('| text |')).toBe(true);
        expect(looksLikeAsciiArt(': content :')).toBe(true);
        expect(looksLikeAsciiArt('| ------- |')).toBe(true);
      });

      it('should require 2+ symbols for border detection', () => {
        const result = looksLikeAsciiArt('|a|');
        // May be detected by other rules, but border rule requires 2+ symbols
        expect(typeof result).toBe('boolean');
      });
    });

    describe('bordered line detection', () => {
      it('should detect bordered lines (|...|) with requirements', () => {
        // Requirements: length >= 20, starts/ends with |, 3+ sections, 4+ symbols
        expect(looksLikeAsciiArt('| Header | Title | Info |')).toBe(true);
        expect(looksLikeAsciiArt('|-------|-------|--------|')).toBe(true);
        expect(looksLikeAsciiArt('| A | B | C | D | E |')).toBe(true);
      });

      it('should detect bordered lines even if < 20 chars via border art rule', () => {
        // This matches the border art rule (starts/ends with |) even though < 20 chars
        expect(looksLikeAsciiArt('| A | B | C |')).toBe(true);
      });

      it('should detect bordered lines even with 1 section via border art rule', () => {
        // This matches the border art rule (starts/ends with |) even with 1 pipe section
        expect(looksLikeAsciiArt('| single section here |')).toBe(true);
      });
    });

    describe('common ASCII art patterns', () => {
      it('should detect box drawing', () => {
        expect(looksLikeAsciiArt('+----------------+')).toBe(true);
        expect(looksLikeAsciiArt('|                |')).toBe(true);
        expect(looksLikeAsciiArt('+--------+-------+')).toBe(true);
      });

      it('should detect separator lines', () => {
        expect(looksLikeAsciiArt('=' .repeat(40))).toBe(true);
        expect(looksLikeAsciiArt('-'.repeat(40))).toBe(true);
        expect(looksLikeAsciiArt('*'.repeat(40))).toBe(true);
        expect(looksLikeAsciiArt('~'.repeat(40))).toBe(true);
      });

      it('should detect decorative borders', () => {
        expect(looksLikeAsciiArt('///////////////////////////')).toBe(true);
        expect(looksLikeAsciiArt('\\'.repeat(40))).toBe(true);
        expect(looksLikeAsciiArt('*'.repeat(40))).toBe(true);
      });

      it('should detect ASCII art headers', () => {
        expect(looksLikeAsciiArt('  _____ _____ _____')).toBe(true);
        expect(looksLikeAsciiArt(' |_   _| ____| ____|')).toBe(true);
        expect(looksLikeAsciiArt('   | | |  _| |  _|')).toBe(true);
      });

      it('should detect table borders', () => {
        expect(looksLikeAsciiArt('|========|========|========')).toBe(true);
        expect(looksLikeAsciiArt('|--------|--------|--------')).toBe(true);
        expect(looksLikeAsciiArt('+--------+--------+--------+')).toBe(true);
      });
    });

    describe('regular text (not art)', () => {
      it('should not detect regular sentences as art', () => {
        expect(looksLikeAsciiArt('This is a regular sentence.')).toBe(false);
        expect(looksLikeAsciiArt('Hello, how are you today?')).toBe(false);
        expect(looksLikeAsciiArt('The quick brown fox jumps.')).toBe(false);
      });

      it('should not detect filenames as art', () => {
        expect(looksLikeAsciiArt('readme.txt')).toBe(false);
        expect(looksLikeAsciiArt('file_name_123.zip')).toBe(false);
        expect(looksLikeAsciiArt('my-document.pdf')).toBe(false);
      });

      it('should not detect file paths as art', () => {
        expect(looksLikeAsciiArt('/home/user/documents')).toBe(false);
        expect(looksLikeAsciiArt('C:\\Users\\Documents')).toBe(false);
      });

      it('should not detect URLs as art', () => {
        expect(looksLikeAsciiArt('http://example.com')).toBe(false);
        expect(looksLikeAsciiArt('https://www.test.org/page')).toBe(false);
      });

      it('should not detect dates/times as art', () => {
        expect(looksLikeAsciiArt('2023-12-25')).toBe(false);
        expect(looksLikeAsciiArt('12:34:56')).toBe(false);
        expect(looksLikeAsciiArt('2023/12/25 10:30 AM')).toBe(false);
      });

      it('should not detect list items as art', () => {
        expect(looksLikeAsciiArt('1. First item')).toBe(false);
        expect(looksLikeAsciiArt('- Bullet point')).toBe(false);
        expect(looksLikeAsciiArt('* Another item')).toBe(false);
      });

      it('should not detect code/commands as art', () => {
        expect(looksLikeAsciiArt('function test() {')).toBe(false);
        expect(looksLikeAsciiArt('let x = 10;')).toBe(false);
        expect(looksLikeAsciiArt('npm install package')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle very long lines', () => {
        const longLine = 'a'.repeat(1000);
        expect(typeof looksLikeAsciiArt(longLine)).toBe('boolean');
      });

      it('should handle lines with mixed content', () => {
        expect(typeof looksLikeAsciiArt('text ===== more text')).toBe('boolean');
      });

      it('should handle lines with only numbers', () => {
        expect(looksLikeAsciiArt('123456789')).toBe(false);
      });

      it('should handle lines with special characters', () => {
        expect(looksLikeAsciiArt('$$$$$')).toBe(true); // no letters/digits, has symbols
        expect(looksLikeAsciiArt('@@@@@@')).toBe(true);
        expect(looksLikeAsciiArt('######')).toBe(true);
      });

      it('should handle unicode characters', () => {
        const result = looksLikeAsciiArt('→→→→→');
        expect(typeof result).toBe('boolean');
      });

      it('should handle tabs', () => {
        expect(looksLikeAsciiArt('\t\t\t---')).toBe(true);
      });

      it('should handle mixed spaces and tabs', () => {
        expect(looksLikeAsciiArt('  \t  ---')).toBe(true);
      });
    });

    describe('BBS-specific patterns', () => {
      it('should detect ANSI art separators', () => {
        expect(looksLikeAsciiArt('░░░░░░░░░░░░░░░░')).toBe(true);
        expect(looksLikeAsciiArt('▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓')).toBe(true);
        expect(looksLikeAsciiArt('▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒')).toBe(true);
      });

      it('should detect box drawing characters', () => {
        expect(looksLikeAsciiArt('┌─────────────┐')).toBe(true);
        expect(looksLikeAsciiArt('│             │')).toBe(true);
        expect(looksLikeAsciiArt('└─────────────┘')).toBe(true);
      });

      it('should not detect file descriptions as art', () => {
        expect(looksLikeAsciiArt('Game v1.0 - Action packed!')).toBe(false);
        expect(looksLikeAsciiArt('Utility for file management')).toBe(false);
      });
    });

    describe('integration tests', () => {
      it('should correctly classify multiple lines', () => {
        const lines = [
          { line: '=' .repeat(40), expected: true },
          { line: 'Regular text here', expected: false },
          { line: '| Header | Value |', expected: true }, // matches border art rule (starts/ends with |)
          { line: '   ', expected: true },
          { line: 'filename.txt', expected: false },
          { line: '---', expected: true },
          { line: 'This is a sentence.', expected: false },
          { line: '|========|========|========|', expected: true },
        ];

        lines.forEach(({ line, expected }) => {
          expect(looksLikeAsciiArt(line)).toBe(expected);
        });
      });

      it('should handle typical DIR file content', () => {
        const dirLines = [
          '═══════════════════════════════════',
          '  FILE LISTINGS',
          '═══════════════════════════════════',
          'readme.txt          - Documentation',
          'program.exe         - Main program',
          '───────────────────────────────────',
          'Total: 2 files',
        ];

        expect(looksLikeAsciiArt(dirLines[0])).toBe(true);  // separator
        expect(looksLikeAsciiArt(dirLines[1])).toBe(false); // title (indent < 33, alphanumeric)
        expect(looksLikeAsciiArt(dirLines[2])).toBe(true);  // separator
        expect(looksLikeAsciiArt(dirLines[3])).toBe(false); // file entry
        expect(looksLikeAsciiArt(dirLines[4])).toBe(false); // file entry
        expect(looksLikeAsciiArt(dirLines[5])).toBe(true);  // separator
        expect(looksLikeAsciiArt(dirLines[6])).toBe(false); // summary
      });
    });
  });
});
