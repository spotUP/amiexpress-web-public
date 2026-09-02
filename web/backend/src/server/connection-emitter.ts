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
import { convertPetsciiToPetMe64 } from "../utils/petscii.util";
import {
  sessionWantsPetscii,
  observePetsciiBytesAtChoke,
  transducePetsciiAtChoke,
  flushPetsciiModel,
} from "../utils/petscii-session-model";

/**
 * Flush the session's PETSCII transducer's held bytes straight to the wire
 * (Task 10 controller add). `transduce()` holds a trailing bare CR in
 * `pending` until it sees whether a `\n` completes it into one CRLF - call
 * this too early (every emit) and a CRLF legitimately split across two
 * output chunks turns into a lone CR ($0D-worth of $9D) plus a lone LF, a
 * doubled line move. Call it too late (never) and a chunk that ends mid-CR
 * with no further output ever arriving (the common case: a prompt ending
 * "...ready\r" with the newline coming from the terminal's own echo) leaves
 * those bytes stuck in `pending` forever, past the input wait.
 *
 * The correct boundary is where output stops and input begins. For
 * telnet/SSH that is `connection.on('data', ...)` in index.ts: the single
 * choke point every keystroke passes through before ANY handler sees it -
 * BBS commands via `handleCommand`, DoorManager's synthetic 'command'
 * event, `session.doorInputHandler`, and the `door:input` fallback
 * (DoorMessageHandler.setupInputHandler) all sit downstream of it. Calling
 * this once at the top of that handler, before dispatch, covers every one
 * of those paths with one call site instead of instrumenting each.
 *
 * NOT `AnsiBuffer.flush()`: that also fires on a 16ms timer and on the 8KB
 * buffer-size-forced-flush path, neither of which means input is about to
 * be awaited - hooking there would tear apart an ordinary in-flight CRLF.
 *
 * No-op for a session that has no model yet: web sessions keep their
 * transducer client-side (Task 8), so `session.petsciiTransducer` is set
 * server-side only once something feeds the session model - which on
 * telnet/SSH is this emitter's own choke
 * (`utils/petscii-session-model.ts`).
 */
export function flushPendingPetscii(connection: { session?: any; write: (b: Buffer) => void }): void {
  // flushPetsciiModel (utils/petscii-session-model.ts) only resolves a
  // held bare CR into its $9D-per-column walk; a held PARTIAL ESCAPE
  // SEQUENCE is silently dropped instead (pre-existing transducer
  // contract, not something this call site changes) - an output chunk
  // that ends mid-escape right at the input boundary loses those bytes.
  const bytes = flushPetsciiModel(connection.session);
  if (bytes.length > 0) connection.write(Buffer.from(bytes));
}

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
      const session = connection.session;
      if (event === "ansi-output") {
        if (sessionWantsPetscii(session)) {
          // C64 caller: the ANSI stream (prompts, menus, blessed door frames)
          // becomes PETSCII with cursor positioning, colors and reverse video
          // computed against the session's KERNAL oracle. Binary payloads
          // (ZMODEM) pass untouched.
          if (typeof data === "string") {
            connection.write(Buffer.from(transducePetsciiAtChoke(session, data)));
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
        if (sessionWantsPetscii(session)) {
          // Legacy PUA text: the transducer understands U+E000-E1FF glyphs
          // and keeps bank/reverse state in step with everything else.
          connection.write(Buffer.from(transducePetsciiAtChoke(session, String(data))));
        } else {
          connection.write(data);
        }
      } else if (event === "petscii-bytes") {
        // Raw-byte transport (Task 9): `data` is base64 of the exact .seq
        // bytes the loader read off disk.
        if (sessionWantsPetscii(session)) {
          // Forward untouched (TelnetConnection.write doubles IAC itself) and
          // let the session's ONE terminal model see what the screen now
          // looks like. The choke feeds it exactly once: a payload this
          // server rendered was already fed while it was encoded (and is
          // marked), a door's raw payload never was.
          const raw = observePetsciiBytesAtChoke(session, data as string);
          connection.write(raw);
        } else {
          connection.write(convertPetsciiToPetMe64(Buffer.from(data as string, "base64")));
        }
      }
    },
    /** Live view of the connection's session (emitText's wrap choke, Task 10, reads it). A getter: connection.session is assigned after this emitter is built. */
    get session() {
      return connection.session;
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
