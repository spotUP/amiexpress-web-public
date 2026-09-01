/**
 * Socket.io-shaped emitter for telnet/SSH connections (Task 9: raw-byte
 * PETSCII transport).
 *
 * Extracted from the object literal that used to live inline inside
 * `setupTelnetSSHHandler` (index.ts) so `buildConnectionEmitter` can be
 * constructed directly in tests without importing index.ts — index.ts runs
 * a top-level IIFE that starts the HTTP/telnet/SSH servers as a side effect
 * of module load, which makes it unsafe to `require` from a test process.
 * See tests/handlers/petscii-bytes-transport.test.ts.
 *
 * Backs synthetic events ('command', 'file-uploaded', etc.) with a real
 * EventEmitter so DoorManager's socket.once/on/listenerCount calls behave
 * the same on telnet/SSH as they do on web. Transport I/O ('ansi-output',
 * 'petscii-output', 'petscii-bytes') is routed straight to connection.write.
 */
import { EventEmitter } from "events";
import type { TelnetConnection } from "./telnet-server";
import type { SSHConnection } from "./ssh-server";
import {
  convertAsciiToPetsciiOutput,
  convertUnicodePuaToPetscii,
  convertPetsciiToPetMe64,
} from "../utils/petscii.util";

export function buildConnectionEmitter(connection: TelnetConnection | SSHConnection): any {
  const eventBus = new EventEmitter();
  eventBus.setMaxListeners(50);

  const emitter: any = {
    // socket.io's `.once / .removeListener / .removeAllListeners /
    // .listenerCount / .listeners` all map to the synthetic event bus.
    once: (event: string, handler: (...args: any[]) => void) => {
      eventBus.once(event, handler);
      return emitter;
    },
    listenerCount: (event: string) => eventBus.listenerCount(event),
    listeners: (event: string) => eventBus.listeners(event),
    removeListener: (event: string, handler: (...args: any[]) => void) => {
      eventBus.removeListener(event, handler);
      return emitter;
    },
    removeAllListeners: (event?: string) => {
      eventBus.removeAllListeners(event);
      return emitter;
    },
    emitInternal: (event: string, ...args: any[]) => eventBus.emit(event, ...args),
    emit: (event: string, data: any) => {
      if (event === "ansi-output") {
        // Check if this is a C64/PETSCII terminal
        if (
          connection.session?.terminalType === "c64" ||
          connection.session?.petsciiMode
        ) {
          // C64 terminal - convert ASCII text to PETSCII with proper case handling
          // This handles prompts like "Username:", "Password:", etc.
          if (typeof data === "string") {
            // Strip ANSI escape sequences (C64 doesn't understand them)
            const strippedData = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
            // One-shot charset prelude (task 4 / audit E4): pre-login.ts
            // sets needsCharsetPrelude when it detects a real C64 or a
            // telnet session picks PETSCII mode, since a power-on/reset
            // C64 boots in unshifted/graphics mode. Send $0E once, on the
            // very first PETSCII write, then clear the flag.
            const needsPrelude = !!(connection.session as any)?.needsCharsetPrelude;
            const petsciiBytes = convertAsciiToPetsciiOutput(strippedData, { charsetPrelude: needsPrelude });
            if (needsPrelude) {
              (connection.session as any).needsCharsetPrelude = false;
            }
            connection.write(petsciiBytes);
          } else {
            connection.write(data);
          }
        } else {
          // Modern terminal or unknown - send as-is (ANSI codes),
          // but normalize bare LF to CRLF so raw TCP clients (nc,
          // some terminal apps without telnet NVT) don't stair-step
          // content across the screen. Proper telnet clients already
          // treat LF as "next row, column 0" via NVT; this is a no-op
          // for them. Only normalize strings — binary file transfer
          // buffers (e.g. ZModem) MUST pass through untouched.
          if (typeof data === "string") {
            connection.write(data.replace(/\r?\n/g, "\r\n"));
          } else {
            connection.write(data);
          }
        }
      } else if (event === "petscii-output") {
        // Handle PETSCII output based on terminal type
        if (connection.session?.terminalType === "c64") {
          // Real C64 - send raw PETSCII bytes (data is already in Unicode PUA format)
          // Need to convert Unicode PUA back to raw PETSCII bytes
          const petsciiBytes = convertUnicodePuaToPetscii(data);
          connection.write(petsciiBytes);
        } else {
          // Modern terminal - send Unicode PUA for PetMe64 font rendering
          connection.write(data);
        }
      } else if (event === "petscii-bytes") {
        // Raw-byte transport (Task 9): `data` is base64 of the exact .seq
        // bytes the loader read off disk.
        const raw = Buffer.from(data as string, "base64");
        if (connection.session?.terminalType === "c64" || connection.session?.petsciiMode) {
          // Real C64 (or a telnet session that picked PETSCII mode) - send
          // the raw bytes untouched. TelnetConnection.write (telnet-server.ts:433)
          // already doubles IAC ($FF) bytes per RFC 854 - do NOT double them
          // again here, or ZMODEM-style binary transfers desync (see the
          // 'ansi-output' binary-passthrough comment above for the same
          // lesson learned the hard way).
          connection.write(raw);
        } else {
          // Non-PETSCII terminal somehow reached PETSCII content: degrade
          // to the Unicode-PUA text representation instead of dropping it.
          connection.write(convertPetsciiToPetMe64(raw));
        }
      }
    },
    id: connection.sessionId,
    // Telnet/SSH emitter doesn't have Socket.IO's `.connected` property.
    // The BBS menu code (menu.ts:121) treats falsy `socket.connected` as
    // "carrier dropped" and sets subState=LOGOFF, which causes every
    // subsequent telnet keypress to be ignored ("subState: logoff -
    // IGNORING COMMAND"). Default to true; the connection's own 'close'
    // event handler tears down the session when the transport really dies.
    connected: true,
    on: (event: string, handler: (...args: any[]) => void) => {
      // Transport-level events live on the underlying telnet/SSH
      // connection; synthetic events (used by DoorManager, file
      // upload flow, etc.) live on the local event bus.
      const transportEvents = new Set(["data", "close", "error", "ready", "terminal-type", "window-size"]);
      if (transportEvents.has(event)) {
        connection.on(event, handler);
      } else {
        eventBus.on(event, handler);
      }
      return emitter;
    },
    off: (event: string, handler: (...args: any[]) => void) => {
      const transportEvents = new Set(["data", "close", "error", "ready", "terminal-type", "window-size"]);
      if (transportEvents.has(event)) {
        connection.off(event, handler);
      } else {
        eventBus.off(event, handler);
      }
      return emitter;
    },
    // Allow handlers (logoff) to terminate the underlying transport cleanly
    disconnect: () => connection.close(),
    end: () => connection.close(),
    destroy: () => connection.close(),
  };

  return emitter;
}
