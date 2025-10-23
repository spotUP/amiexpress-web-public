/**
 * ANSI Color Codes and Terminal Control Sequences
 * Following the AmiExpress guideline: NO BOLD text styles (no \x1b[1;XXm)
 */

export const ANSI = {
  // Control sequences
  CLEAR_SCREEN: '\x1b[2J\x1b[H',
  RESET: '\x1b[0m',

  // Colors (normal weight only - no bold)
  BLACK: '\x1b[30m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',

  // Cursor movement
  CURSOR_UP: (n: number = 1) => `\x1b[${n}A`,
  CURSOR_DOWN: (n: number = 1) => `\x1b[${n}B`,
  CURSOR_FORWARD: (n: number = 1) => `\x1b[${n}C`,
  CURSOR_BACK: (n: number = 1) => `\x1b[${n}D`,
  CURSOR_HOME: '\x1b[H',
  CURSOR_POSITION: (row: number, col: number) => `\x1b[${row};${col}H`,

  // Line control
  CLEAR_LINE: '\x1b[2K',
  CLEAR_LINE_END: '\x1b[K',

  // Special keys
  F1_KEY: '\x1b[OP',
} as const;

export const LINE_ENDING = '\r\n' as const;
