/**
 * THE TRANSPORT ADAPTER - one ruling for every event name the board can emit.
 *
 * Task TP-3 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`.
 *
 * WHY THIS FILE EXISTS. `buildConnectionEmitter` (`server/connection-emitter.ts`)
 * is the socket.io-shaped object telnet and SSH hand to every BBS handler, and
 * until this commit its `emit` was an if / else-if chain over exactly three
 * event names with NO `else`. 242 distinct names can reach a session socket, so
 * 239 of them fell off the end of that chain and vanished with no log, no throw
 * and no test - a client door froze because `door:load-client` evaporated, a
 * sysop could not kick a telnet caller, a batch download reported success while
 * zero bytes moved. This module is that missing `else`: every name is RENDERED
 * for a byte terminal, TRANSLATED into server-side connection state, or ruled
 * otherwise IN WRITING, and a name with no ruling is a loud, counted defect.
 *
 * THE CENSUS lives with the table it produced, in
 * `server/transport-event-rulings.ts`: three greps, unioned, re-run against the
 * working tree, 242 names. `tests/transport/transport-adapter.test.ts` re-runs
 * all three on every run and fails BY NAME for anything unruled, so the census
 * cannot drift silently. The third grep is not a NAME census but a SITE census
 * - the emits whose event name is a variable - and its answer is
 * PATTERN_RULINGS and FORWARDING_EMIT_SITES below.
 *
 * WHAT A DROP MEANS, AND WHAT IT DOES NOT. A door's server half sees a
 * server-to-client emit BEFORE this chain does: `createDoorSocketWrapper`
 * (`handlers/door.handler.ts:130-170`) installs an outgoing interceptor over the
 * emitter's own `emit` and dispatches to the door's local handlers first. So a
 * `chat:*` or `room:*` drop recorded here is the drop of a STRUCTURED PAYLOAD a
 * byte terminal could not have rendered - it is NOT the loss of the LiveChat
 * door's copy, which was already delivered. Anyone reading the tally as "the
 * door missed 40 messages" is reading it wrong, and this paragraph is why.
 *
 * NOT A THROW. A throw here would take down a door mid-frame for a cosmetic
 * event. The drop is recorded on the connection (`connection.transportDrops`)
 * and logged ONCE PER NAME PER CONNECTION: a door emitting `door:status` sixty
 * times a second must not be able to fill the log.
 *
 * A LEAF MODULE. It imports types, `types/login-emitter` and nothing from
 * `handlers/`, so `connection-emitter.ts`, `transport-session.ts` and the
 * handlers can all import it with no cycle - the shape
 * `utils/petscii-session-model.ts` already established. NO `any` crosses this
 * module's boundary.
 */
import type { BBSSession } from "../index";
import type { LoginEmitter } from "../types/login-emitter";
import { EVENT_RULINGS, type EventRuling } from "./transport-event-rulings";

/**
 * The table lives in `server/transport-event-rulings.ts` - 242 entries would
 * put this file over the repo's 2000-line ceiling. Re-exported here because
 * this module is the one address the plan gives them: every importer reaches
 * `EVENT_RULINGS` and `EventRuling` at `server/transport-adapter`, and there is
 * still exactly one definition of each.
 */
export { EVENT_RULINGS, type EventRuling };

/**
 * The socket-shaped object a session is reached through: socket.io's `Socket`
 * and the telnet/SSH connection emitter both satisfy it.
 * `types/login-emitter.ts` already defines that surface for the login pipeline;
 * this extends it with the two members the entry point and the adapter need.
 *
 * RE-HOMED HERE by TP-3, per TP-2's recorded deviation D1: TP-2 had to define
 * it in `server/transport-session.ts` because this module did not exist yet.
 * `transport-session.ts` now re-exports this declaration, so there is exactly
 * one.
 */
export interface TransportEmitter extends LoginEmitter {
  emitInternal(event: string, ...args: unknown[]): boolean;
  listenerCount(event: string): number;
  readonly session?: BBSSession | null;
}

/**
 * What this session's transport can actually do.
 *
 * ONE answer, many readers. Before this existed the same question was asked
 * eight different ways - `connectionType === 'web'`, `type === 'telnet'`,
 * `!!socket.handshake`, "does BBSApi define onKeyDown" - and each copy could
 * (and did) answer differently for the same caller.
 */
