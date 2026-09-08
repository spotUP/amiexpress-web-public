/**
 * The input timeout express has had since the beginning, and this port never
 * had at all.
 *
 * `idle_timeout` was in the config file, in the database, in the admin UI and
 * in the Amiga export, and NOTHING read it: a caller who walked away held his
 * node until the process restarted. `ACSPermission.NO_TIMEOUT` was declared
 * and never checked, so the one account that is supposed to be allowed to sit
 * there was in exactly the same position as everyone else.
 *
 * WHERE EXPRESS PUTS IT, and therefore where this goes. Not in a handler and
 * not in a transport: in the INPUT wait. `lineInput` and `readChar`
 * (express.e:2170, 5154) take a timeout and hand back `RESULT_TIMEOUT`, and
 * every prompt on the board is one of those two. This port's input wait is
 * event-driven - there is no blocking read to hand a timeout to - so the same
 * rule is expressed as a per-session timer that every keystroke restarts, from
 * the one pipeline every transport's input already goes through
 * (`server/terminal-input.ts`).
 *
 * THE RULES, from express.e:2184-2198:
 *
 *   IF (sopt.toggles[TOGGLES_NOTIMEOUT]) OR checkSecurity(ACS_NO_TIMEOUT)
 *     timeout:=0                          -> no timeout at all
 *   ELSEIF timeoutOverride<>-1
 *     timeout:=timeoutOverride            -> the node's OVERRIDE_TIMEOUT
 *   ENDIF
 *   IF (timeout<120) THEN warning:=TRUE ELSE timeout:=timeout-60
 *
 * and then, on the first expiry (express.e:2224-2229):
 *
 *   sendBELL(); timeout:=60; warning:=TRUE; JUMP redoinput
 *
 * So a timeout of two minutes or more is really two waits: the whole thing
 * minus a minute, a BEL, then one more minute. Under two minutes there is no
 * warning and no bell - the wait is the whole timeout and then the line drops.
 * Express says nothing else to the caller; `RESULT_TIMEOUT` travels out as an
 * abort and the carrier goes. This does the same: a BEL, then a hang-up, and
 * the CallersLog carries the reason.
 *
 * THE DEFAULT IS THE SYSOP'S, NOT THE CONSTANT'S. express hardcodes
 * `INPUT_TIMEOUT=300` (axconsts.e:89) at every call site; this board has had
 * an `IDLE_TIMEOUT` tooltype and an admin field in minutes all along, so that
 * is what is read, and 300 seconds is the fallback for a board that never set
 * one. A sysop who wants express's number writes `IDLE_TIMEOUT=5`.
 */
import { ACSPermission } from '../constants/acs-permissions';
import { checkSecurity } from '../utils/acs.util';
import { nodeTooltype } from '../utils/node-tooltypes.util';

/** axconsts.e:89 - what express passes to every lineInput/readChar. */
export const EXPRESS_INPUT_TIMEOUT_SECONDS = 300;

/**
 * express.e:2193-2196 - a timeout of at least this waits in two parts, and the
 * caller hears a bell between them.
 */
export const WARNING_THRESHOLD_SECONDS = 120;

/** express.e:2196/2226 - how long the caller has after the bell. */
export const WARNING_GRACE_SECONDS = 60;

/** express.e:2225 - the whole of what the caller is told. */
export const TIMEOUT_BELL = '\x07';

/** What this needs of a socket: one line out, and a hang-up. */
export interface IdleSocket {
  emit(event: string, data?: unknown): unknown;
  disconnect(...args: unknown[]): unknown;
}

/** What this needs of a session. */
export interface IdleSession {
  nodeId?: number;
  user?: { secLevel?: number; secOverride?: string; securityFlags?: string } | null;
  /** Set while a file transfer owns the line. */
  transferRawActive?: boolean;
}

interface IdleState {
  socket: IdleSocket;
  timer: ReturnType<typeof setTimeout>;
  /** True once the bell has been sent and the caller is inside the grace. */
  warned: boolean;
  seconds: number;
}

/**
 * Per session, so a session that is dropped without a disarm cannot keep a
 * timer alive by being referenced from a module map.
 */
const armed = new WeakMap<object, IdleState>();

/** The board's own `IDLE_TIMEOUT`, in seconds, or the express constant. */
function configuredSeconds(): number {
  try {
    const { config } = require('../config');
    const { getBoardConfig } = require('./bbs-config-file.service');
    const board = getBoardConfig(config.get('dataDir'));
    if (board?.no_timeout) return 0;
    const minutes = Number(board?.idle_timeout);
    if (Number.isFinite(minutes) && minutes > 0) return Math.floor(minutes) * 60;
  } catch {
    // A board whose config cannot be read still gets express's timeout rather
    // than none: a missing file must not silently unlock every line.
  }
  return EXPRESS_INPUT_TIMEOUT_SECONDS;
}

