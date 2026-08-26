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

  /**
   * Line height multiplier. Two contradictory constraints to balance:
   *   1. Pipe / box-drawing chars MUST connect vertically across rows
   *      (the bitmap font's pipe glyph fills its cell and slightly
   *      overflows into adjacent rows so neighbours touch).
   *   2. Regular chars (G/C/etc.) should have ~1-2px breathing room
   *      between rows; readers expect that visual rhythm.
   *
   * 1.0 makes cells exactly fontSize tall — pipes connect but regular
   * chars touch (no breathing room). 1.2 (the old value) gives plenty
   * of breathing room but breaks the pipe connection. 1.1 is the
   * sweet spot — small enough that the pipe glyph's overflow still
   * bridges the row, large enough that G/C have ~1-2px between them.
   */
  lineHeight: 1.0,

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
    // Hold Option (macOS) to select text with the mouse. A door with mouse
    // tracking on takes every drag for itself, so without this the screen
    // cannot be copied out of.
    macOptionClickForcesSelection: true,
    fontWeight: 'normal' as const,
    fontWeightBold: 'bold' as const,
    allowProposedApi: true,
  },
} as const;
