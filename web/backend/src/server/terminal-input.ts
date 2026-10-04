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
/**
 * ONE CHUNK, WHOLE, BECAUSE THE OPERATOR CHAT CAN TAKE IT.
 *
 * splitInputForDispatch gives the command handler a character at a time, and
 * that is right for a menu, a hot key and a line editor - every one of them is
 * written against a single keystroke. The operator chat is not: its branch
 * accumulates a pasted run and writes it as one frame.
 *
 * While the split stood in front of it, a pasted line was dispatched as N
 * un-awaited calls, each paying for the handler's preamble and its own emit to
 * the sysop room. The sysop pasted and watched it trickle ("it still takes a
 * long time for pastes to arrive in the chat", 2026-09-13) - after two fixes
 * of mine that were both downstream of this line and could never have run.
 *
 * An escape sequence still goes the old way: F1 and the arrows are single
 * keys, and the chat branch tests them as such.
 */
export function chatTakesTheWholeChunk(subState: unknown, input: string): boolean {
  if (String(subState) !== 'operator_chat_active') return false;
  if (input.length <= 1) return false;
  if (input.startsWith('\x1b')) return false;
  return !isStrayMouseReport(input);
}

/**
 * The LF half of a telnet RETURN, when it arrives in its OWN packet.
 *
 * `splitInputForDispatch` collapses `CR LF` inside one chunk, which covers a
 * client that writes its line terminator in one go. A client that flushes
 * between the two bytes - or a network that splits the segment - hands the
 * board a chunk ending in CR and then a chunk that is just LF, and the second
 * one submits again at whatever prompt the first one opened. That is the
 * "each second time" in the report: it depends on packet boundaries, so it
 * happens on some presses and not others.
 *
 * The latch is the caller's, not the module's: two sessions interleave on one
 * process, and a shared flag would let one caller's CR eat another's LF.
 */
export function swallowTelnetLineFeed(session: BBSSession, input: string): string {
  const state = session as unknown as { lastInputEndedWithCr?: boolean };
  const held = state.lastInputEndedWithCr === true;
  const text = held && input.startsWith('\n') ? input.slice(1) : input;
  state.lastInputEndedWithCr = text.endsWith('\r') || (input === '\r');
  return text;
}

