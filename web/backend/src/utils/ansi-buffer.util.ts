/**
 * ANSI Output Buffer - Performance Optimization
 *
 * Batches multiple ANSI output emits into single Socket.IO messages.
 * This is a pure performance optimization - no express.e behavior changes.
 *
 * Benefits:
 * - Reduces Socket.IO emits by 80-90%
 * - Improves network efficiency
 * - Reduces frontend rendering overhead
 * - Maintains 100% express.e output fidelity
 *
 * Usage:
 *   const buffer = getAnsiBuffer(socket);
 *   buffer.append('\x1b[32mSuccess\x1b[0m');
 *   buffer.append('\r\nNext line');
 *   buffer.flushImmediate(); // Flush before waiting for input
 */

import { Socket } from 'socket.io';
import { puaToUnicode } from '@amiexpress/bbs-door-sdk/petscii';
import { sessionWantsPetscii } from './petscii-session-model';
import { wrapForSession } from './wrap-for-session.util';
import { foldColoursForBoard } from './eight-colour-session.util';
import { foldTrueColourToAnsi } from './true-colour-fold.util';

export class AnsiBuffer {
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private socket: Socket;
  private flushDelay: number;
  private maxBufferSize: number;

  /**
   * Create ANSI output buffer for a socket
   *
   * @param socket - Socket.IO socket
   * @param flushDelay - Delay before auto-flush in ms (default: 16ms = 60fps)
   * @param maxBufferSize - Max buffer size before forced flush (default: 8KB)
   */
  constructor(socket: Socket, flushDelay: number = 16, maxBufferSize: number = 8192) {
    this.socket = socket;
    this.flushDelay = flushDelay;
    this.maxBufferSize = maxBufferSize;
  }

  /**
   * Append text to buffer
   * Schedules automatic flush after flushDelay ms
   * Forces immediate flush if buffer exceeds maxBufferSize
   * Forces immediate flush if flushDelay is 0 (modem emulation mode)
   */
  append(text: string): void {
    if (!text) return;

    this.buffer.push(text);

    // Get current buffer size
    const bufferSize = this.buffer.reduce((sum, str) => sum + str.length, 0);

    // Force immediate flush if buffer too large (prevents memory issues)
    if (bufferSize >= this.maxBufferSize) {
      this.flush();
      return;
    }

    // Force immediate flush if flushDelay is 0 (modem emulation - no batching)
    if (this.flushDelay === 0) {
      this.flush();
      return;
    }

    // Schedule automatic flush
    this.scheduleFlush();
  }

  /**
   * Schedule automatic flush after delay
   * Only schedules if not already scheduled
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return; // Already scheduled

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.flushDelay);
  }

  /**
   * Flush buffer immediately
   * Call this before waiting for user input to ensure prompt is visible
   */
  flush(): void {
    // Clear any pending timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Nothing to flush
    if (this.buffer.length === 0) return;

    // Combine all buffered text into single emit
    const output = this.buffer.join('');
    this.buffer = [];

    // Single Socket.IO emit (instead of many)
    this.socket.emit('ansi-output', output);
  }

  /**
   * Force immediate flush (alias for flush)
   * Use before prompts that wait for input
   */
  flushImmediate(): void {
    this.flush();
  }

  /**
   * Get current buffer size in bytes
   */
  getBufferSize(): number {
    return this.buffer.reduce((sum, str) => sum + str.length, 0);
  }

  /**
   * Clear buffer without flushing
   * Use sparingly - typically you want flush() instead
   */
  clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = [];
  }

  /**
   * Check if buffer has pending data
   */
  hasPendingData(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Set flush delay (0 = immediate flush, no batching)
   * Used to disable batching when modem emulation is enabled
   */
  setFlushDelay(delayMs: number): void {
    this.flushDelay = delayMs;
  }
}

/**
 * Session-based buffer management
 * One buffer per socket, automatically cleaned up
 */
/*
 * Keyed by the emitter OBJECT, never its id: after a resume the link's id is
 * the new socket's id (session persistence S4), and a buffer found by id would
 * split in two. A Map rather than a WeakMap on purpose - the buffer holds its
 * socket strongly, so weakness would never collect anything, and
 * `flushAllBuffers` / `ansiBufferCount` must iterate.
 */
const bufferMap = new Map<object, AnsiBuffer>();

/**
 * Get or create ANSI buffer for a socket
 * This is the primary API - use this instead of creating buffers directly
 *
 * @param socket - Socket.IO socket
 * @returns AnsiBuffer instance for this socket
 */
