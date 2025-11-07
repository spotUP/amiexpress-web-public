/**
 * ANSI Output Utilities
 *
 * Provides centralized utilities for BBS output with cursor hiding and double buffering
 * to prevent screen tearing and flickering during redraws.
 */

import { Socket } from 'socket.io';

/**
 * Hide cursor (ANSI escape code)
 */
export const HIDE_CURSOR = '\x1b[?25l';

/**
 * Show cursor (ANSI escape code)
 */
export const SHOW_CURSOR = '\x1b[?25h';

/**
 * Clear screen (ANSI escape code)
 */
export const CLEAR_SCREEN = '\x1b[2J\x1b[H';

/**
 * Position cursor (1-indexed)
 * @param x - Column (1-80)
 * @param y - Row (1-24)
 */
export function moveCursor(x: number, y: number): string {
  return `\x1b[${y};${x}H`;
}

/**
 * Set ANSI colors (no bold)
 * @param fg - Foreground color (0-7)
 * @param bg - Background color (0-7)
 */
export function setColors(fg: number, bg: number): string {
  return `\x1b[0;3${fg};4${bg}m`;
}

/**
 * Emit ANSI output to socket with optional double buffering
 *
 * @param socket - Socket.IO socket
 * @param data - ANSI data to emit (string or array of strings)
 * @param options - Output options
 */
export function emitAnsi(
  socket: Socket,
  data: string | string[],
  options: {
    hideCursor?: boolean;      // Hide cursor before, show after
    doubleBuffer?: boolean;    // Combine into single emit (already combined if data is string)
  } = {}
): void {
  const { hideCursor = false, doubleBuffer = false } = options;

  // Build output buffer
  let output = '';

  // Hide cursor if requested
  if (hideCursor) {
    output += HIDE_CURSOR;
  }

  // Add data (combine if array and doubleBuffer is true)
  if (Array.isArray(data)) {
    if (doubleBuffer) {
      output += data.join('');
    } else {
      // Emit array items individually (backwards compat)
      if (hideCursor) socket.emit('ansi-output', HIDE_CURSOR);
      data.forEach(item => socket.emit('ansi-output', item));
      if (hideCursor) socket.emit('ansi-output', SHOW_CURSOR);
      return;
    }
  } else {
    output += data;
  }

  // Show cursor if requested
  if (hideCursor) {
    output += SHOW_CURSOR;
  }

  // Emit single combined buffer
  socket.emit('ansi-output', output);
}

/**
 * Buffered screen renderer
 * Provides a builder pattern for constructing screen output with automatic cursor hiding
 */
export class ScreenBuffer {
  private buffer: string = '';
  private socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  /**
   * Add raw ANSI data to buffer
   */
  write(data: string): this {
    this.buffer += data;
    return this;
  }

  /**
   * Add text at position with colors
   */
  writeAt(x: number, y: number, text: string, fg: number = 7, bg: number = 0): this {
    this.buffer += moveCursor(x, y) + setColors(fg, bg) + text;
    return this;
  }

  /**
   * Clear screen
   */
  clear(): this {
    this.buffer += CLEAR_SCREEN;
    return this;
  }

  /**
   * Move cursor
   */
  move(x: number, y: number): this {
    this.buffer += moveCursor(x, y);
    return this;
  }

  /**
   * Set colors
   */
  colors(fg: number, bg: number): this {
    this.buffer += setColors(fg, bg);
    return this;
  }

  /**
   * Flush buffer to socket with cursor hiding
   */
  flush(options: { hideCursor?: boolean } = { hideCursor: true }): void {
    emitAnsi(this.socket, this.buffer, {
      hideCursor: options.hideCursor,
      doubleBuffer: true
    });
    this.buffer = '';
  }

  /**
   * Get buffer contents without flushing
   */
  toString(): string {
    return this.buffer;
  }

  /**
   * Clear buffer without flushing
   */
  reset(): this {
    this.buffer = '';
    return this;
  }
}

/**
 * Create a screen buffer for building complex output
 */
export function createScreenBuffer(socket: Socket): ScreenBuffer {
  return new ScreenBuffer(socket);
}
