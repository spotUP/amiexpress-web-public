/**
 * ANSI Utility Unit Tests
 *
 * Tests all ANSI formatting, colorization, and text manipulation functions.
 * Validates escape sequences, color codes, and ANSI-aware text operations.
 */

import { AnsiUtil } from '../../src/utils/ansi.util';
import { ANSI, LINE_ENDING } from '../../src/constants/ansi-codes';

describe('AnsiUtil', () => {
  describe('colorize', () => {
    it('should colorize text with named colors', () => {
      expect(AnsiUtil.colorize('test', 'red')).toBe(`${ANSI.RED}test${ANSI.RESET}`);
      expect(AnsiUtil.colorize('test', 'green')).toBe(`${ANSI.GREEN}test${ANSI.RESET}`);
      expect(AnsiUtil.colorize('test', 'blue')).toBe(`${ANSI.BLUE}test${ANSI.RESET}`);
    });

    it('should be case-insensitive for color names', () => {
      expect(AnsiUtil.colorize('test', 'RED')).toBe(`${ANSI.RED}test${ANSI.RESET}`);
      expect(AnsiUtil.colorize('test', 'Green')).toBe(`${ANSI.GREEN}test${ANSI.RESET}`);
    });

    it('should accept ANSI codes directly', () => {
      const customCode = '\x1b[38;5;196m';
      expect(AnsiUtil.colorize('test', customCode)).toBe(`${customCode}test${ANSI.RESET}`);
    });

    it('should support all standard colors', () => {
      expect(AnsiUtil.colorize('text', 'black')).toBe(`${ANSI.BLACK}text${ANSI.RESET}`);
      expect(AnsiUtil.colorize('text', 'red')).toBe(`${ANSI.RED}text${ANSI.RESET}`);
      expect(AnsiUtil.colorize('text', 'green')).toBe(`${ANSI.GREEN}text${ANSI.RESET}`);
      expect(AnsiUtil.colorize('text', 'yellow')).toBe(`${ANSI.YELLOW}text${ANSI.RESET}`);
      expect(AnsiUtil.colorize('text', 'blue')).toBe(`${ANSI.BLUE}text${ANSI.RESET}`);
      expect(AnsiUtil.colorize('text', 'magenta')).toBe(`${ANSI.MAGENTA}text${ANSI.RESET}`);
      expect(AnsiUtil.colorize('text', 'cyan')).toBe(`${ANSI.CYAN}text${ANSI.RESET}`);
      expect(AnsiUtil.colorize('text', 'white')).toBe(`${ANSI.WHITE}text${ANSI.RESET}`);
    });
  });

  describe('error', () => {
    it('should format text in red', () => {
      expect(AnsiUtil.error('Error message')).toBe(`${ANSI.RED}Error message${ANSI.RESET}`);
    });
  });

  describe('success', () => {
    it('should format text in green', () => {
      expect(AnsiUtil.success('Success message')).toBe(`${ANSI.GREEN}Success message${ANSI.RESET}`);
    });
  });

  describe('warning', () => {
    it('should format text in yellow', () => {
      expect(AnsiUtil.warning('Warning message')).toBe(`${ANSI.YELLOW}Warning message${ANSI.RESET}`);
    });
  });

  describe('header', () => {
    it('should format text in cyan', () => {
      expect(AnsiUtil.header('Header text')).toBe(`${ANSI.CYAN}Header text${ANSI.RESET}`);
    });
  });

  describe('info', () => {
    it('should format text in blue', () => {
      expect(AnsiUtil.info('Info message')).toBe(`${ANSI.BLUE}Info message${ANSI.RESET}`);
    });
  });

  describe('clearScreen', () => {
    it('should return clear screen sequence', () => {
      expect(AnsiUtil.clearScreen()).toBe(ANSI.CLEAR_SCREEN);
    });
  });

  describe('line', () => {
    it('should add line ending to text', () => {
      expect(AnsiUtil.line('test')).toBe(`test${LINE_ENDING}`);
    });

    it('should handle empty text', () => {
      expect(AnsiUtil.line()).toBe(LINE_ENDING);
      expect(AnsiUtil.line('')).toBe(LINE_ENDING);
    });
  });

  describe('pressKeyPrompt', () => {
    it('should create press key prompt with success color', () => {
      expect(AnsiUtil.pressKeyPrompt()).toBe(
        `${ANSI.GREEN}Press any key to continue...${ANSI.RESET}${LINE_ENDING}`
      );
    });
  });

  describe('prompt', () => {
    it('should create prompt with reset', () => {
      expect(AnsiUtil.prompt('Enter name:')).toBe(`Enter name:${ANSI.RESET}`);
    });
  });

  describe('errorLine', () => {
    it('should create error message with line ending', () => {
      expect(AnsiUtil.errorLine('Error')).toBe(
        `${ANSI.RED}Error${ANSI.RESET}${LINE_ENDING}`
      );
    });
  });

  describe('successLine', () => {
    it('should create success message with line ending', () => {
      expect(AnsiUtil.successLine('Done')).toBe(
        `${ANSI.GREEN}Done${ANSI.RESET}${LINE_ENDING}`
      );
    });
  });

  describe('warningLine', () => {
    it('should create warning message with line ending', () => {
      expect(AnsiUtil.warningLine('Warning')).toBe(
        `${ANSI.YELLOW}Warning${ANSI.RESET}${LINE_ENDING}`
      );
    });
  });

  describe('headerBox', () => {
    it('should create header with decorative border', () => {
      expect(AnsiUtil.headerBox('Title')).toBe(
        `${ANSI.CYAN}-= Title =-${ANSI.RESET}${LINE_ENDING}`
      );
    });
  });

  describe('menuOption', () => {
    it('should format menu option with colored key and description', () => {
      const result = AnsiUtil.menuOption('Q', ' Quit');
      expect(result).toBe(
        `${ANSI.GREEN}(${ANSI.YELLOW}Q${ANSI.GREEN})${ANSI.CYAN} Quit${ANSI.RESET}`
      );
    });
  });

  describe('complexPrompt', () => {
    it('should combine multiple colored parts', () => {
      const parts = [
        { text: 'Enter ', color: 'white' },
        { text: 'username', color: 'green' },
        { text: ': ' },
      ];
      const result = AnsiUtil.complexPrompt(parts);
      expect(result).toBe(
        `${ANSI.WHITE}Enter ${ANSI.RESET}${ANSI.GREEN}username${ANSI.RESET}: `
      );
    });

    it('should handle parts without color', () => {
      const parts = [
        { text: 'Plain text' },
        { text: ' colored', color: 'red' },
      ];
      const result = AnsiUtil.complexPrompt(parts);
      expect(result).toBe(`Plain text${ANSI.RED} colored${ANSI.RESET}`);
    });

    it('should handle empty parts array', () => {
      expect(AnsiUtil.complexPrompt([])).toBe('');
    });
  });

  describe('stripAnsi', () => {
    it('should remove ANSI color codes', () => {
      const colored = `${ANSI.RED}red${ANSI.RESET}${ANSI.GREEN}green${ANSI.RESET}`;
      expect(AnsiUtil.stripAnsi(colored)).toBe('redgreen');
    });

    it('should remove cursor movement codes', () => {
      const text = `test${ANSI.CURSOR_UP(5)}more`;
      expect(AnsiUtil.stripAnsi(text)).toBe('testmore');
    });

    it('should handle text without ANSI codes', () => {
      expect(AnsiUtil.stripAnsi('plain text')).toBe('plain text');
    });

    it('should remove complex ANSI sequences', () => {
      const text = '\x1b[1;31mBold Red\x1b[0m\x1b[32mGreen\x1b[0m';
      expect(AnsiUtil.stripAnsi(text)).toBe('Bold RedGreen');
    });

    it('should handle empty string', () => {
      expect(AnsiUtil.stripAnsi('')).toBe('');
    });
  });

  describe('visibleLength', () => {
    it('should return length without ANSI codes', () => {
      const colored = `${ANSI.RED}hello${ANSI.RESET}`;
      expect(AnsiUtil.visibleLength(colored)).toBe(5);
    });

    it('should handle plain text', () => {
      expect(AnsiUtil.visibleLength('hello')).toBe(5);
    });

    it('should handle multiple color changes', () => {
      const text = `${ANSI.RED}a${ANSI.GREEN}b${ANSI.BLUE}c${ANSI.RESET}`;
      expect(AnsiUtil.visibleLength(text)).toBe(3);
    });

    it('should handle empty string', () => {
      expect(AnsiUtil.visibleLength('')).toBe(0);
    });
  });

  describe('stripAnsiForPlainText', () => {
    it('should remove SGR color codes', () => {
      const text = `${ANSI.RED}red${ANSI.RESET}`;
      expect(AnsiUtil.stripAnsiForPlainText(text)).toBe('red');
    });

    it('should handle multiple color codes', () => {
      const text = '\x1b[31mred\x1b[0m\x1b[32mgreen\x1b[0m';
      expect(AnsiUtil.stripAnsiForPlainText(text)).toBe('redgreen');
    });

    it('should handle plain text', () => {
      expect(AnsiUtil.stripAnsiForPlainText('plain')).toBe('plain');
    });
  });

  describe('stripColorCodes', () => {
    it('should remove color codes (alias for stripAnsiForPlainText)', () => {
      const text = `${ANSI.GREEN}text${ANSI.RESET}`;
      expect(AnsiUtil.stripColorCodes(text)).toBe('text');
    });
  });

  describe('padRight', () => {
    it('should pad plain text to right', () => {
      expect(AnsiUtil.padRight('test', 10)).toBe('test      ');
    });

    it('should handle ANSI-colored text correctly', () => {
      const colored = `${ANSI.RED}test${ANSI.RESET}`;
      const result = AnsiUtil.padRight(colored, 10);
      expect(AnsiUtil.visibleLength(result)).toBe(10);
      expect(result.startsWith(ANSI.RED)).toBe(true);
      expect(result.endsWith('      ')).toBe(true);
    });

    it('should not pad if text is already wide enough', () => {
      expect(AnsiUtil.padRight('longtext', 5)).toBe('longtext');
    });

    it('should handle exact width', () => {
      expect(AnsiUtil.padRight('test', 4)).toBe('test');
    });

    it('should handle empty text', () => {
      expect(AnsiUtil.padRight('', 5)).toBe('     ');
    });
  });

  describe('padLeft', () => {
    it('should pad plain text to left', () => {
      expect(AnsiUtil.padLeft('test', 10)).toBe('      test');
    });

    it('should handle ANSI-colored text correctly', () => {
      const colored = `${ANSI.RED}test${ANSI.RESET}`;
      const result = AnsiUtil.padLeft(colored, 10);
      expect(AnsiUtil.visibleLength(result)).toBe(10);
      expect(result.startsWith('      ')).toBe(true);
    });

    it('should not pad if text is already wide enough', () => {
      expect(AnsiUtil.padLeft('longtext', 5)).toBe('longtext');
    });

    it('should handle exact width', () => {
      expect(AnsiUtil.padLeft('test', 4)).toBe('test');
    });

    it('should handle empty text', () => {
      expect(AnsiUtil.padLeft('', 5)).toBe('     ');
    });
  });

  describe('center', () => {
    it('should center plain text', () => {
      expect(AnsiUtil.center('test', 10)).toBe('   test   ');
    });

    it('should handle odd padding', () => {
      expect(AnsiUtil.center('test', 9)).toBe('  test   ');
    });

    it('should handle ANSI-colored text correctly', () => {
      const colored = `${ANSI.RED}test${ANSI.RESET}`;
      const result = AnsiUtil.center(colored, 10);
      expect(AnsiUtil.visibleLength(result)).toBe(10);
      // Should have padding on both sides
      expect(result.includes('   ')).toBe(true);
    });

    it('should not pad if text is already wide enough', () => {
      const text = 'longtext';
      expect(AnsiUtil.center(text, 5)).toBe(text);
    });

    it('should handle exact width', () => {
      expect(AnsiUtil.center('test', 4)).toBe('test');
    });

    it('should handle empty text', () => {
      expect(AnsiUtil.center('', 5)).toBe('     ');
    });

    it('should distribute padding evenly', () => {
      const result = AnsiUtil.center('XX', 6);
      expect(result).toBe('  XX  ');
    });
  });

  describe('integration tests', () => {
    it('should handle complex colored text with padding', () => {
      const text = `${ANSI.RED}Error${ANSI.RESET}: ${ANSI.GREEN}OK${ANSI.RESET}`;
      const padded = AnsiUtil.padRight(text, 20);
      expect(AnsiUtil.visibleLength(padded)).toBe(20);
      expect(AnsiUtil.stripAnsi(padded).trim()).toBe('Error: OK');
    });

    it('should handle menu option with padding', () => {
      const option = AnsiUtil.menuOption('Q', ' Quit');
      const visible = AnsiUtil.visibleLength(option);
      expect(visible).toBe(8); // "(Q) Quit"
    });

    it('should combine line and color functions', () => {
      const line = AnsiUtil.successLine('Done');
      expect(line).toContain(ANSI.GREEN);
      expect(line).toContain('Done');
      expect(line).toContain(ANSI.RESET);
      expect(line).toContain(LINE_ENDING);
    });

    it('should strip ANSI from complex formatted text', () => {
      const formatted = AnsiUtil.headerBox('Test');
      const stripped = AnsiUtil.stripAnsi(formatted);
      expect(stripped).toBe(`-= Test =-${LINE_ENDING}`);
    });
  });
});
