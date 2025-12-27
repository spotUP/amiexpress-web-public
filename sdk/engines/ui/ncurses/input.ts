/**
 * ncurses Compatibility Layer - Input Handling
 *
 * This module handles ncurses-style input operations:
 * - getch() - Get single character (async in TypeScript)
 * - getstr() - Get string input
 * - ungetch() - Push character back to input
 * - Key code translation
 *
 * Since JavaScript is async, getch() returns a Promise.
 * For game loops, use nodelay mode with timeout.
 */

import {
  KEY_UP,
  KEY_DOWN,
  KEY_LEFT,
  KEY_RIGHT,
  KEY_HOME,
  KEY_END,
  KEY_PPAGE,
  KEY_NPAGE,
  KEY_IC,
  KEY_DC,
  KEY_BACKSPACE,
  KEY_ENTER,
  KEY_F1,
  KEY_F2,
  KEY_F3,
  KEY_F4,
  KEY_F5,
  KEY_F6,
  KEY_F7,
  KEY_F8,
  KEY_F9,
  KEY_F10,
  KEY_F11,
  KEY_F12,
  KEY_MOUSE,
  KEY_RESIZE,
  keyNameToCode,
  ERR,
} from './constants';

// ============================================================================
// Input State
// ============================================================================

/**
 * Input buffer for ungetch
 */
const inputBuffer: number[] = [];

/**
 * Pending key queue for non-blocking reads
 */
const pendingKeys: number[] = [];

/**
 * Input callback for receiving keystrokes
 * Set by the ncurses initialization
 */
let inputCallback: ((resolve: (key: number) => void) => void) | null = null;

/**
 * Current input mode
 */
let rawMode = false;
let cbreakMode = false;
let echoMode = true;
let keypadMode = true;

/**
 * Input timeout in milliseconds (-1 = blocking)
 */
let inputTimeoutMs = -1;

/**
 * Nodelay mode (non-blocking)
 */
let nodelayModeEnabled = false;

// ============================================================================
// Input Mode Control
// ============================================================================

/**
 * Enable raw mode (no line buffering, no signal processing)
 */
export function raw(): number {
  rawMode = true;
  cbreakMode = false;
  return 0;
}

/**
 * Disable raw mode
 */
export function noraw(): number {
  rawMode = false;
  return 0;
}

/**
 * Enable cbreak mode (no line buffering, signals processed)
 */
export function cbreak(): number {
  cbreakMode = true;
  rawMode = false;
  return 0;
}

/**
 * Disable cbreak mode
 */
export function nocbreak(): number {
  cbreakMode = false;
  return 0;
}

/**
 * Enable echo mode
 */
export function echo(): number {
  echoMode = true;
  return 0;
}

/**
 * Disable echo mode
 */
export function noecho(): number {
  echoMode = false;
  return 0;
}

/**
 * Enable keypad mode (translate function keys)
 */
export function keypad(bf: boolean): number {
  keypadMode = bf;
  return 0;
}

/**
 * Enable nodelay mode (non-blocking getch)
 */
export function nodelay(bf: boolean): number {
  nodelayModeEnabled = bf;
  return 0;
}

/**
 * Set input timeout
 * @param delay - Timeout in milliseconds (-1 = blocking)
 */
export function timeout(delay: number): void {
  inputTimeoutMs = delay;
}

/**
 * Half-delay mode (tenths of seconds)
 * @param tenths - Timeout in tenths of seconds
 */
export function halfdelay(tenths: number): number {
  if (tenths < 1 || tenths > 255) {
    return ERR;
  }
  inputTimeoutMs = tenths * 100;
  return 0;
}

// ============================================================================
// Input Callback Setup
// ============================================================================

/**
 * Set the input callback function
 * This is called by ncurses.ts during initialization
 */
export function setInputCallback(callback: (resolve: (key: number) => void) => void): void {
  inputCallback = callback;
}

/**
 * Get current input callback
 */
export function getInputCallback(): ((resolve: (key: number) => void) => void) | null {
  return inputCallback;
}