export interface TransportCapabilities {
  /** A byte stream the server must encode itself (telnet, SSH, /ws/terminal). */
  readonly bytes: boolean;
  /** socket.io: named events with structured payloads reach a browser. */
  readonly events: boolean;
  /**
   * key-down / key-up EDGES arrive. False for every byte transport: there is no
   * key-up in a character stream. Read by game mode (TP-7).
   */
  readonly keyEvents: boolean;
  /**
   * A browser is present to run a client door bundle and to accept an HTTP
   * download trigger. Read by the door gate (TP-6) and downloads (TP-11).
   */
  readonly browser: boolean;
  /**
   * RIPscrip is rasterised by the caller. Web only; there is no server-side
   * rasteriser (`handlers/screen.handler.ts:1862-1869`).
   */
  readonly rip: boolean;
}

/**
 * ONE BODY, AND WHERE IT LIVES. TP-3 and TP-6 were written in parallel in one
 * shared tree, and TP-6 briefly carried a second copy of this predicate in
 * `server/transport-capabilities.ts` because it could not edit this file. That
 * copy is gone: TP-6 (4913f7be5) imports `transportCapabilities` from HERE, as
 * does TP-11 for its download gate, and this is the only body. If a second one
 * ever appears, it is the exact duplication this plan exists to retire - the
 * whole point of the struct is that when a future transport gains key edges,
 * ONE function changes and no caller does.
 */
/**
 * Every field derives from ONE fact today (`connectionType`), deliberately: the
 * struct is the seam, so when a future transport gains key edges exactly one
 * function changes and no caller does. `/ws/terminal` sessions are created with
 * `connectionType: "telnet"` (`index.ts`, the ws-terminal factory) and are
 * therefore byte transports, which is correct.
 */
export function transportCapabilities(
  session: Pick<BBSSession, "connectionType"> | null | undefined,
): TransportCapabilities {
  const web = session?.connectionType === "web";
  return { bytes: !web, events: web, keyEvents: web, browser: web, rip: web };
}

/**
 * One site whose event name is built at runtime.
 *
 * `file:line` as measured on 2026-09-03. The suite does NOT compare line
 * numbers - they drift the moment a later task edits the file - it compares the
 * set of FILES and, within each file, the multiset of `receiver.emit(argument`
 * expressions, which is what actually changes when a site is added or removed.
 */
export interface VariableEmitSite {
  readonly file: string;
  readonly line: number;
  /** The exact receiver and first argument, e.g. `socket.emit(eventName`. */
  readonly expression: string;
}

/**
 * Names built at runtime, which no literal grep can enumerate. Matched BEFORE
 * the unruled path, in array order, first match wins.
 */
export interface PatternRuling {
  readonly test: RegExp;
  readonly ruling: EventRuling;
  readonly sites: ReadonlyArray<VariableEmitSite>;
}

