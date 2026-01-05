/**
 * Output Utility - Buffered ANSI Output
 *
 * Drop-in replacement for socket.emit('ansi-output', text)
 * Maintains 100% express.e behavior while optimizing network performance
 *
 * CRITICAL: This maintains exact express.e output behavior:
 * - Output appears in same order
 * - Prompts flush immediately before waiting for input
 * - Pauses flush immediately before waiting for keypress
 * - No visible timing changes
 *
 * Usage:
 *   OLD: socket.emit('ansi-output', text);
 *   NEW: emitText(socket, text);
 *
 *   Before prompts:
 *   emitPrompt(socket, 'Enter name: '); // Auto-flushes
 */

import { Socket } from 'socket.io';
import { getAnsiBuffer, emitText as bufferEmitText, emitPrompt as bufferEmitPrompt } from './ansi-buffer.util';

/**
 * Emit text using buffered output
 * Batches multiple emits for network efficiency
 *
 * BEHAVIOR: Identical to socket.emit('ansi-output', text)
 * Output is buffered for 16ms (60fps) then auto-flushed
 *
 * @param socket - Socket.IO socket
 * @param text - Text to output
 */
export function emitText(socket: Socket, text: string): void {
  bufferEmitText(socket, text, false);
}

/**
 * Emit text and flush immediately
 * Use for prompts that wait for user input
 *
 * CRITICAL: Must flush before waiting for input to maintain express.e behavior
 *
 * Examples (express.e patterns):
 * - Input prompts: "Enter name: "
 * - Pause prompts: "(Pause)...More(y/n/ns)?"
 * - Command prompts: "Command: "
 * - Confirmation prompts: "Continue (Y/N)? "
 *
 * @param socket - Socket.IO socket
 * @param text - Prompt text
 */
export function emitPrompt(socket: Socket, text: string): void {
  bufferEmitPrompt(socket, text);
}

/**
 * Emit line with line ending
 * Convenience wrapper for emitText with \r\n
 *
 * @param socket - Socket.IO socket
 * @param text - Text to output (line ending added automatically)
 */
export function emitLine(socket: Socket, text: string = ''): void {
  emitText(socket, `${text}\r\n`);
}

/**
 * Force flush of buffered output
 * Use before operations that wait (pause, prompt, door execution)
 *
 * CRITICAL for express.e behavior:
 * - Before doPause() - ensures text visible before pause
 * - Before displayScreen() prompts - ensures prompt visible
 * - Before door execution - ensures all output sent
 * - Before file downloads - ensures messages visible
 *
 * @param socket - Socket.IO socket
 */
export function flushOutput(socket: Socket): void {
  const buffer = getAnsiBuffer(socket);
  buffer.flush();
}

/**
 * Emit multiple lines efficiently
 * Batches into single buffer operation
 *
 * @param socket - Socket.IO socket
 * @param lines - Array of lines to emit
 */
export function emitLines(socket: Socket, lines: string[]): void {
  const buffer = getAnsiBuffer(socket);
  for (const line of lines) {
    buffer.append(`${line}\r\n`);
  }
}

/**
 * Backwards compatibility: Direct socket.emit wrapper
 * Allows gradual migration without breaking existing code
 *
 * This can be used to replace socket.emit('ansi-output', text) patterns:
 *
 * Before:
 *   socket.emit('ansi-output', text);
 *
 * After (option 1 - buffered):
 *   emitText(socket, text);
 *
 * After (option 2 - immediate, for critical prompts):
 *   emitPrompt(socket, text);
 */
