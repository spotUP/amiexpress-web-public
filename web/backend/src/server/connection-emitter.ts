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
  switchPetsciiCaseAtChoke,
} from "../utils/petscii-session-model";
import { applyTransportEvent } from "./transport-adapter";
import { encodeForWire } from "../utils/wire-encoding.util";
import type { OutputAttributes } from "../utils/output-pacing";
import { foldForWire } from "../utils/wrap-for-session.util";
import { observeOutput } from "./session-observers";

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

/**
 * The connection's ONE socket-shaped emitter, built on first use and kept on
 * the connection.
 *
 * Everything keyed by the connection's id - the output buffer behind
 * emitText, the modem pacer, the ANSI filter login installs - wraps or binds
 * the emitter object it is first handed. Two emitters for one connection
 * means text split across two pipelines that reach the same wire at
 * different speeds: the C64 title screen used to build its own, the buffer
 * bound to it, and every menu prompt then overtook the paced newline in
 * front of it (the sysop, 2026-09-28: "the cursor draws on the next line").
 */
export function emitterFor(connection: TelnetConnection | SSHConnection): any {
  const holder = connection as unknown as { emitter?: unknown };
  if (!holder.emitter) holder.emitter = buildConnectionEmitter(connection);
  return holder.emitter;
}

export function buildConnectionEmitter(connection: TelnetConnection | SSHConnection): any {
  const eventBus = new EventEmitter();
  eventBus.setMaxListeners(50);

  // The line is up until the connection says it closed. Every connection this
  // emitter serves (telnet, SSH, the WebSocket terminal) emits 'close' when
  // its transport dies.
  let lineUp = true;
  (connection as unknown as EventEmitter).on?.('close', () => { lineUp = false; });

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
    emit: (event: string, ...args: any[]) => {
      // Widened from `(event: string, data: any)` by TP-3. The three branches
      // below read `args[0]` as `data`, which is what every current caller
      // passes; the third argument the wipe path already sends (PRE_PACED,
      // utils/output-pacing.ts) rides through untouched, as it does today, and
      // TP-5 reads it for the payload's source charset.
      const data: any = args[0];
      // TP-5: the payload's OWN attributes, on the third argument the wipe
      // path already sends (utils/output-pacing.ts). `sourceCharset` says
      // which charset a screen file's characters were decoded FROM; absent
      // means the text was composed by a handler and has none.
      const attrs: Readonly<OutputAttributes> | undefined =
        args[1] !== null && typeof args[1] === "object" ? (args[1] as Readonly<OutputAttributes>) : undefined;
      const session = connection.session;
      // The sysop's tools see what the caller sees (server/session-observers.ts)
      // - the session-log viewer and the MCP tap were web-only.
      if (event === "ansi-output") observeOutput(connection.sessionId, session?.nodeId, data);
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
            // TP-5: the ONE place a screen's string becomes bytes for a byte
            // caller. The CRLF normalisation runs BEFORE the encode, on the
            // string, exactly where it ran before. `encodeForWire` returns the
            // string unchanged for a UTF-8 caller (web, /ws/terminal, a telnet
            // client that negotiated UTF-8), so that path is a no-op diff.
            // A caller WIDER than the board's 80-column screens gets them folded
            // at 80 here, at the wire, stateful across chunks - see foldForWire
            // for why this could not live in emitText (the MENU folded there
            // and BBSTITLE, which leaves through the MCI parser's inline mode,
            // did not).
            connection.write(encodeForWire(session, foldForWire(data.replace(/\r?\n/g, "\r\n"), session), attrs));
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
          // Not a PETSCII caller: this is ordinary text on an ordinary wire and
          // takes the same encoder the ansi-output branch does.
          connection.write(encodeForWire(session, String(data), attrs));
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
      } else if (event === "petscii-case") {
        // The caller pressed CTRL+L (utils/petscii-session-model.ts,
        // togglePetsciiCase): `$8E` or `$0E` goes out now, and NOTHING is
        // reprinted - his terminal switches the screen it already has. A
        // caller who is not PETSCII never gets the event; if one did, there
        // is no set to switch.
        if (sessionWantsPetscii(session)) {
          const bytes = switchPetsciiCaseAtChoke(session);
          if (bytes.length > 0) connection.write(Buffer.from(bytes));
        }
      } else {
        // TP-3: the `else` this chain never had. Every other name. The adapter
        // either performs the event's translation (connection state, a
        // transport action, a rendered notice) or records a RULED drop on the
        // connection - `connection.transportDrops`, one record per name, logged
        // once. An unruled name is a defect and says so loudly: the backend
        // must never emit an event to a session that cannot receive it without
        // this file knowing about it. See server/transport-adapter.ts.
        //
        // TP-4 passes THIS emitter along, because two of the things a byte
        // transport has to honour hang off the socket rather than off the
        // connection: the server ModemEmulator (`modem-speed`) and the output
        // buffer behind emitText (`system-message`, `system:notice`). Both are
        // keyed on the socket-shaped object, so handing the adapter anything
        // else would give this caller a second pacer and a second buffer.
        applyTransportEvent(connection, session, event, args, emitter);
      }
    },
    /** Live view of the connection's session (emitText's wrap choke, Task 10, reads it). A getter: connection.session is assigned after this emitter is built. */
    get session() {
      return connection.session;
    },
    id: connection.sessionId,
    // socket.io's `.connected`, for real: true while the line is up, false
    // once the connection closed. It was the constant `true`, so the menu's
    // carrier check (menu.ts, express.e:28590) could never see a telnet or
    // SSH hang-up, and a handler still running after one kept writing into a
    // closed connection instead of taking the LOGOFF branch (web-vs-telnet
    // audit item 16, 2026-09-28). A constant was chosen because a missing
    // property read as falsy - "carrier dropped" on every keypress - and a
    // getter over the real state keeps that fixed.
    get connected() {
      return lineUp;
    },
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
