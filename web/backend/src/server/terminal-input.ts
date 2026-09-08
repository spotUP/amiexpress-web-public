/**
 * What happens to one chunk of caller input, decided once for every transport.
 *
 * TP-8 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`. The plan's
 * output half is the connection emitter and the wire encoder; this is the
 * input half, and it carries the same class of defect. Five behaviours lived
 * in the web `command` handler and in NO telnet path:
 *
 *   - SS3 to CSI normalisation, so an arrow key in application-cursor mode is
 *     understood (the command handler only knows CSI);
 *   - per-character dispatch, so a paste or a fast burst is not one opaque
 *     command;
 *   - the `checkForPause` and `flagPause` line accumulators with their echo;
 *   - chat-mode keystrokes;
 *   - the client-door and game-mode guards, and the stray SGR mouse drop.
 *
 * A telnet caller had none of them: `transport-session.ts` passed the whole TCP
 * segment to `handleCommand` as one string, and only four of that handler's
 * branches accommodate multi-character input.
 *
 * IT RETURNS A DECISION, NOT AN ACTION, because the two transports dispatch
 * differently and must keep doing so: on web a door's `socket.once('command')`
 * listener is fired by socket.io itself, in parallel with the handler, so the
 * handler early-returns for a door; on telnet nothing fires it and the handler
 * calls `emitter.emitInternal('command', ...)` instead. Folding the dispatch in
 * here would have made one of the two wrong.
 *
 * TWO PHASES, and the split is load-bearing. `classifyTerminalInput` answers
 * everything that happens BEFORE a door can see the keystroke; `commandPieces`
 * answers what the BBS command handler is given AFTER door routing has
 * declined it. They are not one function because the order differs on purpose:
 * a pause prompt outranks a running door, and the mouse drop does not - a door
 * that asked for mouse reports gets them, and only a report with no consumer
 * left is dropped. One function would have had to pick an order that is wrong
 * at one end or the other.
 */
import type { BBSSession } from '../index';
import { noteCallerActivity } from '../services/idle-timeout.service';

/** Which of the two pause accumulators a decision belongs to. */
export type PauseKind = 'check' | 'flag';

export type InputDecision =
  /** Raw file transfer is running; the bytes go to its sink and nowhere else. */
  | { kind: 'transfer-sink'; sink: (bytes: Buffer) => void }
  /**
   * A pause prompt is accumulating a line. `handler`/`line` are set only on
   * the keystroke that SUBMITS it (CR or LF); `echo` is what the caller should
   * write back, and is null when there is nothing to echo.
   */
  | { kind: 'pause'; which: PauseKind; handler: ((line: string) => void) | null; line: string | null; echo: string | null }
  /** The session is in chat mode; the caller runs `handleChatModeInput`. */
  | { kind: 'chat' }
  /** Consumed with no further routing: a client-side door, or game mode. */
  | { kind: 'swallow'; why: 'client-door' | 'game-mode' }
  /** Nothing claimed it here - the caller now does its own door routing. */
  | { kind: 'route' };

/**
 * ESC O x -> ESC [ x.
 *
 * A terminal in DECCKM (application cursor keys) sends SS3 for the arrow keys,
 * and the command handler only knows CSI. Web has normalised this since
 * socket-handlers.ts; telnet never has, so a real terminal's arrow keys did
 * nothing at all over telnet.
 */
export function normaliseCursorKeys(input: string): string {
  if (input.startsWith('\x1bO') && input.length >= 3) return `\x1b[${input.slice(2)}`;
  return input;
}

/**
 * The chunking rule, one copy.
 *
 * An escape sequence is dispatched WHOLE - splitting `\x1b[A` into three
 * characters is three commands, none of them an arrow key - and every other
 * chunk is split per character, which is what web has always done and what
 * makes a paste and a fast burst behave the same on both transports.
 */
export function splitInputForDispatch(input: string): string[] {
  if (input.startsWith('\x1b[') && input.length >= 2) return [input];
  return Array.from(input);
}

/**
 * An SGR mouse report with no door left to consume it.
 *
 * xterm.js keeps DEC mode 1006 across a door exit, so every mouse MOVE sends
 * `\x1b[<btn;col;row;M` back on the input channel. Reaching `handleCommand`
 * with that at the ANSI prompt makes it echo `[<35;X;Y;M` at the caller's
 * cursor - visible mouse tracking typed onto the screen. Doors that want mouse
 * get it through door routing, which runs FIRST; by the time this is asked
 * there is no valid consumer and dropping is correct.
 */
