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
import type { Socket } from "socket.io";
import type { BBSSession } from "../index";
import type { LoginEmitter } from "../types/login-emitter";
import { emitText, flushOutput } from "../utils/output.util";
import { getModemEmulator } from "../utils/modem-emulator.util";
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
  /**
   * The state the translations below write (TP-4). Optional so
   * `TelnetConnection`, `SSHConnection` and `WSTerminalConnection` still
   * satisfy this interface without declaring it, and typed HERE rather than
   * reached through a cast - a translation that needs a field on the
   * connection adds it to this interface, never to an `as any`.
   */
  transportState?: TransportConnectionState;
}

/**
 * WHAT A BYTE TERMINAL KEEPS INSTEAD OF A BROWSER'S REACTION (TP-4).
 *
 * Each field is written by exactly one translation below and named after the
 * event that writes it. Nothing here duplicates a fact the SESSION already
 * holds: masking is `session.maskInput` (index.ts, three live readers in
 * `handlers/command.handler.ts` - the server-side echo), game mode is
 * `session.gameModeEnabled` (set by `services/game-mode.service.ts` before it
 * emits), geometry is `applyClientReportedGeometry`
 * (`amiga-emulation/xim/screen-width.util.ts`). What is left is what only the
 * TRANSPORT knows, which is why it lives on the connection.
 */
