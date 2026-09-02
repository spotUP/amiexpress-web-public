/**
 * The ONE terminal model a PETSCII session has on the server.
 *
 * It is fed at the per-session transport CHOKE - the connection emitter for
 * telnet/SSH/WS-terminal (`server/connection-emitter.ts`), a
 * registration-time `socket.emit` wrapper for web (`server/socket-handlers.ts`)
 * - so the `.seq` render can encode and clip each substituted value against
 * the cursor the caller's terminal actually has, no matter what put the
 * terminal there: a menu, a door, a chat page from another node.
 *
 * Keyed on the SESSION, never on the socket: a connection can be handed a new
 * session mid-flight (a re-login, a node reassignment - see
 * `server/c64-door-adapter.ts:94-104`), and a web session survives a socket
 * replacement on reconnect. A new session object therefore starts with a
 * fresh model, which is the correct answer in both directions.
 *
 * A leaf util by construction: it imports the SDK transducer and nothing from
 * `server/` or `handlers/`, so `connection-emitter.ts`, `socket-handlers.ts`,
 * `screen.handler.ts` and `petscii-screen.render.ts` can all import it with
 * no cycle.
 *
 * Plan: `thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`
 * (task OC-2).
 */
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';

/**
 * The ONE predicate. Was duplicated in connection-emitter.ts, screen.handler.ts
 * and index.ts.
 *
 * It answers a SESSION-MODE question, not just a transport choice: an ANSI web
 * session can reach a `.seq` screen (the BBSTITLE fallback, an include)
 * without ever having opted into PETSCII mode, and emitting `petscii-bytes`
 * there would push the frontend's terminal irreversibly into canvas mode for a
 * session that never asked for it. Only a session that already IS
 * `petsciiMode`, or a real C64, gets the raw-byte transport; everyone else
 * gets the legacy PUA `petscii-output`.
 */
export function sessionWantsPetscii(session: any): boolean {
  return !!session?.petsciiMode || session?.terminalType === 'c64';
}

/** The session's model, created on first use. */
export function petsciiTerminalModelFor(session: any): AnsiToPetsciiTransducer {
  if (!session.petsciiTransducer) session.petsciiTransducer = new AnsiToPetsciiTransducer();
  return session.petsciiTransducer;
}

/**
 * Bytes the PRODUCER already fed to the model, parked on the SESSION for the
 * duration of one synchronous emit.
 *
 * The `.seq` render has to consult the cursor WHILE it encodes, so by the time
 * its bytes reach the choke they are already in the model; observing them
 * again would double-feed it. Every OTHER `petscii-bytes` payload - a door's
 * `BBSApi.writePetscii(Buffer)` (`doors/BBSApi.ts:308`) - has never been fed,
 * and the choke is the only thing that will ever see it.
 *
 * On the SESSION and NOT on the socket: a door runs against a prototype proxy,
 * `Object.create(socket)` (`handlers/door.handler.ts:157`), so a mark written
 * through the proxy becomes a shadowed OWN property of the proxy while the
 * choke - which is the prototype's `emit` - reads the prototype and sees
 * nothing, and nothing ever clears it. The session is the one object both ends
 * already hold, and the mark's whole life is inside a single synchronous
 * `emit`, so a session key cannot collide with another session's payload.
 * (`handleC64Detected`'s second emitter, `server/c64-detected-handler.ts:36`,
 * is a second socket for the SAME session - another reason the session is the
 * right key.)
 */
const SELF_FED = Symbol('petsciiSelfFedPayload');

/** The ONE way rendered PETSCII reaches the wire. Marks, emits, restores. */
export function emitPetsciiBytes(socket: any, session: any, bytes: Buffer): void {
  const payload = bytes.toString('base64');
  const prior = session[SELF_FED];
  session[SELF_FED] = payload;
  try {
    socket.emit('petscii-bytes', payload);
  } finally {
    // Restored unconditionally, and to the PRIOR value rather than to
    // `undefined`: a wrapper above the choke that DROPS the event would
    // otherwise leave a stale mark that swallows a later identical payload
    // from a door, and a wrapper that re-enters this function - a door
    // adapter splitting one payload into several - would clear an OUTER
    // call's mark and make the outer payload look like a door's raw bytes.
    session[SELF_FED] = prior;
  }
}

