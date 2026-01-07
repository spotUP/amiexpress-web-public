/**
 * Unit tests for terminal-utils.ts
 * Tests shared terminal utilities and ANSI codes
 */

import { ANSI, buildTerminalBuffer, XTERM_CONFIG } from '../../src/utils/terminal-utils';

describe('terminal-utils', () => {
  describe('ANSI constants', () => {
    it('should have hide cursor code', () => {
      expect(ANSI.HIDE_CURSOR).toBe('\x1b[?25l');
    });

    it('should have show cursor code', () => {
      expect(ANSI.SHOW_CURSOR).toBe('\x1b[?25h');
    });

    it('should have clear screen code', () => {
      expect(ANSI.CLEAR_SCREEN).toBe('\x1b[2J\x1b[H');
    });

    it('should have reset code', () => {
      expect(ANSI.RESET).toBe('\x1b[0m');
    });

    describe('moveCursor', () => {
      it('should move cursor to position (1, 1)', () => {
        const result = ANSI.moveCursor(1, 1);
        expect(result).toBe('\x1b[1;1H');
      });

      it('should move cursor to position (10, 5)', () => {
        const result = ANSI.moveCursor(10, 5);
        expect(result).toBe('\x1b[5;10H');
      });

      it('should move cursor to position (80, 24)', () => {
        const result = ANSI.moveCursor(80, 24);
        expect(result).toBe('\x1b[24;80H');
      });

      it('should handle zero coordinates', () => {
        const result = ANSI.moveCursor(0, 0);
        expect(result).toBe('\x1b[0;0H');
      });

      it('should handle large coordinates', () => {
        const result = ANSI.moveCursor(120, 50);
        expect(result).toBe('\x1b[50;120H');
      });
    });

    describe('setColors', () => {
      it('should set foreground and background colors', () => {
        const result = ANSI.setColors(7, 0); // White on black
        expect(result).toBe('\x1b[0;37;40m');
      });

      it('should set red foreground on blue background', () => {
        const result = ANSI.setColors(1, 4);
        expect(result).toBe('\x1b[0;31;44m');
      });

      it('should set green foreground on black background', () => {
        const result = ANSI.setColors(2, 0);
        expect(result).toBe('\x1b[0;32;40m');
      });

      it('should set yellow foreground on cyan background', () => {
        const result = ANSI.setColors(3, 6);
        expect(result).toBe('\x1b[0;33;46m');
      });

      it('should handle all 8 foreground colors', () => {
        for (let fg = 0; fg < 8; fg++) {
          const result = ANSI.setColors(fg, 0);
          expect(result).toBe(`\x1b[0;3${fg};40m`);
        }
      });

      it('should handle all 8 background colors', () => {
        for (let bg = 0; bg < 8; bg++) {
          const result = ANSI.setColors(7, bg);
          expect(result).toBe(`\x1b[0;37;4${bg}m`);
        }
      });
    });
  });

  describe('buildTerminalBuffer', () => {
    describe('Basic functionality', () => {
      it('should build buffer from lines', () => {
        const lines = ['Line 1', 'Line 2', 'Line 3'];
        const result = buildTerminalBuffer(lines);

        expect(result).toContain('Line 1');
        expect(result).toContain('Line 2');
        expect(result).toContain('Line 3');
      });

      it('should hide and show cursor by default', () => {
        const lines = ['Test'];
        const result = buildTerminalBuffer(lines);

        expect(result).toContain('\x1b[?25l'); // Hide cursor
        expect(result).toContain('\x1b[?25h'); // Show cursor
      });

      it('should use CRLF line endings by default', () => {
        const lines = ['Line 1', 'Line 2'];
        const result = buildTerminalBuffer(lines);

        expect(result).toContain('Line 1\r\n');
        expect(result).toContain('Line 2\r\n');
      });

      it('should handle empty array', () => {
        const result = buildTerminalBuffer([]);

        expect(result).toContain('\x1b[?25l'); // Hide cursor
        expect(result).toContain('\x1b[?25h'); // Show cursor
      });

      it('should handle single line', () => {
        const lines = ['Single line'];
        const result = buildTerminalBuffer(lines);

        expect(result).toContain('Single line\r\n');
      });
    });

    describe('hideCursor option', () => {
      it('should hide cursor when hideCursor is true', () => {
        const lines = ['Test'];
        const result = buildTerminalBuffer(lines, { hideCursor: true });

        expect(result).toContain('\x1b[?25l');
        expect(result).toContain('\x1b[?25h');
      });

      it('should not hide cursor when hideCursor is false', () => {
        const lines = ['Test'];
        const result = buildTerminalBuffer(lines, { hideCursor: false });

        expect(result).not.toContain('\x1b[?25l');
        expect(result).not.toContain('\x1b[?25h');
      });

      it('should only include content when cursor hiding disabled', () => {
        const lines = ['Test'];
        const result = buildTerminalBuffer(lines, { hideCursor: false });

        expect(result).toBe('Test\r\n');
      });
    });

    describe('lineEnding option', () => {
      it('should use custom line ending', () => {
        const lines = ['Line 1', 'Line 2'];
        const result = buildTerminalBuffer(lines, { lineEnding: '\n' });

        expect(result).toContain('Line 1\n');
        expect(result).toContain('Line 2\n');
      });

      it('should use LF only when specified', () => {
        const lines = ['Test'];
        const result = buildTerminalBuffer(lines, { lineEnding: '\n' });

        expect(result).toContain('Test\n');
        expect(result).not.toContain('\r\n');
      });

      it('should use custom separator', () => {
        const lines = ['A', 'B'];
        const result = buildTerminalBuffer(lines, { lineEnding: ' | ' });

        expect(result).toContain('A | ');
        expect(result).toContain('B | ');
      });

      it('should handle empty line ending', () => {
        const lines = ['A', 'B'];
        const result = buildTerminalBuffer(lines, { lineEnding: '' });

        // Should concatenate without separators
        expect(result).toContain('AB');
      });
    });

    describe('Combined options', () => {
      it('should combine hideCursor and lineEnding options', () => {
        const lines = ['Line 1', 'Line 2'];
        const result = buildTerminalBuffer(lines, {
          hideCursor: false,
          lineEnding: '\n',
        });

        expect(result).not.toContain('\x1b[?25');
        expect(result).toContain('Line 1\n');
        expect(result).toContain('Line 2\n');
        expect(result).toBe('Line 1\nLine 2\n');
      });

      it('should handle all options enabled', () => {
        const lines = ['Test'];
        const result = buildTerminalBuffer(lines, {
          hideCursor: true,
          lineEnding: '\r\n',
        });

        expect(result).toContain('\x1b[?25l');
        expect(result).toContain('Test\r\n');
        expect(result).toContain('\x1b[?25h');
      });
    });

    describe('Edge cases', () => {
      it('should handle lines with ANSI codes', () => {
        const lines = ['\x1b[31mRed\x1b[0m', '\x1b[32mGreen\x1b[0m'];
        const result = buildTerminalBuffer(lines);

        expect(result).toContain('\x1b[31mRed\x1b[0m');
        expect(result).toContain('\x1b[32mGreen\x1b[0m');
      });

      it('should handle empty strings in lines', () => {
        const lines = ['', 'Test', ''];
        const result = buildTerminalBuffer(lines);

        expect(result).toContain('\r\n\r\n'); // Two empty lines
        expect(result).toContain('Test\r\n');
      });

      it('should handle very long lines', () => {
        const longLine = 'A'.repeat(1000);
        const lines = [longLine];
        const result = buildTerminalBuffer(lines);

        expect(result).toContain(longLine);
      });

      it('should handle many lines', () => {
        const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
        const result = buildTerminalBuffer(lines);

        expect(result).toContain('Line 1');
        expect(result).toContain('Line 100');
      });

      it('should handle special characters', () => {
        const lines = ['Line with \t tab', 'Line with \x07 bell'];
        const result = buildTerminalBuffer(lines);

        expect(result).toContain('\t');
        expect(result).toContain('\x07');
      });

      it('should preserve Unicode characters', () => {
        const lines = ['Unicode: \u2588 \u2580 \u2584'];
        const result = buildTerminalBuffer(lines);

        expect(result).toContain('\u2588');
        expect(result).toContain('\u2580');
        expect(result).toContain('\u2584');
      });
    });

    describe('Buffer structure', () => {
      it('should have cursor codes at start and end when enabled', () => {
        const lines = ['Test'];
        const result = buildTerminalBuffer(lines, { hideCursor: true });

        expect(result.indexOf('\x1b[?25l')).toBe(0); // Hide at start
        expect(result.lastIndexOf('\x1b[?25h')).toBe(result.length - 6); // Show at end
      });

      it('should order content correctly', () => {
        const lines = ['First', 'Second'];
        const result = buildTerminalBuffer(lines);

        const firstIndex = result.indexOf('First');
        const secondIndex = result.indexOf('Second');

        expect(firstIndex).toBeLessThan(secondIndex);
      });
    });
  });

  describe('XTERM_CONFIG', () => {
    describe('fontFamily', () => {
      it('should have mosoul as primary font', () => {
        expect(XTERM_CONFIG.fontFamily).toContain('mosoul');
      });

      it('should have fallback fonts', () => {
        expect(XTERM_CONFIG.fontFamily).toContain('Courier New');
        expect(XTERM_CONFIG.fontFamily).toContain('monospace');
      });
    });

    describe('fontSize and lineHeight', () => {
      it('should have default font size of 16', () => {
        expect(XTERM_CONFIG.fontSize).toBe(16);
      });

      it('should have line height of 1.2', () => {
        expect(XTERM_CONFIG.lineHeight).toBe(1.2);
      });
    });

    describe('theme (BBS Amiga-style)', () => {
      it('should have black background', () => {
        expect(XTERM_CONFIG.theme.background).toBe('#000000');
      });

      it('should have white foreground', () => {
        expect(XTERM_CONFIG.theme.foreground).toBe('#ffffff');
      });

      it('should have red cursor', () => {
        expect(XTERM_CONFIG.theme.cursor).toBe('#ff0000');
      });

      it('should have all 8 standard colors', () => {
        expect(XTERM_CONFIG.theme.black).toBe('#000000');
        expect(XTERM_CONFIG.theme.red).toBe('#ff0000');
        expect(XTERM_CONFIG.theme.green).toBe('#00ff00');
        expect(XTERM_CONFIG.theme.yellow).toBe('#ffff00');
        expect(XTERM_CONFIG.theme.blue).toBe('#0000ff');
        expect(XTERM_CONFIG.theme.magenta).toBe('#ff00ff');
        expect(XTERM_CONFIG.theme.cyan).toBe('#00ffff');
        expect(XTERM_CONFIG.theme.white).toBe('#ffffff');
      });

      it('should have all 8 bright colors', () => {
        expect(XTERM_CONFIG.theme.brightBlack).toBe('#808080');
        expect(XTERM_CONFIG.theme.brightRed).toBe('#ff8080');
        expect(XTERM_CONFIG.theme.brightGreen).toBe('#80ff80');
        expect(XTERM_CONFIG.theme.brightYellow).toBe('#ffff80');
        expect(XTERM_CONFIG.theme.brightBlue).toBe('#8080ff');
        expect(XTERM_CONFIG.theme.brightMagenta).toBe('#ff80ff');
        expect(XTERM_CONFIG.theme.brightCyan).toBe('#80ffff');
        expect(XTERM_CONFIG.theme.brightWhite).toBe('#ffffff');
      });
    });

    describe('themeSdk (dark editor style)', () => {
      it('should have dark background', () => {
        expect(XTERM_CONFIG.themeSdk.background).toBe('#1E1E1E');
      });

      it('should have light foreground', () => {
        expect(XTERM_CONFIG.themeSdk.foreground).toBe('#CCCCCC');
      });

      it('should have standard colors', () => {
        expect(XTERM_CONFIG.themeSdk.red).toBe('#ff0000');
        expect(XTERM_CONFIG.themeSdk.green).toBe('#00ff00');
        expect(XTERM_CONFIG.themeSdk.blue).toBe('#0000ff');
      });
    });

    describe('options', () => {
      it('should have allowTransparency set to false', () => {
        expect(XTERM_CONFIG.options.allowTransparency).toBe(false);
      });

      it('should have cursorBlink enabled', () => {
        expect(XTERM_CONFIG.options.cursorBlink).toBe(true);
      });

      it('should have block cursor style', () => {
        expect(XTERM_CONFIG.options.cursorStyle).toBe('block');
      });

      it('should have scrollback of 2000 lines', () => {
        expect(XTERM_CONFIG.options.scrollback).toBe(2000);
      });

      it('should have normal font weight', () => {
        expect(XTERM_CONFIG.options.fontWeight).toBe('normal');
      });

      it('should have bold font weight for bold text', () => {
        expect(XTERM_CONFIG.options.fontWeightBold).toBe('bold');
      });

      it('should allow proposed API', () => {
        expect(XTERM_CONFIG.options.allowProposedApi).toBe(true);
      });
    });

    describe('Immutability', () => {
      it('should be read-only (const assertion)', () => {
        // TypeScript enforces this at compile time
        // Runtime check that object exists and has expected structure
        expect(XTERM_CONFIG).toBeDefined();
        expect(XTERM_CONFIG.fontFamily).toBeDefined();
        expect(XTERM_CONFIG.theme).toBeDefined();
        expect(XTERM_CONFIG.themeSdk).toBeDefined();
        expect(XTERM_CONFIG.options).toBeDefined();
      });
    });
  });

  describe('Integration tests', () => {
    it('should create buffer with ANSI cursor codes', () => {
      const lines = ['Test line'];
      const buffer = buildTerminalBuffer(lines);

      expect(buffer).toContain(ANSI.HIDE_CURSOR);
      expect(buffer).toContain(ANSI.SHOW_CURSOR);
    });

    it('should create complete ANSI screen update', () => {
      const lines = [
        ANSI.CLEAR_SCREEN,
        ANSI.moveCursor(1, 1) + 'Header',
        ANSI.moveCursor(1, 2) + ANSI.setColors(7, 0) + 'Content',
        ANSI.RESET,
      ];

      const buffer = buildTerminalBuffer(lines);

      expect(buffer).toContain(ANSI.CLEAR_SCREEN);
      expect(buffer).toContain('Header');
      expect(buffer).toContain('Content');
      expect(buffer).toContain(ANSI.RESET);
    });

    it('should build colored terminal output', () => {
      const lines = [
        ANSI.setColors(1, 0) + 'Red text',
        ANSI.setColors(2, 0) + 'Green text',
        ANSI.setColors(4, 0) + 'Blue text',
        ANSI.RESET,
      ];

      const buffer = buildTerminalBuffer(lines);

      expect(buffer).toContain('\x1b[0;31;40m');
      expect(buffer).toContain('\x1b[0;32;40m');
      expect(buffer).toContain('\x1b[0;34;40m');
      expect(buffer).toContain(ANSI.RESET);
    });
  });
});
