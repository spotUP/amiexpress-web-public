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
 *
 * THE RULE THESE TWO FUNCTIONS CARRY NO ATTRIBUTE BY (TP-5,
 * thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md).
 *
 * `emitText` / `emitPrompt` wrap `utils/ansi-buffer.util.ts`, which
 * CONCATENATES payloads before flushing them as one `ansi-output`. A
 * per-payload attribute - the source charset a screen file was decoded from,
 * `utils/output-pacing.ts` - cannot survive that concatenation: two payloads
 * from two charsets would leave as one string under one attribute, and
 * whichever attribute won would mis-encode the other half.
 *
 * So: SCREEN-FILE CONTENT DOES NOT GO THROUGH THESE FUNCTIONS, and must not
 * start. It goes out through `socket.emit(eventName, text, attrs)` in
 * `handlers/screen.handler.ts`, which is a direct emit for exactly this
 * reason. Composed text - prompts, notices, menus a handler built - is what
 * belongs here, has no source charset, and is encoded to the caller's
 * negotiated wire charset. Pinned by `tests/transport/wire-encoding.test.ts`.
 */

import { ANSI } from '../constants/ansi-codes';
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
 * The rest of THIS row, erased - or nothing, for a caller who cannot.
 *
 * express.e never erases. `uploadDesc` (express.e:17656-17665) is plain
 * `aePuts` and so is everything around it, and on a real terminal it never
 * had to be anything else: output scrolled, and a line arrived on a row that
 * was already blank.
 *
 * This board draws over full-screen ANSI art that does NOT scroll away, so a
 * line shorter than what sat behind it keeps the tail. The sysop met it as
 * an upload prompt with somebody else's text welded to it, 2026-09-15:
 *
 *   FileName 1: eb BBS [1:Amiga Demoscene!] Menu (9999 mins. left):
 *
 * `FileName 1: ` is twelve columns and so is `The Uptown W` - the menu
 * prompt's first twelve - which is the whole of the bug: column 12 onward was
 * never written, so it was never replaced.
 *
 * Returns the empty string when the caller has told us it has no ANSI, so a
 * PETSCII terminal is not sent an escape sequence it would print as glyphs.
 * An unset flag erases, which is what every existing site here assumes
 * (`flag-pause.util`, `screen.handler`'s pause cleanup).
 */
/**
 * Clear the screen, in whatever the caller's terminal speaks.
 *
 * express.e does NOT do this before an upload - `uploadDesc` opens with
 * `cleanItUp()` (express.e:17656), which cleans the node's WORK DIRECTORY, not
 * the screen - and I cited that twice as a reason the mess was not a bug. The
 * sysop overruled it, 2026-09-15: "clear. the. fucking. screen. before.
 * drawing. the. upload. stuff."
 *
 * He is right about the board he runs. Real AmiExpress scrolls its output up a
 * terminal that holds nothing but that output; this one draws over full-screen
 * ANSI art that stays where it is, so "don't clear" inherits a background
 * express.e never had to share a screen with. Erasing each row as it is
 * written (see `eraseRestOfLine`) fixed the welded tails and still left the art
 * between and above the lines.
 *
 * PETSCII gets 0x93, its own CLEAR, rather than an ANSI sequence it would draw
 * as glyphs - the same ternary `mci-pre-passes.ts:611` already uses.
 */
export function clearTheScreen(socket: Socket): string {
  const session = (socket as any)?.session;
  return session?.petsciiMode ? '\x93' : ANSI.CLEAR_SCREEN;
}

/**
 * express.e send017 (5210-5216): one 0x0F (SI, shift in) byte, sent before
 * sendCLS where the sysop's screens may follow a door or teletext art that
 * shifted out (0x0E). PETSCII has no shift-in: 0x0F is not a PETSCII control,
 * so a C64 caller gets nothing - the same ternary as clearTheScreen.
 */
export function send017(socket: Socket): string {
  const session = (socket as any)?.session;
  return session?.petsciiMode ? '' : '\x0f';
}

export function eraseRestOfLine(socket: Socket): string {
  const session = (socket as any)?.session;
  if (session && session.ansiEnabled === false) return '';
  return ANSI.CLEAR_LINE_END;
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