/** Choke side of `petscii-bytes`. Feeds exactly once. */
export function observePetsciiBytesAtChoke(session: any, payload: string): Buffer {
  const raw = Buffer.from(payload, 'base64');
  const model = petsciiTerminalModelFor(session);
  if (session[SELF_FED] === payload) {
    // Already fed by the render. Raw PETSCII reached the terminal without
    // passing `transduce`, so the ANSI deferred-wrap latch is stale and
    // nothing else is: `observe([])` clears exactly that and touches no cell
    // (`sdk/petscii/ansi-to-petscii.ts:180-183`).
    model.observe([]);
    return raw;
  }
  model.observe(raw);
  return raw;
}

/** Choke side of `ansi-output` / `petscii-output`. Returns the PETSCII bytes. */
export function transducePetsciiAtChoke(session: any, text: string): Uint8Array {
  return petsciiTerminalModelFor(session).transduce(text);
}

/**
 * The one empty result `flushPetsciiModel` hands back, allocated once.
 *
 * The web `command` handler flushes on EVERY keystroke of EVERY session
 * (`server/socket-handlers.ts`), and an ANSI session - which is most of them -
 * has no model, so a per-call `new Uint8Array(0)` was one throwaway allocation
 * per key pressed on the board. Never written to: the only two callers read
 * `.length` and, when it is non-zero, copy it into a Buffer.
 */
const NO_PETSCII_BYTES = new Uint8Array(0);

/** The input boundary: resolve a held bare CR into its $9D walk. Returns [] when there is no model. */
export function flushPetsciiModel(session: any): Uint8Array {
  const model = session?.petsciiTransducer;
  return model ? model.flush() : NO_PETSCII_BYTES;
}

/**
 * A session becomes PETSCII: from here on the model describes a fresh 40x25
 * screen, not whatever drained onto the wire while the caller was still being
 * classified. Used ONLY at the flip sites (OC-5). A RECONNECT does not call
 * this - it calls `disposePetsciiSessionModel`, because a `~SP`-paused `.seq`
 * parks `session.screenSegments` with a `petsciiCtx` holding this machine
 * (`handlers/screen.handler.ts:1779`) and homing the machine without dropping
 * those segments would resume the pause against a cursor they were never
 * encoded for.
 */
export function resetPetsciiModel(session: any): void {
  if (session?.petsciiTransducer) session.petsciiTransducer.reset();
}

/** Final teardown, with the parked segments that are only valid against this model. */
export function disposePetsciiSessionModel(session: any): void {
  session.petsciiTransducer = undefined;
  session.screenSegments = undefined;
}

/**
 * Marks the SOCKET, not the emit function.
 *
 * A function-keyed marker is lost the moment anything replaces `socket.emit`
 * with an unmarked wrapper - which the modem emulator does unconditionally
 * (`utils/modem-emulator.util.ts:276`). The reconnect block in
 * `server/auth-socket-handlers.ts` runs right beside
 * `getModemEmulator(socket).install()`, so a function-keyed guard would let a
 * SECOND choke be installed on top of the modem wrapper and every
 * `ansi-output` would be transduced TWICE. The three wrappers already in this
 * codebase all key their marker on the socket - `_modemEmulatorInstalled`
 * (`utils/modem-emulator.util.ts:267,291`), `_ansiFilterInstalled`
 * (`services/login-post.service.ts:85,99`), `__ansiTapInstalled`
 * (`server/socket-handlers.ts:139-140`) - and this follows them.
 */
const PETSCII_MODEL_CHOKE = Symbol('petsciiModelChoke');