export function splitInputForDispatch(input: string): string[] {
  if (input.startsWith('\x1b[') && input.length >= 2) return [input];
  /*
   * CR LF IS ONE RETURN, NOT TWO.
   *
   * Every prompt on this board treats `\r` and `\n` alike - a menu, a hot
   * key, a line editor - so a telnet client that ends its line with CR LF
   * submitted TWICE, and the second one was an empty line at whatever prompt
   * the first had opened: "main prompt behave weird, making a empty return
   * each second time" (a caller over telnet, relayed 2026-09-23).
   *
   * The NUL half of the other convention is already stripped in the
   * transport (CR NUL, RFC 854); this is the half that survived because both
   * of its bytes are printable to the dispatcher. Only an LF that FOLLOWS a
   * CR is dropped - a lone LF is still a RETURN, which is what a Unix client
   * sends.
   */
  return Array.from(input.replace(/\r\n/g, '\r'));
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
 * Is this key part of a ZMODEM goodbye still arriving after the board's end
 * of the transfer exited?
 *
 * A caller's program closes with a ZFIN hex header - `**`, CAN, `B`, fourteen
 * hex digits, CR LF and XON - and `OO`. Those went to the menu as commands
 * ("No such command!!", 2026-09-27). Dropping EVERYTHING for a while after a
 * transfer was too blunt: the upload's description prompt appears inside that
 * while, and a quick caller's description vanished. So only the goodbye's own
 * shape is dropped, tracked across keys because a header arrives a key at a
 * time.
 */
export function isProtocolTail(
  session: { transferTail?: { can: boolean; hex: number; eol: number; header?: boolean } },
  piece: string,
): boolean {
  const tail = (session.transferTail ??= { can: false, hex: 0, eol: 0 });
  if (tail.hex > 0 && /^[0-9a-fA-F]$/.test(piece)) {
    tail.hex -= 1;
    if (tail.hex === 0) { tail.eol = 3; tail.header = true; }   // CR LF XON after it
    return true;
  }
  tail.hex = 0;
  if (tail.eol > 0 && (piece === '\r' || piece === '\n' || piece === '\x11' || piece === '\x8a')) {
    tail.eol -= 1;
    return true;
  }
  tail.eol = 0;
  if (piece === '\x18') { tail.can = true; return true; }
  if (piece === 'B' && tail.can) { tail.can = false; tail.hex = 14; return true; }
  tail.can = false;
  // `OO` closes the session - but only once a header has shown this IS a
  // goodbye; an O typed in the window is a caller's O.
  return piece === '*' || piece === '\x11' || piece === '\x13' || (piece === 'O' && !!tail.header);
}

/**
 * How long one keystroke may hold the next one back. See dispatchInOrder.
 */
export const KEY_ORDER_WAIT_MS = 2000;

/**
 * Hand a session's keystrokes to the board ONE AFTER ANOTHER, in the order
 * they arrived.
 *
 * Both transports called handleCommand once per piece without waiting, so
 * the pieces of one packet ran as concurrent async handlers and could land
 * out of order: a client that sends `sysop\r` in one write had the board look
 * up `syso` or `sop` - the RETURN was taken before the last letter was
 * stored (found by the telnet regression suite, 2026-09-27). A human rarely
 * types that fast; a paste, a script or a slow line bunching keys always can.
 *
 * Each piece waits for the one before it, across packets too - but for
 * KEY_ORDER_WAIT_MS at most. Some handlers legitimately run for minutes (a
 * command that launches a door and waits for it to exit), and the keys typed
 * meanwhile must still arrive; ordering is only owed to keys that arrive while
 * the board is still taking the previous one in.
 */
export function dispatchInOrder(
  session: { keyChain?: Promise<void>; keyBusy?: boolean; transferDrainUntil?: number; transferTail?: { can: boolean; hex: number; eol: number } } | null | undefined,
  pieces: string[],
  handle: (piece: string) => Promise<unknown>,
  onError: (error: unknown) => void,
): void {
  // A transfer just ended: what looks like its protocol's goodbye is dropped,
  // anything else is typing and goes through. See endRawTransfer.
  if (session?.transferDrainUntil && Date.now() < session.transferDrainUntil) {
    pieces = pieces.filter((piece) => !isProtocolTail(session, piece));
    if (pieces.length === 0) return;
  }
  if (!session) {
    for (const piece of pieces) handle(piece).catch(onError);
    return;
  }
  const take = (piece: string): Promise<void> => {
    const run = handle(piece).catch(onError);
    const cap = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, KEY_ORDER_WAIT_MS);
      (timer as { unref?: () => void }).unref?.();
    });
    return Promise.race([run.then(() => undefined), cap]);
  };
  for (const piece of pieces) {
    const holder = session as { keyChain?: Promise<void>; keyBusy?: boolean; inputWaiter?: unknown };
    if (holder.keyBusy && holder.inputWaiter) {
      // The key in flight is WAITING FOR THIS ONE: a procedure ported from
      // express.e is parked on lineInput / readChar / yesNo
      // (utils/await-input). Queued behind it, the answer would sit out
      // KEY_ORDER_WAIT_MS first - or, one key at a time, never reach it.
      handle(piece).catch(onError);
      continue;
    }
    if (!holder.keyBusy) {
      // Nothing in flight: the key goes to the board NOW, as it always did.
      holder.keyBusy = true;
      holder.keyChain = take(piece);
    } else {
      holder.keyChain = (holder.keyChain ?? Promise.resolve()).then(() => take(piece));
    }
    const mine = holder.keyChain;
    void mine.then(() => {
      if (holder.keyChain === mine) holder.keyBusy = false;
    });
  }
}

/**
 * What the BBS command handler should be given, in order - possibly nothing.
 *
 * Phase two: called only after the transport's own door routing has declined
 * the keystroke.
 */