// ============================================================================
// Key Translation
// ============================================================================

/**
 * Translate a blessed key event to ncurses key code
 *
 * @param ch - Character (if printable)
 * @param key - Key object from blessed
 * @returns ncurses key code
 */
export function translateKey(
  ch: string | undefined,
  key: { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean; sequence?: string }
): number {
  const sequence = key.sequence ?? key.name ?? ch;

  // Check for special keys by name
  if (key.name && keyNameToCode[key.name]) {
    return keyNameToCode[key.name];
  }

  // Handle specific key names
  switch (key.name) {
    case 'up':
      return KEY_UP;
    case 'down':
      return KEY_DOWN;
    case 'left':
      return KEY_LEFT;
    case 'right':
      return KEY_RIGHT;
    case 'home':
      return KEY_HOME;
    case 'end':
      return KEY_END;
    case 'pageup':
      return KEY_PPAGE;
    case 'pagedown':
      return KEY_NPAGE;
    case 'insert':
      return KEY_IC;
    case 'delete':
      return KEY_DC;
    case 'backspace':
      return KEY_BACKSPACE;
    case 'enter':
    case 'return':
      return KEY_ENTER;
    case 'tab':
      return 9;
    case 'escape':
      return 27;
    case 'space':
      return 32;

    // Function keys
    case 'f1':
      return KEY_F1;
    case 'f2':
      return KEY_F2;
    case 'f3':
      return KEY_F3;
    case 'f4':
      return KEY_F4;
    case 'f5':
      return KEY_F5;
    case 'f6':
      return KEY_F6;
    case 'f7':
      return KEY_F7;
    case 'f8':
      return KEY_F8;
    case 'f9':
      return KEY_F9;
    case 'f10':
      return KEY_F10;
    case 'f11':
      return KEY_F11;
    case 'f12':
      return KEY_F12;
  }

  // Handle escape sequences when key name is raw data
  if (sequence && sequence.startsWith('\x1b')) {
    const parsedName = parseEscapeSequence(sequence);
    if (parsedName && keyNameToCode[parsedName]) {
      return keyNameToCode[parsedName];
    }
  }

  // Handle control characters
  if (key.ctrl && ch && ch.length === 1) {
    const code = ch.charCodeAt(0);
    // Ctrl+A through Ctrl+Z = 1-26
    if (code >= 1 && code <= 26) {
      return code;
    }
    // Ctrl+letter
    if (code >= 97 && code <= 122) {
      // a-z
      return code - 96; // a=1, b=2, etc.
    }
    if (code >= 65 && code <= 90) {
      // A-Z
      return code - 64;
    }
  }

  // Regular printable character
  if (ch && ch.length === 1) {
    return ch.charCodeAt(0);
  }

  // Unknown key
  return ERR;
}

/**
 * Parse ANSI escape sequences into key names
 */
