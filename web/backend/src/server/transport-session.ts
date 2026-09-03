/**
 * The telnet / SSH / ws-terminal session entry point.
 *
 * Moved out of index.ts unchanged (Task TP-2 of
 * `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`). index.ts starts
 * real HTTP, telnet and SSH servers from a top-level IIFE on import, so a test
 * that wants to drive a telnet caller's ACTUAL top-level path - the `data`
 * handler, the close handler, the emitter attach - could not import it there.
 * `connection-emitter.ts:5-10` records the same reason for the extraction that
 * preceded this one.
 *
 * Nothing in this file is new: the diff against the old index.ts:1075-1348 is
 * the parameter list, the imports, and type annotations that replace `as any`
 * casts with the shapes the session and the emitter already have. Behaviour is
 * byte-identical, which is what `tests/transport/transport-session.test.ts` and
 * the 80-column identity suite pin.
 *
 * `handleCommand` is passed in rather than dynamically imported here for one
 * reason: `await import('../handlers/command.handler')` is what pulls the whole
 * command graph - and, transitively, index.ts - into any test that touches the
 * data handler. Production wires it in index.ts with the same dynamic import it
 * used before, so the module graph at runtime is unchanged.
 */
import type { Server as IOServer } from "socket.io";
import { BBSState, LoggedOnSubState } from "../constants/bbs-states";
import { buildConnectionEmitter, flushPendingPetscii } from "./connection-emitter";
import { sessionWantsPetscii } from "../utils/petscii-session-model";
import { routeDoorInput } from "../services/door-input-routing";
import { classifyFirstKeypress } from "../utils/c64-detect.util";
import { convertPetsciiInputToAscii } from "../utils/petscii.util";
import {
  applyTerminalTypeReport,
  applyWindowSizeReport,
} from "../amiga-emulation/xim/screen-width.util";
import type { TransportEmitter } from "./transport-adapter";
import type { TelnetConnection } from "./telnet-server";
import type { SSHConnection } from "./ssh-server";
import type { BBSSession } from "../index";

/**
 * RE-HOMED. `TransportEmitter` was DECLARED here by TP-2 (its recorded
 * deviation D1) only because `server/transport-adapter.ts` did not exist yet.
 * TP-3 created that module and the declaration moved there, unchanged; this
 * file re-exports it so its importers - including
 * `tests/transport/transport-session.test.ts` - keep working and so there is
 * exactly ONE declaration of the shape.
 */
export type { TransportEmitter } from "./transport-adapter";

/**
 * Everything the entry point used to close over inside index.ts.
 */
export interface TransportSessionDeps {
  readonly io: IOServer;
  readonly sessions: Map<string, BBSSession>;
  readonly nodeManager: { releaseSession(sessionId: string): Promise<unknown> };
  handleCommand(
    emitter: TransportEmitter,
    session: BBSSession,
    input: string,
    io?: IOServer,
  ): Promise<void> | void;
}

/**
 * The raw socket behind a TelnetConnection. `transferRawSendUnescaped` reaches
 * past the IAC doubler for option negotiation we initiate ourselves; the
 * property is private on the class, so this is the one narrowing the moved body
 * needs. `unknown`, never `any`.
 */
type ConnectionWithRawSocket = {
  socket?: { write(buf: Buffer): void };
  write(data: Buffer | string): void;
};

/** `transferRawSendUnescaped` is read via a cast at its three consumers
 *  (`handlers/commands/transfer-misc-commands.handler.ts:304`,
 *  `handlers/commands/user-commands.handler.ts:441`) and is not declared on
 *  BBSSession; narrowing it here keeps the assignment typed without changing
 *  the interface. */
type SessionWithUnescapedSend = BBSSession & {
  transferRawSendUnescaped?: (buf: Buffer) => void;
};