export const PATTERN_RULINGS: ReadonlyArray<PatternRuling> = Object.freeze([
  {
    test: /^door:message:/,
    ruling: {
      kind: "web-only",
      note:
        "A client door's frames, addressed to the browser bundle that " +
        "`door:load-client` fetched. The name is built at " +
        "doors/client-door-bridge.ts:182 and :426, emitted at :427 and removed " +
        "at :501. TP-6 refuses a client door on a byte transport, so after TP-6 " +
        "this can only be reached by a hybrid whose client half was skipped, " +
        "and the drop tally is the proof it was.",
    },
    sites: [
      { file: "web/backend/src/doors/client-door-bridge.ts", line: 427, expression: "doorSession.socket.emit(eventName" },
    ],
  },
  {
    test: /^(ansi-output|petscii-output|petscii-bytes)$/,
    ruling: {
      kind: "render",
      note:
        "The three rendered names, reached through a VARIABLE. Documentary at " +
        "runtime - all three are keys of EVENT_RULINGS and the emitter's own " +
        "branches handle them before this chain's `else` - but the SITE LIST is " +
        "load-bearing: it is the pin that makes a new variable-emit site a test " +
        "failure instead of a silent pass. `getOutputEvent(session)` " +
        "(handlers/command-handler/pre-login.ts:17) and screen.handler's " +
        "`eventName` / `paged.eventName` / `segState.eventName` all resolve to " +
        "one of the three; `beginLogoff`'s `opts.event ?? 'ansi-output'` " +
        "(server/logoff.ts:95) resolves to ansi-output for every caller in the " +
        "tree - no caller passes `event:` (measured 2026-09-03).",
    },
    sites: [
      { file: "web/backend/src/handlers/command-handler/pre-login.ts", line: 117, expression: "socket.emit(outputEvent" },
      { file: "web/backend/src/handlers/command-handler/pre-login.ts", line: 118, expression: "socket.emit(outputEvent" },
      { file: "web/backend/src/handlers/command-handler/pre-login.ts", line: 273, expression: "socket.emit(outputEventEarly" },
      { file: "web/backend/src/handlers/command-handler/pre-login.ts", line: 283, expression: "socket.emit(outputEvent" },
      // TP-6's R-branch answer ("RIP GRAPHICS NEED A WEB BROWSER - USING ANSI")
      // adds a sixteenth site, in flight in the shared tree while TP-3 lands.
      // Same resolution as the other four: getOutputEvent(session) returns
      // 'ansi-output' or 'petscii-output'. Claimed here so the site census is
      // total the moment TP-6 commits; the suite's own comment records that a
      // claimed-but-absent site is the SAFE direction and does not fail.
      { file: "web/backend/src/handlers/command-handler/pre-login.ts", line: 191, expression: "socket.emit(getOutputEvent(session" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2236, expression: "socket.emit(eventName" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2418, expression: "socket.emit(eventName" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2557, expression: "socket.emit(eventName" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2576, expression: "socket.emit(eventName" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2768, expression: "socket.emit(eventName" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2793, expression: "socket.emit(paged.eventName" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2804, expression: "socket.emit(paged.eventName" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2842, expression: "socket.emit(eventName" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2961, expression: "socket.emit(segState.eventName" },
      { file: "web/backend/src/handlers/screen.handler.ts", line: 2964, expression: "socket.emit(segState.eventName" },
      { file: "web/backend/src/server/logoff.ts", line: 95, expression: "socket.emit(opts.event ?? 'ansi-output'" },
    ],
  },
]);

/**
 * The rest of the variable-name emit sites in `web/backend/src`: six
 * pass-throughs that FORWARD a name which originated somewhere the literal
 * census already saw. They introduce no name of their own, which is why they
 * are not in PATTERN_RULINGS - and they are pinned here anyway, so the site
 * census can be TOTAL and a new unclassified site cannot hide among them.
 */
export const FORWARDING_EMIT_SITES: ReadonlyArray<VariableEmitSite & { readonly why: string }> =
  Object.freeze([
    {
      file: "web/backend/src/server/connection-emitter.ts",
      line: 89,
      expression: "eventBus.emit(event",
      why: "The emitter's own synthetic bus: `emitInternal` raises an INBOUND event for the door and file-upload flows. Never a transport write.",
    },
    {
      file: "web/backend/src/handlers/door.handler.ts",
      line: 376,
      expression: "socket.emit(event",
      why: "createDoorSocketWrapper's pass-through arm: every name it does not special-case goes on to the real socket, where this table rules it.",
    },
    {
      file: "web/backend/src/amiga-emulation/xim/io.ts",
      line: 129,
      expression: "this.socket.emit(event",
      why: "`directEmit` forwards the 68K session's output to the wrapped socket; the names it carries are the literal ones the census already holds.",
    },
    {
      file: "web/backend/src/doors/BBSApi.ts",
      line: 146,
      expression: "this.internalEmitter.emit(event",
      why: "`emitInternal` on the door API's own EventEmitter - server-side notification to the door, not a socket write.",
    },
    {
      file: "web/backend/src/scripts/run-amiga-door.ts",
      line: 18,
      expression: "super.emit(event",
      why: "A CLI harness's EventEmitter subclass. Not a session socket.",
    },
    {
      file: "web/backend/src/scripts/corpus-integration-runner.ts",
      line: 185,
      expression: "super.emit(event",
      why: "The corpus runner's EventEmitter subclass. Not a session socket.",
    },
  ]);

/** The first pattern whose `test` matches, or undefined. */
export function matchPattern(event: string): EventRuling | undefined {
  for (const entry of PATTERN_RULINGS) {
    if (entry.test.test(event)) return entry.ruling;
  }
  return undefined;
}

/** One name's tally on one connection. */
export interface TransportDropRecord {
  readonly event: string;
  count: number;
  readonly ruling: EventRuling["kind"] | "unruled";
}

