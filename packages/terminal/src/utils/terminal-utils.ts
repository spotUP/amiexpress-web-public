/**
 * Shared Terminal Utilities
 *
 * Common ANSI codes and terminal utilities used by both BBS and SDK terminals.
 * This prevents code duplication and ensures consistent behavior.
 */

/**
 * ANSI escape codes for cursor control
 */
export const ANSI = {
  /** Hide cursor: \x1b[?25l */
  HIDE_CURSOR: '\x1b[?25l',

  /** Show cursor: \x1b[?25h */
  SHOW_CURSOR: '\x1b[?25h',

  /** Clear screen and move to home: \x1b[2J\x1b[H */
  CLEAR_SCREEN: '\x1b[2J\x1b[H',

  /** Move cursor to position (1-indexed) */
  moveCursor: (x: number, y: number): string => `\x1b[${y};${x}H`,

  /** Set ANSI colors (no bold) */
  setColors: (fg: number, bg: number): string => `\x1b[0;3${fg};4${bg}m`,

  /** Reset all attributes */
  RESET: '\x1b[0m',
} as const;

/**
 * Double buffering helper for xterm.js
 * Builds a buffered output string with cursor hiding to prevent flickering
 *
 * @param lines - Array of lines to write
 * @param options - Buffer options
 * @returns Buffered ANSI string ready to write
 *
 * @example
 * ```ts
 * const buffer = buildTerminalBuffer(['Line 1', 'Line 2'], { hideCursor: true });
 * terminal.write(buffer);
 * ```
 */
export function buildTerminalBuffer(
  lines: string[],
  options: {
    hideCursor?: boolean;
    lineEnding?: string;
  } = {}
): string {
  const { hideCursor = true, lineEnding = '\r\n' } = options;

  let buffer = '';

  // Hide cursor to prevent flickering during screen updates
  if (hideCursor) {
    buffer += ANSI.HIDE_CURSOR;
  }

  // Add all lines
  lines.forEach((line) => {
    buffer += line + lineEnding;
  });

  // Show cursor after update
  if (hideCursor) {
    buffer += ANSI.SHOW_CURSOR;
  }

  return buffer;
}

/**
 * XTerm.js common configuration
 * Shared terminal settings for consistent appearance and behavior
 */
export const XTERM_CONFIG = {
  /** Default BBS font family - includes Unicode symbol fonts for braille/special chars */
  fontFamily: 'mosoul, "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", "Courier New", monospace',

  /** Default font size */
  fontSize: 16,

  /** Line height multiplier */
  lineHeight: 1.2,

  /** BBS color theme (Amiga-style) */
  theme: {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ff0000',
    black: '#000000',
    red: '#ff0000',
    green: '#00ff00',
    yellow: '#ffff00',
    blue: '#0000ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff',
    brightBlack: '#808080',
    brightRed: '#ff8080',
    brightGreen: '#80ff80',
    brightYellow: '#ffff80',
    brightBlue: '#8080ff',
    brightMagenta: '#ff80ff',
    brightCyan: '#80ffff',
    brightWhite: '#ffffff',
  },

  /** SDK color theme (dark editor style) */
  themeSdk: {
    background: '#1E1E1E',
    foreground: '#CCCCCC',
    cursor: '#CCCCCC',
    black: '#000000',
    red: '#ff0000',
    green: '#00ff00',
    yellow: '#ffff00',
    blue: '#0000ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff',
    brightBlack: '#808080',
    brightRed: '#ff8080',
    brightGreen: '#80ff80',
    brightYellow: '#ffff80',
    brightBlue: '#8080ff',
    brightMagenta: '#ff80ff',
    brightCyan: '#80ffff',
    brightWhite: '#ffffff',
  },

  /** Common options */
  options: {
    allowTransparency: false,
    cursorBlink: true,
    cursorStyle: 'block' as const,
    scrollback: 10000,
    fontWeight: 'normal' as const,
    fontWeightBold: 'bold' as const,
    allowProposedApi: true,
  },
} as const;