// Telnet/SSH Connection Handler
// Connects native telnet and SSH clients to BBS command processing
export function setupTelnetSSHHandler(
  connection: TelnetConnection | SSHConnection,
  type: "telnet" | "ssh",
  deps: TransportSessionDeps
) {
  const remoteAddress = connection.getRemoteAddress();
console.log(
    `[${type.toUpperCase()}] Connection from ${remoteAddress} on node ${
      connection.nodeId
    }`
  );

  // Create emitter interface that mimics Socket.IO socket. Extracted into
  // buildConnectionEmitter() (server/connection-emitter.ts) so the
  // 'petscii-bytes' raw-byte transport branch (Task 9) can be exercised
  // directly in tests without importing this file (which runs a top-level
  // IIFE that starts the HTTP/telnet/SSH servers as an import side effect).
  const emitter: TransportEmitter = buildConnectionEmitter(connection);

  // Expose the socket-shaped emitter on the connection so telnet/SSH
  // server entry points (which run BEFORE this handler completes) can
  // invoke pre-login pipeline pieces like the FRONTEND syscmd through
  // the same code path the web transport uses.
  (connection as unknown as { emitter?: TransportEmitter }).emitter = emitter;

  const attachTransferSender = () => {
    if (connection.session) {
      connection.session.connectionType = type;
      // For telnet, TelnetConnection.write (telnet-server.ts:433)
      // already doubles IAC (0xFF) bytes per RFC 854. Adding a SECOND
      // doubling layer here turned each input 0xFF into 0xFF 0xFF 0xFF
      // 0xFF on the wire — ZOC's ZMODEM parser saw the extra 0xFF in
      // mid-data and ZNAK'd every subpacket containing a 0xFF byte.
      // Just pass through; the transport layer escapes IAC.
      // SSH connection wrapper is raw passthrough; no doubling
      // either way.
      connection.session.transferRawSend = (buf: Buffer) => {
        connection.write(buf);
      };
      // Raw sender for protocol bytes (IAC negotiation, etc.) that
      // must NOT be doubled by the telnet write. TelnetConnection
      // currently has no separate raw-write path; sendCommand uses
      // the underlying socket directly. For now, write to the
      // underlying socket if exposed; otherwise this is identical
      // to transferRawSend and the caller must construct already-
      // escaped sequences if they need raw IAC.
      (connection.session as SessionWithUnescapedSend).transferRawSendUnescaped = (buf: Buffer) => {
        // Telnet.connection.write escapes IAC. To send IAC bytes
        // raw (for option negotiation initiated by us), reach the
        // underlying socket. SSH connection.write is already raw.
        const conn = connection as unknown as ConnectionWithRawSocket;
        if (type === 'telnet' && conn.socket?.write) {
          conn.socket.write(buf);
        } else {
          conn.write(buf);
        }
      };
    }
  };
  attachTransferSender();
  connection.on("ready", attachTransferSender);

  // Handle incoming data (user input)
  connection.on("data", async (data: Buffer) => {
    // Task 10 controller add: this is the single boundary where output
    // stops and input begins for telnet/SSH (every door/BBS input path
    // below is downstream of it) - flush any PETSCII bytes the session's
    // transducer is still holding (a bare trailing CR) before this
    // keystroke is processed. See flushPendingPetscii's doc comment for
    // why this exact call site and not AnsiBuffer.flush().
    flushPendingPetscii(connection);

    if (connection.session?.transferRawActive) {
      const sink =
        connection.session.transferRawSink ||
        connection.session.transferManager?.handleInput;
      if (sink) {
        sink(Buffer.from(data));
        return;
      }
    }

    // Real C64s dialing in through a WiFi modem negotiate no telnet
    // options, so the TTYPE fast path in telnet-server.ts never fires for
    // them and terminalType stays 'unknown'. The connect screen's first
    // keypress doubles as a passive DEL-probe (see c64-detect.util.ts):
    // PETSCII DEL/shifted letters classify the caller as a C64 before the
    // PETSCII->ASCII conversion below runs. telnet-server.ts's showPrompt()
    // consults this flag (in addition to TTYPE) to skip the graphics
    // prompt and jump straight to PETSCII/BBSTITLE for callers fast enough
    // to hit DISPLAY_CONNECT within the 500ms TTYPE window.
    //
    // Design ruling (2026-09-02): keep the 500ms timing model as-is - no
    // DISPLAY_CONNECT parking redesign. A slower human C64 caller lands
    // at ANSI_PROMPT once showPrompt()'s timer fires and shows the
    // graphics prompt; THAT keypress (still unclassified) is just as
    // valid a probe byte, so the guard below also covers ANSI_PROMPT
    // while terminalType is still unset. command.handler.ts's ANSI_PROMPT
    // handler applies PETSCII mode immediately once it sees terminalType
    // flip to 'c64' with petsciiMode not yet set.
    //
    // Guarded tightly to these two pre-login states so it can never
    // misfire post-login.
    if (
      connection.session?.state === BBSState.AWAIT &&
      (connection.session.subState === LoggedOnSubState.DISPLAY_CONNECT ||
        connection.session.subState === LoggedOnSubState.ANSI_PROMPT) &&
      (!connection.session.terminalType ||
        connection.session.terminalType === "unknown")
    ) {
      const firstKeyClass = classifyFirstKeypress(data);
      if (firstKeyClass === "petscii") {
        connection.session.terminalType = "c64";
      }
      // 'ascii' / 'ambiguous': leave terminalType as-is (ANSI prompt path).
    }

    // Convert telnet/SSH data to string
    // For C64/PETSCII terminals, convert PETSCII bytes to ASCII
    // For modern terminals, use UTF-8 encoding
    let input: string;
    if (sessionWantsPetscii(connection.session)) {
      // PETSCII terminals send characters in PETSCII encoding, not ASCII
      // e.g., lowercase 'a' is 0xC1 in PETSCII, not 0x61 like ASCII
      input = convertPetsciiInputToAscii(data);
    } else {
      input = data.toString("utf-8");
    }

    // Telnet clients may send CR NUL sequences; strip NUL padding
    if (type === "telnet") {
      input = input.replace(/\0/g, "");
    }

    // Process through BBS command handler (same as Socket.IO)
    // Must use SAME routing logic as socket-handlers.ts:641-656
    if (connection.session) {
      const session = connection.session;

      // Out-of-band Ctrl+C abort for long-running script engines (AREXX).
      // Mirrors the socket-handlers Ctrl+C interceptor so telnet users can
      // also break out of a tight AREXX loop with no input prompt active.
      if (
        (session.inDoorManager || session.subState === LoggedOnSubState.DOOR_RUNNING) &&
        session.scriptAbortHandler &&
        input.length > 0 &&
        input.charCodeAt(0) === 3
      ) {
        try { session.scriptAbortHandler(); } catch { /* never throw out of telnet handler */ }
      }

      // Where a keystroke goes while a door runs is one decision, and both
      // transports ask for it (services/door-input-routing.ts). It used to be
      // written twice, and the two copies disagreed: this path returned as
      // soon as any 'command' listener existed, so a door with a prompt
      // listener still registered never saw a key - it drew perfectly and
      // took no input. Web never had that, because socket.io delivers a
      // 'command' to every listener AND socket-handlers then calls the door's
      // handler. Telnet does both now too.
      const route = routeDoorInput(input, {
        doorActive: Boolean(session.inDoorManager)
          || session.subState === LoggedOnSubState.DOOR_RUNNING,
        hasDoorInputHandler: Boolean(session.doorInputHandler),
        hasCommandListener: emitter.listenerCount('command') > 0,
        bbsPauseActive: session.paginatedScreen?.kind === 'bbs',
      });

      if (route.toCommandListeners) {
        // DoorManager's socket.once('command', ...) prompt, bridged: telnet
        // has no transport event of its own.
        emitter.emitInternal('command', input);
      }
      if (route.toDoorHandler && session.doorInputHandler) {
        session.doorInputHandler(input);
      }
      if (route.toDoorInputEvent) {
console.log('[TELNET] Door active but nothing listening - emitting door:input');
        emitter.emit('door:input', input);
      }
      if (!route.toBbs) return;

      // No door active - route to BBS command handler
      deps.handleCommand(emitter, session, input, deps.io);
    }
  });

  // Handle terminal type detection (telnet TTYPE negotiation)
  connection.on(
    "terminal-type",
    (info: {
      terminalType: string;
      isC64: boolean;
      width: number;
      height: number;
    }) => {
      if (connection.session) {
        // A C64 TTYPE answer can still carry an 80-column width in the
        // payload; applyTerminalTypeReport routes it through
        // applyClientReportedGeometry, the single gate (shared with the NAWS
        // handler below and socket-handlers.ts terminal-size) that keeps a
        // PETSCII session at 40x25 regardless. The body lives in
        // xim/screen-width.util.ts so it can be DRIVEN by a test - this file
        // boots a server on import (whole-run review, I13).
        applyTerminalTypeReport(connection.session, info);
console.log(
          `[${type.toUpperCase()}] Terminal detected: ${info.terminalType} (${
            info.isC64 ? "C64" : "Modern"
          }) - ${info.width}x${info.height}`
        );
      }
    }
  );

  // Handle window size changes (NAWS)
  connection.on("window-size", (width: number, height: number) => {
    if (connection.session) {
      // A C64 client can announce 80 columns over NAWS; a PETSCII session's
      // geometry is 40x25 by definition and never takes a reported size.
      // applyWindowSizeReport wraps applyClientReportedGeometry, the single
      // gate (shared with socket-handlers.ts terminal-size), plus the
      // type-not-yet-known fallback detection. Extracted so it can be driven
      // by a test rather than pinned by a regex (whole-run review, I13).
      const outcome = applyWindowSizeReport(connection.session, width, height);
      if (!outcome.geometryTaken) {
console.log(
          `[${type.toUpperCase()}] Ignoring NAWS ${width}x${height}: PETSCII session stays 40x25`
        );
        return;
      }

      if (outcome.detectedFromSize) {
console.log(
          `[${type.toUpperCase()}] Terminal detected via NAWS: ${width}x${height} (${
            connection.session.petsciiMode ? "C64" : "Modern"
          })`
        );
      } else {
console.log(`[${type.toUpperCase()}] Window size: ${width}x${height}`);
      }
    }
  });

  // Handle disconnect
  connection.on("close", () => {
console.log(
      `[${type.toUpperCase()}] Disconnected: node ${connection.nodeId}`
    );
    // Cleanup session
    if (connection.session) {
      deps.sessions.delete(connection.sessionId);
    }
    // Release node back to available pool
    if (connection.nodeId !== undefined) {
      deps.nodeManager.releaseSession(connection.sessionId).catch((err: Error) => {
        console.error(`[${type.toUpperCase()}] Failed to release node on disconnect:`, err);
      });
    }
  });

  // Handle errors
  connection.on("error", (error: Error) => {
console.error(
      `[${type.toUpperCase()}] Error on node ${connection.nodeId}:`,
      error.message
    );
  });

  // Welcome flow: match the web `io.on('connection')` path. Web does
  // NOT print any "Welcome to AmiExpress BBS / Connected via …"
  // banner — it just sets DISPLAY_CONNECT and waits for a keypress,
  // then transitions to the ANSI prompt → BBSTITLE → login. This
  // function used to print a hardcoded banner here that was visible
  // ONLY on telnet/SSH; removing it brings the two transports back
  // into alignment. If a sysop wants a pre-login welcome screen they
  // can wire it via the FRONTEND syscmd (the standard express.e
  // hook), which the DISPLAY_CONNECT handler will pick up on both
  // transports identically.
}