export function commandPieces(input: string, subState?: unknown): string[] {
  if (isStrayMouseReport(input)) return [];
  // The operator chat takes a pasted run whole - see chatTakesTheWholeChunk.
  // Here, not at each caller: web asked it and telnet did not, so a telnet
  // caller's paste still trickled in a key at a time (web-vs-telnet audit
  // item 7, 2026-09-28).
  if (chatTakesTheWholeChunk(subState, input)) return [input];
  return splitInputForDispatch(normaliseCursorKeys(input));
}

/**
 * A command that threw - one handler for every transport. The server log
 * carries it; the caller is shown nothing. express.e has no text for this:
 * its commands return a result code to the command loop and never print a
 * generic failure, so `[ERROR] Command processing failed` (which web used to
 * print, and web-vs-telnet audit item 9 spread to telnet and SSH) was the
 * port's own invention (invented-text audit 2026-10-04, top-10 item 9).
 *
 * And the caller is put back at the menu prompt, as a finished command puts
 * him (command.handler returnToMenuAfterThrow, express.e:28641-28648). Only
 * logging it left a logged-on caller with no prompt and nothing to answer.
 */
export function commandFailed(
  emitter: { emit: (event: string, ...args: any[]) => unknown },
  session?: BBSSession,
): (error: unknown) => void {
  return (error: unknown) => {
    console.error('[COMMAND ERROR] Unhandled error in handleCommand:', error);
    if (!session) return;
    try {
      // Lazily: command.handler is the whole board, and this module is
      // required by every transport before it is.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { returnToMenuAfterThrow } = require('../handlers/command.handler') as typeof import('../handlers/command.handler');
      returnToMenuAfterThrow(emitter, session);
    } catch (err) {
      console.error('[COMMAND ERROR] Could not return the caller to the menu:', err);
    }
  };
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

/**
 * Accumulate what arrived into a pause buffer, KEY BY KEY, and say what to echo.
 *
 * A telnet client sends RETURN as CR LF in one packet, and often the letter
 * before it too: `n\r\n`. This compared the whole packet with `\r`, so the
 * RETURN was stored as two typed characters and the prompt never submitted -
 * a caller answering `n` at the logon scan's `(Pause)...More(y/n/ns)?` was
 * stuck there for good, Enter, Ctrl-C and all (relayed by the sysop,
 * 2026-10-02). The packet is split the way every other prompt's input is
 * (splitInputForDispatch, which also makes CR LF one RETURN), and the first
 * RETURN submits; keys after it in the same packet are dropped, as the prompt
 * they would answer does not exist yet.
 */
function accumulatePause(session: BBSSession, which: PauseKind, data: string): InputDecision {
  const state = session as unknown as PauseState;
  const bufferField = BUFFER_FIELD[which];
  if (state[bufferField] === undefined) state[bufferField] = '';
  const handler = state[HANDLER_FIELD[which]] as (line: string) => void;
  let echo = '';

  for (const key of splitInputForDispatch(data)) {
    /**
     * SPACE on an EMPTY buffer submits, exactly as RETURN does.
     *
     * The sysop, 2026-09-07: "Some BBS prompts are not dismissable with
     * SPACE." Both pause prompts read a LINE, so a space used to be typed
     * into the buffer and nothing happened until the caller also pressed
     * RETURN - and a space is what every pager on every other system takes
     * for "next page". Both handlers already read an empty line as "more",
     * so this submits the same empty line RETURN submits.
     *
     * Only on an empty buffer. `NS`, and a filename with a space in it, are
     * still lines a caller can type at these prompts.
     */
    if (key === ' ' && state[bufferField] === '') {
      return { kind: 'pause', which, handler, line: '', echo: echo || null };
    }
    if (key === '\r' || key === '\n') {
      const line = state[bufferField] as string;
      // Cleared BEFORE the handler runs: the handler may register the next
      // prompt, and it must start from an empty buffer.
      state[bufferField] = '';
      return { kind: 'pause', which, handler, line, echo: echo || null };
    }
    if (key === '\x7f' || key === '\b') {
      state[bufferField] = (state[bufferField] as string).slice(0, -1);
      echo += '\b \b';
      continue;
    }
    state[bufferField] = (state[bufferField] as string) + key;
    echo += key;
  }
  return { kind: 'pause', which, handler: null, line: null, echo: echo || null };
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