function parseEscapeSequence(sequence: string): string | null {
  // SS3 sequences (F1-F4 and arrows on some terminals)
  if (sequence[1] === 'O' && sequence.length === 3) {
    const final = sequence[2];
    if (final === 'P') return 'f1';
    if (final === 'Q') return 'f2';
    if (final === 'R') return 'f3';
    if (final === 'S') return 'f4';
    if (final === 'A') return 'up';
    if (final === 'B') return 'down';
    if (final === 'C') return 'right';
    if (final === 'D') return 'left';
    if (final === 'H') return 'home';
    if (final === 'F') return 'end';
  }

  // CSI sequences
  if (sequence[1] === '[') {
    const match = sequence.match(/^\x1b\[([0-9;]+)?([A-Za-z~])/);
    if (!match) return null;

    const params = match[1] ? match[1].split(';').map(Number) : [];
    const final = match[2];

    if (final === 'A') return 'up';
    if (final === 'B') return 'down';
    if (final === 'C') return 'right';
    if (final === 'D') return 'left';
    if (final === 'H') return 'home';
    if (final === 'F') return 'end';

    if (final === '~') {
      const code = params[0] || 0;
      if (code === 1) return 'home';
      if (code === 2) return 'insert';
      if (code === 3) return 'delete';
      if (code === 4) return 'end';
      if (code === 5) return 'pageup';
      if (code === 6) return 'pagedown';
      if (code >= 11 && code <= 15) return `f${code - 10}`;
      if (code >= 17 && code <= 21) return `f${code - 11}`;
      if (code >= 23 && code <= 24) return `f${code - 12}`;
    }
  }

  return null;
}

// ============================================================================
// Core Input Functions
// ============================================================================

/**
 * Get a single character (async)
 *
 * In ncurses, getch() blocks. In TypeScript, we return a Promise.
 * For non-blocking behavior, use nodelay(true) first.
 *
 * @returns Promise resolving to key code, or ERR if no input available
 */
export async function getch(): Promise<number> {
  // Check ungetch buffer first
  if (inputBuffer.length > 0) {
    return inputBuffer.pop()!;
  }

  // Check queued keys
  if (pendingKeys.length > 0) {
    return pendingKeys.shift()!;
  }

  // If no input callback, return ERR
  if (!inputCallback) {
    return ERR;
  }

  // If nodelay mode, check immediately without waiting
  if (nodelayModeEnabled) {
    return ERR;
  }

  // With timeout
  if (inputTimeoutMs > 0) {
    return new Promise<number>((resolve) => {
      let resolved = false;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(ERR);
        }
      }, inputTimeoutMs);

      inputCallback!((key) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve(key);
        }
      });
    });
  }

  // Blocking mode (wait indefinitely)
  return new Promise<number>((resolve) => {
    inputCallback!(resolve);
  });
}

/**
 * Push character back to input buffer
 *
 * @param ch - Character code to push back
 * @returns OK on success
 */
export function ungetch(ch: number): number {
  inputBuffer.push(ch);
  return 0;
}

/**
 * Check if input is available (non-blocking)
 *
 * @returns true if getch() would return immediately
 */
export function hasInput(): boolean {
  return inputBuffer.length > 0 || pendingKeys.length > 0;
}

/**
 * Get a string of characters
 *
 * @param maxLen - Maximum length (-1 = unlimited)
 * @returns Promise resolving to input string
 */
export async function getstr(maxLen: number = -1): Promise<string> {
  let result = '';

  while (true) {
    const ch = await getch();

    if (ch === ERR) {
      continue; // Ignore errors in getstr
    }

    if (ch === KEY_ENTER || ch === 10 || ch === 13) {
      break; // Enter ends input
    }

    if (ch === KEY_BACKSPACE || ch === 127 || ch === 8) {
      // Backspace
      if (result.length > 0) {
        result = result.slice(0, -1);
        if (echoMode) {
          // Echo backspace (erase character)
          // This would need screen access in practice
        }
      }
      continue;
    }

    if (ch === 27) {
      // Escape - cancel input
      return '';
    }

    // Add printable character
    if (ch >= 32 && ch < 127) {
      if (maxLen < 0 || result.length < maxLen) {
        result += String.fromCharCode(ch);
        if (echoMode) {
          // Echo character
          // This would need screen access in practice
        }
      }
    }
  }

  return result;
}

/**
 * Get n characters
 *
 * @param n - Maximum number of characters
 * @returns Promise resolving to input string
 */
export async function getnstr(n: number): Promise<string> {
  return getstr(n);
}

/**
 * Move cursor and get string
 * (This is a convenience - actual movement happens in ncurses.ts)
 */
export async function mvgetstr(
  _y: number,
  _x: number,
  maxLen: number = -1
): Promise<string> {
  return getstr(maxLen);
}

/**
 * Move cursor and get n characters
 */
export async function mvgetnstr(_y: number, _x: number, n: number): Promise<string> {
  return getnstr(n);
}

// ============================================================================
// Mode Queries
// ============================================================================

/**
 * Check if raw mode is enabled
 */
export function isRawMode(): boolean {
  return rawMode;
}