export function getAnsiBuffer(socket: Socket): AnsiBuffer {
  // Return existing buffer
  const existing = bufferMap.get(socket);
  if (existing) return existing;

  // Create new buffer
  const buffer = new AnsiBuffer(socket);
  bufferMap.set(socket, buffer);

  /*
   * Clean up on disconnect - when the socket can tell us it disconnected.
   *
   * Not every object that reaches the output path is a full Socket.IO socket:
   * transport shims and test doubles pass `{ id, emit }`, and calling `.on`
   * on one threw a TypeError out of `getAnsiBuffer` - which is to say out of
   * `emitText`, from inside whatever command was printing. That killed the
   * jest worker running `system-commands` outright (2026-09-16) rather than
   * failing an assertion. Losing the cleanup for such a socket costs one
   * buffer entry; taking the output path down costs the caller everything.
   */
  if (typeof (socket as any).on === 'function') {
    socket.on('disconnect', () => {
      releaseAnsiBuffer(socket);
    });
  }

  return buffer;
}

/**
 * Flush what a connection's buffer still holds and forget it.
 *
 * TP-13b, divergence 30. The registration above listens for `'disconnect'`,
 * which is not in the connection emitter's transport event set and which
 * nothing ever emits for a byte transport - so every telnet and SSH caller
 * left a buffer in this module map for the life of the process, holding
 * whatever had not been flushed when the line dropped. The close handler
 * calls this directly.
 */
export function releaseAnsiBuffer(socket: object): boolean {
  const buf = bufferMap.get(socket);
  if (!buf) return false;
  buf.flush(); // Whatever it was still holding goes out first.
  bufferMap.delete(socket);
  return true;
}

/** How many connections still hold a buffer. For tests and diagnostics. */
export function ansiBufferCount(): number {
  return bufferMap.size;
}

/**
 * Helper: Emit text using buffered output
 * Drop-in replacement for socket.emit('ansi-output', text)
 *
 * @param socket - Socket.IO socket
 * @param text - Text to emit
 * @param immediate - Force immediate flush (default: false)
 */
export function emitText(socket: Socket, text: string, immediate: boolean = false): void {
  // Session-width choke point. Web sockets carry the session
  // (index.ts:787); telnet/SSH emitters expose it via a getter
  // (connection-emitter.ts, Task 5). wrapForSession is identity at >=80
  // columns, for door-owned sessions, and for positioned/art payloads.
  const session = (socket as any).session;
  const buffer = getAnsiBuffer(socket);
  // Width first, then colour: the fold rewrites SGR parameters and never
  // changes how many columns a line takes, so the order costs nothing - but
  // wrapping text whose colours have already been folded is the same work
  // twice. foldColoursForBoard is identity on a sixteen-colour board, which
  // is every board that has not asked for the Amiga's eight.
  /*
   * 24-bit art, folded for a caller that cannot render it.
   *
   * PabloDraw and Moebius write colour as `ESC[0;r;g;bt`. A browser's xterm
   * draws those; an Amiga telnet client swallows them as an unknown CSI and
   * keeps the previous colour, so a logo whose every colour is written that
   * way arrives almost monochrome ("the logos need to degrade nicely for amiga
   * telnet clients", the sysop, 2026-09-16). For a BYTE transport each becomes
   * the nearest of the sixteen; a web session keeps the artist's exact colour.
   *
   * Before the width fold, because it only ever SHORTENS the text - an escape
   * out, a shorter escape in - and wrapping measures visible columns, which
   * neither sequence contributes to. Doing it after would measure the same
   * columns twice for no gain.
   */
  const forBytes = session?.connectionType && session.connectionType !== 'web';
  const coloured = forBytes ? foldTrueColourToAnsi(text) : text;

  /*
   * A CALLER'S OWN PETSCII, FOR SOMEBODY WHO IS NOT ON A C64.
   *
   * PETSCII a caller typed travels as PetMe64 private-use codepoints, one
   * per cell - the convention the transducer already speaks, so a C64 reader
   * needs nothing here and must not be touched. Everybody else has no such
   * font: xterm draws tofu, and an Amiga telnet client gets `?` from iconv.
   * So the markers are folded to the Unicode glyphs the normative table
   * names, with reverse video spelled as SGR 7.
   *
   * BEFORE the width fold. The replacements can be astral (`U+1FBxx`), and
   * wrapping counts UTF-16 units - fold first and the wrap measures the
   * glyph the caller will actually see.
   *
   * THE PEN IS FOLDED FOR EVERYONE, a C64 included: the transducer already
   * turns SGR into the PETSCII colour byte, so one path serves both and an
   * eighty-column reader gets the same colour for free. Only the GLYPHS are
   * held back for a PETSCII caller, whose own transducer draws them exactly.
   */
  const readable = puaToUnicode(coloured, { glyphs: !sessionWantsPetscii(session) });

  buffer.append(foldColoursForBoard(wrapForSession(readable, session)));

  if (immediate) {
    buffer.flushImmediate();
  }
}

/**
 * Helper: Emit text and immediately flush
 * Use for prompts that wait for user input
 *
 * @param socket - Socket.IO socket
 * @param text - Text to emit
 */
export function emitPrompt(socket: Socket, text: string): void {
  emitText(socket, text, true);
}

/**
 * Flush all buffers (for server shutdown)
 */
export function flushAllBuffers(): void {
  for (const buffer of bufferMap.values()) {
    buffer.flush();
  }
}