/**
 * The connection an event was addressed to. `TelnetConnection`, `SSHConnection`
 * and `WSTerminalConnection` all satisfy it structurally; `transportDrops` is
 * optional so none of them has to declare it.
 */
export interface TransportConnection {
  write(data: string | Buffer): void;
  close?(): void;
  transportDrops?: Map<string, TransportDropRecord>;
}

/** The tally for a connection, created on first use. */
export function transportDropsFor(
  connection: TransportConnection,
): Map<string, TransportDropRecord> {
  let drops = connection.transportDrops;
  if (!drops) {
    drops = new Map<string, TransportDropRecord>();
    connection.transportDrops = drops;
  }
  return drops;
}

/**
 * Count one undelivered event. Returns TRUE the first time this name is seen on
 * this connection, which is the whole logging policy: once per name per
 * connection. The research counted 50 drops in one short session, and a
 * per-occurrence log would be noise the moment a door starts emitting
 * `door:status` twelve times a second.
 */
export function recordDrop(
  connection: TransportConnection,
  event: string,
  ruling: EventRuling["kind"] | "unruled",
): boolean {
  const drops = transportDropsFor(connection);
  const existing = drops.get(event);
  if (existing) {
    existing.count += 1;
    return false;
  }
  drops.set(event, { event, count: 1, ruling });
  return true;
}

/**
 * TP-4 FILLS THIS. Returns whether the event was actually turned into
 * connection state or into bytes.
 *
 * TP-3 rules every `translate` and `render` name and writes this stub; TP-4
 * gives each ruling a body (`door-active` -> `session.doorOwnsTerminal` and the
 * server ModemEmulator, `modem-speed` -> `getModemEmulator().enable(bps)`,
 * `mask-input` / `password-mode` -> `session.maskEcho`, `hangup` /
 * `force-disconnect` -> `connection.close()`, `system-message` /
 * `system:notice` -> `emitText`, `cursor-style` -> the DECSCUSR sequence) and
 * makes it return true. Until then it returns FALSE for everything, and
 * `applyTransportEvent` records the event in the tally with its own ruling
 * kind - so the count never lies about what a byte caller actually received.
 *
 * ORDERING RULE, written here because TP-4 must not break it: this runs on the
 * way DOWN, before any byte is written, and never re-enters `emitter.emit` for
 * anything but the two `render` cases - a translation that emitted would
 * re-enter the chain and could recurse. The `render` cases go through
 * `utils/output.util.ts` (`emitText`, `emitPrompt`), never
 * `utils/ansi-buffer.util.ts` directly, so the wrap choke and the session log
 * see them like everything else.
 */
export function applyTranslation(
  _connection: TransportConnection,
  _session: BBSSession | null | undefined,
  _event: string,
  _args: readonly unknown[],
  _ruling: EventRuling,
): boolean {
  return false;
}

/**
 * The `else` the emitter never had.
 *
 * Either performs the event's translation (connection state, a transport
 * action, a rendered notice) or records a RULED drop. An unruled name is a
 * defect and says so once, loudly: the backend must never emit an event to a
 * session that cannot receive it without this file knowing about it.
 */
export function applyTransportEvent(
  connection: TransportConnection,
  session: BBSSession | null | undefined,
  event: string,
  args: readonly unknown[],
): void {
  const ruling: EventRuling | undefined = EVENT_RULINGS[event] ?? matchPattern(event);

  if (!ruling) {
    // ONCE PER NAME PER CONNECTION, like every other drop: a door emitting an
    // unruled name sixty times a second must not be able to fill the log.
    if (recordDrop(connection, event, "unruled")) {
      console.error(
        `[Transport] UNRULED event '${event}' on ${session?.connectionType} node ` +
          `${session?.nodeId} - add it to EVENT_RULINGS in server/transport-adapter.ts`,
      );
    }
    return;
  }

  if (ruling.kind === "translate" || ruling.kind === "render") {
    if (applyTranslation(connection, session, event, args, ruling)) return;
    if (recordDrop(connection, event, ruling.kind)) {
      console.debug(
        `[Transport] ${ruling.kind} event '${event}' has no body yet (TP-4 fills it) ` +
          `on ${session?.connectionType}: ${ruling.note}`,
      );
    }
    return;
  }

  if (recordDrop(connection, event, ruling.kind)) {
    console.debug(
      `[Transport] ${ruling.kind} event '${event}' not delivered to ` +
        `${session?.connectionType}: ${ruling.note}`,
    );
  }
}