/**
 * Check if cbreak mode is enabled
 */
export function isCbreakMode(): boolean {
  return cbreakMode;
}

/**
 * Check if echo mode is enabled
 */
export function isEchoMode(): boolean {
  return echoMode;
}

/**
 * Check if keypad mode is enabled
 */
export function isKeypadMode(): boolean {
  return keypadMode;
}

/**
 * Check if nodelay mode is enabled
 */
export function isNodelayMode(): boolean {
  return nodelayModeEnabled;
}

/**
 * Get current timeout
 */
export function getTimeout(): number {
  return inputTimeoutMs;
}

// ============================================================================
// Input Buffer Management
// ============================================================================

/**
 * Clear input buffer
 */
export function flushinp(): number {
  inputBuffer.length = 0;
  pendingKeys.length = 0;
  return 0;
}

/**
 * Get size of input buffer
 */
export function getInputBufferSize(): number {
  return inputBuffer.length + pendingKeys.length;
}

/**
 * Queue a key code when no getch() is waiting
 */
export function queueInput(keyCode: number): void {
  pendingKeys.push(keyCode);
}

// ============================================================================
// Key Name Utilities
// ============================================================================

/**
 * Get the name of a key code
 *
 * @param keyCode - ncurses key code
 * @returns Key name string
 */
export function keyname(keyCode: number): string {
  // Check special keys
  switch (keyCode) {
    case KEY_UP:
      return 'KEY_UP';
    case KEY_DOWN:
      return 'KEY_DOWN';
    case KEY_LEFT:
      return 'KEY_LEFT';
    case KEY_RIGHT:
      return 'KEY_RIGHT';
    case KEY_HOME:
      return 'KEY_HOME';
    case KEY_END:
      return 'KEY_END';
    case KEY_PPAGE:
      return 'KEY_PPAGE';
    case KEY_NPAGE:
      return 'KEY_NPAGE';
    case KEY_IC:
      return 'KEY_IC';
    case KEY_DC:
      return 'KEY_DC';
    case KEY_BACKSPACE:
      return 'KEY_BACKSPACE';
    case KEY_ENTER:
      return 'KEY_ENTER';
    case KEY_F1:
      return 'KEY_F1';
    case KEY_F2:
      return 'KEY_F2';
    case KEY_F3:
      return 'KEY_F3';
    case KEY_F4:
      return 'KEY_F4';
    case KEY_F5:
      return 'KEY_F5';
    case KEY_F6:
      return 'KEY_F6';
    case KEY_F7:
      return 'KEY_F7';
    case KEY_F8:
      return 'KEY_F8';
    case KEY_F9:
      return 'KEY_F9';
    case KEY_F10:
      return 'KEY_F10';
    case KEY_F11:
      return 'KEY_F11';
    case KEY_F12:
      return 'KEY_F12';
    case KEY_MOUSE:
      return 'KEY_MOUSE';
    case KEY_RESIZE:
      return 'KEY_RESIZE';
  }

  // Control characters
  if (keyCode >= 0 && keyCode < 32) {
    return `^${String.fromCharCode(64 + keyCode)}`;
  }

  // Printable ASCII
  if (keyCode >= 32 && keyCode < 127) {
    return String.fromCharCode(keyCode);
  }

  // DEL
  if (keyCode === 127) {
    return '^?';
  }

  // Unknown
  return `KEY_UNKNOWN(${keyCode})`;
}

/**
 * Check if key code is a function key
 */
export function isFunctionKey(keyCode: number): boolean {
  return keyCode >= KEY_F1 && keyCode <= KEY_F12;
}

/**
 * Check if key code is an arrow key
 */
export function isArrowKey(keyCode: number): boolean {
  return keyCode === KEY_UP || keyCode === KEY_DOWN || keyCode === KEY_LEFT || keyCode === KEY_RIGHT;
}

/**
 * Check if key code is printable
 */
export function isPrintable(keyCode: number): boolean {
  return keyCode >= 32 && keyCode < 127;
}