/**
 * How long this caller may sit at a prompt. `0` means never time him out.
 *
 * express.e:2184-2189, in its order: the board-wide switch and the caller's
 * own ACS grant first, then the node's override, then the default.
 */
export function idleTimeoutSecondsFor(session: IdleSession): number {
  if (checkSecurity((session.user ?? null) as never, ACSPermission.NO_TIMEOUT)) return 0;

  const configured = configuredSeconds();
  if (configured === 0) return 0;

  if (session.nodeId !== undefined) {
    const override = Number(nodeTooltype(session.nodeId, 'OVERRIDE_TIMEOUT'));
    if (Number.isFinite(override) && override > 0) return Math.floor(override);
    if (Number.isFinite(override) && override === 0) return 0;
  }

  return configured;
}

function clear(session: IdleSession): void {
  const state = armed.get(session as object);
  if (!state) return;
  clearTimeout(state.timer);
  armed.delete(session as object);
}

/**
 * Start the wait, or start it again.
 *
 * The first leg is the whole timeout less a minute when there is room for a
 * warning, and the whole timeout when there is not - express.e:2193-2197.
 */
function schedule(socket: IdleSocket, session: IdleSession, seconds: number, warned: boolean): void {
  const wait = warned
    ? WARNING_GRACE_SECONDS
    : seconds >= WARNING_THRESHOLD_SECONDS
      ? seconds - WARNING_GRACE_SECONDS
      : seconds;

  const timer = setTimeout(() => {
    // A transfer owns the line and answers for itself - express returns
    // RESULT_TIMEOUT from processInputMessage without ever starting the timer
    // while `transfering` is set (express.e:7402-7404). Here the timer is
    // simply pushed out rather than firing into a running ZMODEM.
    if (session.transferRawActive) {
      schedule(socket, session, seconds, warned);
      return;
    }

    if (!warned && seconds >= WARNING_THRESHOLD_SECONDS) {
      // express.e:2225 - sendBELL(), then one more minute.
      try { socket.emit('ansi-output', TIMEOUT_BELL); } catch { /* the line is already gone */ }
      schedule(socket, session, seconds, true);
      return;
    }

    hangUp(socket, session);
  }, wait * 1000);

  // `unref` where the runtime has it: an idle timer must never be the reason
  // the process stays up (jest's fake timers and the browser shim have none).
  (timer as unknown as { unref?: () => void }).unref?.();

  armed.set(session as object, { socket, timer, warned, seconds });
}

function hangUp(socket: IdleSocket, session: IdleSession): void {
  clear(session);
  try {
    const { callersLogManager } = require('./CallersLogManager');
    if (session.nodeId !== undefined) {
      callersLogManager.logActivity(session.nodeId, 'Inactivity timeout');
    }
  } catch { /* the log is not worth failing the hang-up for */ }
  try { socket.disconnect(); } catch { /* already gone */ }
}

/**
 * Arm the timeout for a caller who has just connected.
 *
 * Called once per session, by each transport where it builds the session -
 * a caller who connects and types NOTHING is exactly the case express times
 * out at the username prompt, so this cannot wait for the first keystroke.
 */
export function armIdleTimeout(socket: IdleSocket, session: IdleSession): void {
  clear(session);
  const seconds = idleTimeoutSecondsFor(session);
  if (seconds <= 0) return;
  schedule(socket, session, seconds, false);
}

/**
 * A keystroke arrived: the wait starts over, and the warning is forgotten
 * (express.e:2232-2234 - `warning:=FALSE; timeout:=originalTimeout`).
 *
 * Re-reads the timeout each time so a sysop's edit, or an ACS grant that
 * arrives with the login, takes effect on this session rather than the next.
 */
export function noteCallerActivity(session: IdleSession): void {
  const state = armed.get(session as object);
  if (!state) return;
  clearTimeout(state.timer);
  const seconds = idleTimeoutSecondsFor(session);
  if (seconds <= 0) {
    armed.delete(session as object);
    return;
  }
  schedule(state.socket, session, seconds, false);
}

/** The line is gone, or the caller is being logged off: stop the clock. */
export function disarmIdleTimeout(session: IdleSession | null | undefined): void {
  if (!session) return;
  clear(session);
}

/** Is this session being timed? Exported for the tests and the node display. */
export function isIdleTimeoutArmed(session: IdleSession): boolean {
  return armed.has(session as object);
}