/**
 * Is this socket still the one the session lives on?
 *
 * A door captures its socket at launch and keeps writing through that capture
 * (`handlers/door.handler.ts`'s `createDoorSocketWrapper`, an
 * `Object.create(socket)` proxy over it). If the browser reconnects mid-door,
 * the restore repoints the session at the REPLACEMENT socket
 * (`server/auth-socket-handlers.ts`: `existingSession.socketId = socket.id`)
 * and DISPOSES the model - but `getSession(oldSocketId)` keeps resolving the
 * SAME live session for the whole 3 s reconnect grace, because
 * `finalizeDisconnectCleanup` (`server/socket-handlers.ts`) only deletes the
 * record once the grace expires. Without this check the dead socket's emits -
 * which socket.io drops on the wire - would still be transduced into the
 * freshly disposed model, and the first `.seq` after the reconnect would be
 * encoded against a screen nobody has.
 *
 * Deliberately permissive: it withholds the MODEL only where it can positively
 * see a MISMATCH, and it never withholds the EMIT. `session.socketId` is
 * assigned in exactly two places, both web (`server/socket-handlers.ts` at
 * registration and the restore above), so a telnet/SSH session has none and is
 * never silenced by this - its choke is the connection emitter anyway, whose
 * `id` is a connection id and not a socket id.
 *
 * OC-3 review carry-over I2.
 */
function socketStillCarriesSession(socket: any, session: any): boolean {
  const live = session?.socketId;
  const here = socket?.id;
  if (!live || !here) return true;
  return live === here;
}

/**
 * The web transport's model choke.
 *
 * Web does NO server-side PETSCII conversion - the browser converts
 * (`packages/terminal/src/components/BBSTerminal.tsx`) - so this wrapper
 * changes not one byte on the wire. It exists only so the server carries the
 * same terminal model a telnet C64 gets for free from the connection emitter
 * (`server/connection-emitter.ts`), because the `.seq` render encodes every
 * substituted value against it.
 *
 * Installed at REGISTRATION, before login and before any door, so the door
 * teardown pins (`tests/doors/door-min-columns-gate.test.ts:393,421`) - which
 * capture `socket.emit` on their own fresh mock and require it back exactly -
 * never see it; those tests never run `registerSocketHandlers`.
 *
 * Registration installs it LAST, so among the registration-time wrappers it is
 * the OUTERMOST and sees everything the session log sees. Everything installed
 * later - the ANSI filter (`services/login-post.service.ts:139`), the modem
 * emulator (`:149`), a door adapter (`server/c64-door-adapter.ts:293`) - wraps
 * ABOVE it and calls DOWN into it, which is why their output still reaches the
 * model. The modem emulator queues `ansi-output` only
 * (`utils/modem-emulator.util.ts:276-288`) and the client receives that same
 * order, so a delayed string reaches the model in wire order too.
 *
 * The session is resolved AT EMIT TIME, not captured: a reconnecting browser
 * gets a new socket.io socket which runs this registrar with a throwaway
 * session, and `server/auth-socket-handlers.ts` swaps the restored session in
 * afterwards (`setSession(socket.id, existingSession)`).
 *
 * A SESSION RESOLVER rather than an imported `getSession`:
 * `server/session-manager.ts` imports `../index`, so a leaf util reaching back
 * into `server/` for it would put a cycle under a module every handler already
 * imports. Callers that hold a socket carrying its own live `session` - the
 * connection emitter, the `tests/petscii/*` mocks - use the default.
 */
export function installPetsciiModelChoke(
  socket: any,
  resolveSession: () => any = () => (socket as any).session,
): void {
  if (!socket || typeof socket.emit !== 'function') return;
  if ((socket as any)[PETSCII_MODEL_CHOKE]) return;   // SOCKET-keyed, not function-keyed
  const downstream = socket.emit.bind(socket);
  const choked = function (event: string, ...args: any[]): any {
    const session = resolveSession();
    if (session && sessionWantsPetscii(session) && socketStillCarriesSession(socket, session)) {
      if ((event === 'ansi-output' || event === 'petscii-output') && typeof args[0] === 'string') {
        transducePetsciiAtChoke(session, args[0]);
      } else if (event === 'petscii-bytes' && typeof args[0] === 'string') {
        observePetsciiBytesAtChoke(session, args[0]);
      }
    }
    return downstream(event, ...args);
  };
  socket.emit = choked as any;
  (socket as any)[PETSCII_MODEL_CHOKE] = true;
}