export function isStrayMouseReport(input: string): boolean {
  return /^\x1b\[<\d+;\d+;\d+[Mm]/.test(input);
}

/**
 * What the BBS command handler should be given, in order - possibly nothing.
 *
 * Phase two: called only after the transport's own door routing has declined
 * the keystroke.
 */
export function commandPieces(input: string): string[] {
  if (isStrayMouseReport(input)) return [];
  return splitInputForDispatch(normaliseCursorKeys(input));
}

/** The session fields these accumulators live on; they are not on BBSSession's type. */
interface PauseState {
  checkPauseHandler?: (line: string) => void;
  checkPauseBuffer?: string;
  flagPauseHandler?: (line: string) => void;
  flagPauseBuffer?: string;
  transferRawActive?: boolean;
  transferRawSink?: (bytes: Buffer) => void;
  transferManager?: { handleInput?: (bytes: Buffer) => void };
}

const HANDLER_FIELD = { check: 'checkPauseHandler', flag: 'flagPauseHandler' } as const;
const BUFFER_FIELD = { check: 'checkPauseBuffer', flag: 'flagPauseBuffer' } as const;

/**
 * Clear a pause handler after it has run, unless it registered a NEW one.
 *
 * The comparison is what makes a chain of prompts work: a handler that asks a
 * second question sets a fresh handler while running, and clearing
 * unconditionally would throw that away and strand the caller.
 */
export function clearPauseHandler(session: BBSSession, which: PauseKind, ran: (line: string) => void): void {
  const state = session as unknown as PauseState;

  // THE CALLER IS STILL THERE. express restarts the input timeout on every
  // keystroke that is not itself a timeout (express.e:2232-2234); this is the
  // one pipeline every transport's input passes through, so it is the one
  // place that can say so. Before the transfer sink and before the pause
  // accumulators on purpose: bytes fed to a ZMODEM receiver are the caller
  // typing too.
  noteCallerActivity(session as never);
  if (state[HANDLER_FIELD[which]] === ran) state[HANDLER_FIELD[which]] = undefined;
}

/** Accumulate one keystroke into a pause buffer and say what to echo. */
function accumulatePause(session: BBSSession, which: PauseKind, data: string): InputDecision {
  const state = session as unknown as PauseState;
  const bufferField = BUFFER_FIELD[which];
  if (state[bufferField] === undefined) state[bufferField] = '';

  /**
   * SPACE on an EMPTY buffer submits, exactly as RETURN does.
   *
   * The sysop, 2026-09-07: "Some BBS prompts are not dismissable with
   * SPACE." Both pause prompts read a LINE, so a space used to be typed
   * into the buffer and nothing happened until the caller also pressed
   * RETURN - and a space is what every pager on every other system takes
   * for "next page". Both handlers already read an empty line as "more",
   * so this submits the same empty line RETURN submits; no handler needed
   * a new branch, and no prompt gained a second meaning.
   *
   * Only on an empty buffer. `NS`, and a filename with a space in it, are
   * still lines a caller can type at these prompts.
   */
  if (data === ' ' && state[bufferField] === '') {
    const handler = state[HANDLER_FIELD[which]] as (line: string) => void;
    return { kind: 'pause', which, handler, line: '', echo: null };
  }

  // CR or LF submits the line.
  if (data === '\r' || data === '\n') {
    const handler = state[HANDLER_FIELD[which]] as (line: string) => void;
    const line = state[bufferField] as string;
    // Cleared BEFORE the handler runs: the handler may register the next
    // prompt, and it must start from an empty buffer.
    state[bufferField] = '';
    return { kind: 'pause', which, handler, line, echo: null };
  }

  // Backspace takes a character back off, and erases it on the screen.
  if (data === '\x7f' || data === '\b') {
    state[bufferField] = (state[bufferField] as string).slice(0, -1);
    return { kind: 'pause', which, handler: null, line: null, echo: '\b \b' };
  }

  state[bufferField] = (state[bufferField] as string) + data;
  return { kind: 'pause', which, handler: null, line: null, echo: data };
}

/**
 * Everything that can claim a keystroke BEFORE door routing sees it.
 *
 * The order is the order the web handler has always used, and it is the order
 * telnet now gets: a transfer sink, then the two pause accumulators, then chat
 * mode, then the two guards that mean "this caller's keys belong to something
 * that is not the BBS".
 */
export function classifyTerminalInput(
  session: BBSSession,
  data: string,
  opts: { deliversKeyEvents?: boolean } = {},
): InputDecision {
  const state = session as unknown as PauseState;

  // THE CALLER IS STILL THERE. express restarts the input timeout on every
  // keystroke that is not itself a timeout (express.e:2232-2234); this is the
  // one pipeline every transport's input passes through, so it is the one
  // place that can say so. Before the transfer sink and before the pause
  // accumulators on purpose: bytes fed to a ZMODEM receiver are the caller
  // typing too.
  noteCallerActivity(session as never);

  if (state.transferRawActive) {
    const sink = state.transferRawSink || state.transferManager?.handleInput;
    // No sink means the flag is set with nothing behind it; the keystroke
    // falls through rather than vanishing.
    if (sink) return { kind: 'transfer-sink', sink };
  }

  if (state.checkPauseHandler) return accumulatePause(session, 'check', data);
  if (state.flagPauseHandler) return accumulatePause(session, 'flag', data);

  if (session.inChat) return { kind: 'chat' };

  /**
   * A door running IN THE BROWSER owns the keyboard. The exception is a
   * server-side blessed modal that installed a door input handler while the
   * client bundle was still loading - the caller has to be able to type into
   * that - and the caller handles it, because only it has the handler.
   */
  if (session.clientDoorActive) return { kind: 'swallow', why: 'client-door' };

  /**
   * Game mode means the CLIENT sends key-down/key-up events instead of
   * characters, so the character path steps aside. Only a browser has that
   * channel: a telnet or SSH caller has nothing but characters, and returning
   * here dropped every keystroke they made - a game-mode door drew perfectly
   * over telnet and took no input at all. `deliversKeyEvents` is the
   * transport's answer, and it is false for telnet and SSH.
   */
  if (session.gameModeEnabled && opts.deliversKeyEvents) return { kind: 'swallow', why: 'game-mode' };

  return { kind: 'route' };
}
