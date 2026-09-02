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

/** The ONE predicate. Was duplicated in connection-emitter.ts, screen.handler.ts and index.ts. */
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

/** The ONE way rendered PETSCII reaches the wire. Marks, emits, unmarks. */
export function emitPetsciiBytes(socket: any, session: any, bytes: Buffer): void {
  const payload = bytes.toString('base64');
  session[SELF_FED] = payload;
  try {
    socket.emit('petscii-bytes', payload);
  } finally {
    // Cleared unconditionally: a wrapper above the choke that DROPS the event
    // would otherwise leave a stale mark that swallows a later identical
    // payload from a door.
    session[SELF_FED] = undefined;
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

/** The input boundary: resolve a held bare CR into its $9D walk. Returns [] when there is no model. */
export function flushPetsciiModel(session: any): Uint8Array {
  const model = session?.petsciiTransducer;
  return model ? model.flush() : new Uint8Array(0);
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