export interface TransportConnectionState {
  /**
   * `door-active`: a door owns the screen. RECORD ONLY, and deliberately so -
   * see `translateDoorActive` for why the server pacer must NOT be touched
   * here. The server-side answer to "does a door own this terminal" stays
   * `utils/door-owns-terminal.ts`, which derives it from the flags the door
   * exit path actually clears; this is the transport's own copy of the event,
   * so a reader with a connection and no session can still answer it.
   */
  doorActive: boolean;
  /**
   * `door:input-mode` / `set-input-mode`: the input mode a door or a handler
   * last asked for ('game', 'menu', 'line'). One field for both names: they
   * are the same question asked by the door API and by the upload/rename
   * prompts, and a second field would be a second answer.
   */
  inputMode: string | null;
  /** `terminal-mode`: 'fixed' | 'wide'. State only - nothing server-side reads it yet. */
  terminalMode: string | null;
  /** `modem-speed`: the bps the SERVER pacer was last set to for this connection. 0 = full speed. */
  modemBps: number;
  /** `hangup` / `force-disconnect`: which transport action closed the connection, or null. */
  closedBy: "hangup" | "force-disconnect" | null;
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
 * The state a connection keeps, created on first use. Same shape as
 * `transportDropsFor`: the connection does not have to declare it, and a
 * caller never has to test for undefined.
 */
export function transportStateFor(
  connection: TransportConnection,
): TransportConnectionState {
  let state = connection.transportState;
  if (!state) {
    state = {
      doorActive: false,
      inputMode: null,
      terminalMode: null,
      modemBps: 0,
      closedBy: null,
    };
    connection.transportState = state;
  }
  return state;
}

/**
 * Everything one translation is allowed to touch.
 *
 * The EMITTER is here because two of the things a byte transport has to honour
 * live on socket-shaped helpers, not on the connection: the server
 * `ModemEmulator` (`utils/modem-emulator.util.ts`, keyed on the socket it
 * wraps) and the output buffer behind `emitText` / `flushOutput`
 * (`utils/output.util.ts`, keyed on `socket.id`). Reaching them through the
 * connection would mean a second pacer and a second buffer for the same
 * caller, which is the duplication this plan exists to retire.
 */
export interface TranslationContext {
  readonly connection: TransportConnection;
  readonly emitter: TransportEmitter;
  readonly session: BBSSession | null | undefined;
}

/**
 * `utils/output.util.ts` and `utils/modem-emulator.util.ts` are typed against
 * socket.io's `Socket`, which is the shape `LoginEmitter` was extracted from
 * and which the connection emitter satisfies structurally for every member
 * they touch (`emit`, `on`, `id`). `services/login-post.service.ts` already
 * hands the same object to `getModemEmulator` - through a `require`, which
 * simply hides the conversion. This function is that conversion, written down
 * once and named, so no `any` crosses this module's boundary.
 */
function asSocket(emitter: TransportEmitter): Socket {
  return emitter as unknown as Socket;
}

/** One event's body. Returns whether the event was actually honoured. */
type Translation = (ctx: TranslationContext, args: readonly unknown[]) => boolean;

/**
 * `door-active` - the connection learns that a door owns the screen.
 *
 * RECORD ONLY, AND THE PACER IS DELIBERATELY NOT TOUCHED. The plan's TP-4
 * table says to disable the server `ModemEmulator` while a door is active
 * "which is what the browser's bypass achieves for web". Measured against the
 * tree on 2026-09-03, that would create a divergence rather than close one:
 *
 *   - Web has TWO pacers. The SERVER one wraps the socket's own emit of
 *     ansi-output (`utils/modem-emulator.util.ts`) and the CLIENT one runs in
 *     `packages/terminal/src/components/BBSTerminal.tsx`. `door-active` is
 *     what stops the CLIENT one pacing a door's frames a second time.
 *   - A byte transport has ONE pacer, and it is the SERVER one - the same one
 *     web keeps running during a door. `utils/modem-emulator.util.ts:299`
 *     records why it stays on: 68K and AREXX doors throttle at the caller's
 *     modem speed for 1:1 Amiga fidelity, and only modern TypeScript doors
 *     turn it off, which `handlers/door.handler.ts` already does explicitly
 *     on door entry and undoes on exit.
 *
 * So disabling it here would run a 68K door at full speed on telnet while the
 * same door still ran at 2400 bps on web. The byte transport's honest
 * translation of "the client pacer must stand aside" is that it has no client
 * pacer to stand aside; the SPEED events (`modem-speed`) are the ones that
 * move this connection's pacing, and they have their own body below.
 */
const translateDoorActive: Translation = (ctx, args) => {
  transportStateFor(ctx.connection).doorActive = Boolean(args[0]);
  return true;
};

/**
 * `game-mode` - a documented no-op, which is the whole content of the ruling.
 *
 * `services/game-mode.service.ts:25` and `:44` set `session.gameModeEnabled`
 * BEFORE they emit, so the state a byte transport could keep is already kept,
 * by the single body that owns it. What the event asks a browser for is raw
 * key-down/key-up EDGES, and a character stream has no key-up:
 * `transportCapabilities(session).keyEvents` is false for every byte
 * transport, which is the answer TP-7 already wired into the door API. Writing
 * a second copy of `gameModeEnabled` onto the connection would be a second
 * answer to a question that already has one.
 */
const translateGameMode: Translation = () => true;

/**
 * `modem-speed` - THIS connection's pacing.
 *
 * Telnet and SSH have no client pacer, so the server `ModemEmulator` is the
 * only thing between a door's frames and the wire. `install()` is idempotent
 * (`utils/modem-emulator.util.ts:266`) and is what puts the throttle on the
 * emitter at all - a caller whose emulator was never installed would take
 * `enable(bps)` on a throwaway object and keep running at full speed, which is
 * exactly the kind of silent no-op this plan is about.
 *
 * The symptom this closes: a door that zeroes the speed on entry stayed
 * throttled on a byte transport, because `handlers/door.handler.ts` disables
 * the emulator through the socket it was handed and then announces the change
 * with this event - and on telnet the announcement fell off the end of the
 * emitter's chain.
 */
const translateModemSpeed: Translation = (ctx, args) => {
  const bps = Number(args[0]);
  if (!Number.isFinite(bps) || bps < 0) return false;
  const emulator = getModemEmulator(asSocket(ctx.emitter));
  if (bps > 0) {
    emulator.install();
    emulator.enable(bps);
  } else {
    emulator.disable();
  }
  transportStateFor(ctx.connection).modemBps = bps > 0 ? bps : 0;
  return true;
};

/**
 * `mask-input` and `password-mode` - echo off for a password.
 *
 * ONE FIELD, AND IT ALREADY EXISTS. `session.maskInput` is declared on
 * `BBSSession` (`index.ts`) and read by the server-side echo in
 * `handlers/command.handler.ts:2299`, `:2333` and `:2422`
 * (`emitText(socket, session.maskInput ? '*' : data)`) - the comment beside
 * it says "backend handles ALL echo", which is precisely why a byte transport
 * can honour this event at all. `handlers/user/gdpr.handler.ts:61` and
 * `handlers/user/new-user.handler.ts:662` set the same field beside their own
 * `password-mode` emit; this translation is what sets it for the seventeen
 * sites that only emit.
 *
 * The plan's TP-4 table calls the field `session.maskEcho`. Adding that name
 * would have been a SECOND body of the same fact, next to a field three live
 * readers already consult - so the existing one is used and the plan's name is
 * not created.
 */
const translateMaskInput: Translation = (ctx, args) => {
  if (!ctx.session) return false;
  ctx.session.maskInput = Boolean(args[0]);
  return true;
};

/**
 * `door:input-mode` (a door's 'game' / 'menu') and `set-input-mode` (a
 * handler's 'line', for the upload description and rename prompts). Both
 * answer "how should this caller's keystrokes be read", so both write one
 * field. Recorded rather than acted on: the byte transport's input pipeline is
 * TP-8's, and this is the state it reads.
 */
const translateInputMode: Translation = (ctx, args) => {
  const mode = args[0];
  if (typeof mode !== "string" || mode.length === 0) return false;
  transportStateFor(ctx.connection).inputMode = mode;
  return true;
};

/**
 * `terminal-mode` - 'fixed' (80 columns) or 'wide' (responsive), from
 * `doors/BBSApi.ts:483`. State only: nothing server-side reads it today, and
 * a byte terminal's width is settled by TTYPE/NAWS and
 * `applyClientReportedGeometry`, not by a door's preference. Recorded so the
 * event stops being a silent drop and so the door's request is answerable.
 */
const translateTerminalMode: Translation = (ctx, args) => {
  const mode = args[0];
  if (typeof mode !== "string" || mode.length === 0) return false;
  transportStateFor(ctx.connection).terminalMode = mode;
  return true;
};

/**
 * `terminal-resize` - a documented no-op on a byte transport.
 *
 * `handlers/command-handler/pre-login.ts:162` emits it after setting the
 * session's own 40x25 geometry, to tell a BROWSER to resize its canvas. A
 * telnet or SSH caller's terminal is the authority on its own size, and
 * `applyClientReportedGeometry` (`amiga-emulation/xim/screen-width.util.ts`)
 * is the one gate that decides what a report may change - it already refuses
 * to be told otherwise for a PETSCII session. Nothing to do, and nothing to
 * record: a second copy of the geometry here would be a second answer.
 */
const translateTerminalResize: Translation = () => true;

/**
 * `hangup` - BB_DROPDTR. A 68K door drops the carrier
 * (`amiga-emulation/session/DoorMessageHandler.ts:1676`).
 *
 * On a byte transport dropping the carrier IS closing the connection, so that
 * is what this does. No consumer existed on any transport before this line:
 * divergence 12.
 */
const translateHangup: Translation = (ctx) => {
  const close = ctx.connection.close;
  if (typeof close !== "function") return false;
  transportStateFor(ctx.connection).closedBy = "hangup";
  close.call(ctx.connection);
  return true;
};

/**
 * `force-disconnect` - the logoff path's "the line is going down now"
 * (`handlers/commands/system-commands.handler.ts:216`).
 *
 * The BUFFER IS FLUSHED FIRST. `emitText` batches for 16 ms
 * (`utils/ansi-buffer.util.ts`), so the "Click... NO CARRIER" line - and a
 * sysop's kick notice, which is emitted immediately before its disconnect -
 * would still be sitting in the buffer when the socket closed. `flushOutput`
 * is `utils/output.util.ts`'s entry point for exactly that, the same one every
 * prompt uses.
 */
const translateForceDisconnect: Translation = (ctx) => {
  const close = ctx.connection.close;
  if (typeof close !== "function") return false;
  transportStateFor(ctx.connection).closedBy = "force-disconnect";
  flushOutput(asSocket(ctx.emitter));
  close.call(ctx.connection);
  return true;
};

/**
 * The text a notice payload carries, or null if it carries none.
 *
 * TWO SHAPES, BOTH MEASURED. `system-message` carries `{ text }` and the text
 * is already wire-ready - `api/node-control-routes.ts:271` writes its own
 * leading and trailing CRLF around the sysop's kick line. `system:notice`
 * carries `{ kind, seconds, message }`
 * (`services/restart-notice.service.ts:35-39`) and its `message` is a bare
 * sentence, so it is given a line of its own rather than being glued onto
 * whatever the caller was reading. A payload with neither field renders
 * nothing and says so by returning null, which leaves the event in the tally
 * instead of claiming a delivery that put no bytes on the wire.
 */
function noticeText(payload: unknown): string | null {
  if (typeof payload === "string") return payload.length > 0 ? payload : null;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { text?: unknown; message?: unknown };
  if (typeof record.text === "string" && record.text.length > 0) return record.text;
  if (typeof record.message === "string" && record.message.length > 0) {
    return `\r\n${record.message}\r\n`;
  }
  return null;
}

/**
 * `system-message` and `system:notice` - the two RENDERED notices.
 *
 * These are the documented exceptions to the ordering rule: they write bytes,
 * through `emitText` (`utils/output.util.ts:34`), which is the wrapper every
 * handler imports - never `utils/ansi-buffer.util.ts` directly - so the wrap
 * choke and the session log see them like every other line. That re-enters
 * the emitter with ansi-output exactly once, on the emitter's own first
 * branch, and cannot come back here.
 *
 * The sysop's kick notice (`api/node-control-routes.ts:271-275`) is one of
 * these, and reaching a telnet caller with it is the point.
 *
 * WHAT THIS DOES NOT MEAN. A door's server half has already seen the same
 * event through `createDoorSocketWrapper`'s outgoing interceptor
 * (`handlers/door.handler.ts:130-170`) and may render it itself - that is how
 * `Doors/livechat/handlers/system-notice.handler.ts` gets its copy. This line
 * is for the caller whose door has no such handler, which is every 68K door,
 * and it is why a restart notice reaching a byte terminal is better than
 * silence.
 */
const renderNotice: Translation = (ctx, args) => {
  const text = noticeText(args[0]);
  if (text === null) return false;
  emitText(asSocket(ctx.emitter), text);
  return true;
};

/**
 * ONE BODY PER RULED NAME. Every `translate` ruling in
 * `server/transport-event-rulings.ts` and both rendered notices appear here;
 * the suite `tests/transport/transport-translations.test.ts` asserts that
 * correspondence in both directions, so a ruling can never gain a kind without
 * a body or keep a body without a ruling.
 *
 * `ansi-output`, `petscii-output` and `petscii-bytes` are ruled `render` and
 * are deliberately absent: the emitter's own three branches handle them and
 * they never reach this table (`server/connection-emitter.ts`).
 */
const TRANSLATIONS: Readonly<Record<string, Translation>> = Object.freeze({
  "door-active": translateDoorActive,
  "door:input-mode": translateInputMode,
  "force-disconnect": translateForceDisconnect,
  "game-mode": translateGameMode,
  hangup: translateHangup,
  "mask-input": translateMaskInput,
  "modem-speed": translateModemSpeed,
  "password-mode": translateMaskInput,
  "set-input-mode": translateInputMode,
  "system-message": renderNotice,
  "system:notice": renderNotice,
  "terminal-mode": translateTerminalMode,
  "terminal-resize": translateTerminalResize,
});

/** The names this module has a body for. The suite reads it; nothing else should. */
export const TRANSLATED_EVENT_NAMES: ReadonlyArray<string> = Object.freeze(
  Object.keys(TRANSLATIONS).sort(),
);

/**
 * TP-4: the translated events become connection state.
 *
 * Returns whether the event was actually turned into connection state or into
 * bytes. FALSE is not a failure mode to be hidden - it is how a payload the
 * body could not use (a `system-message` with no text, a `modem-speed` with no
 * number) stays in `connection.transportDrops` instead of being counted as
 * delivered.
 *
 * ORDERING RULE. This runs on the way DOWN, before any byte is written, and
 * never re-enters `emitter.emit` for anything but the two rendered notices -
 * a translation that emitted would re-enter the chain and could recurse. Those
 * two go through `utils/output.util.ts` (`emitText`, `flushOutput`), never
 * `utils/ansi-buffer.util.ts` directly, so the wrap choke and the session log
 * see them like everything else. Neither carries a `sourceCharset` attribute:
 * they are composed text, not screen-file content (TP-5's rule).
 *
 * NEVER THROWS. A door emits these mid-frame; a bad payload from one door must
 * not take down the caller's session. A throw is caught, logged once with the
 * event name, and reported as an undelivered event.
 */
export function applyTranslation(
  connection: TransportConnection,
  session: BBSSession | null | undefined,
  event: string,
  args: readonly unknown[],
  emitter: TransportEmitter,
): boolean {
  const translation = TRANSLATIONS[event];
  if (!translation) return false;
  try {
    return translation({ connection, emitter, session }, args);
  } catch (err) {
    // ONCE PER NAME PER CONNECTION, like every other line this module writes: a
    // door emitting a bad payload sixty times a second must not be able to fill
    // the log either. The caller then records the drop, which is what makes the
    // NEXT occurrence of this name silent.
    if (!transportDropsFor(connection).has(event)) {
      console.error(
        `[Transport] translation of '${event}' threw on ${session?.connectionType} node ` +
          `${session?.nodeId}:`,
        err,
      );
    }
    return false;
  }
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
  emitter: TransportEmitter,
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
    if (applyTranslation(connection, session, event, args, emitter)) return;
    // TP-4 gave every `translate` and rendered-notice ruling a body, so
    // reaching here means the BODY could not use this payload (a notice with
    // no text, a speed that is not a number) - or that a rendered name reached
    // the adapter at all, which the emitter's own branches should have caught.
    // Either way the caller did not receive it, and the tally must say so.
    if (recordDrop(connection, event, ruling.kind)) {
      console.debug(
        `[Transport] ${ruling.kind} event '${event}' was not honoured on ` +
          `${session?.connectionType} (payload the translation could not use): ${ruling.note}`,
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
