/**
 * Collecting a LINE of input, the way express.e's lineInput() does.
 *
 * express.e reads prompts with `lineInput('','',len,INPUT_TIMEOUT,buf)`
 * (e.g. express.e:12599 for the flag prompt, express.e:20124 for the
 * download filename), which blocks until Enter and gives the caller the
 * whole line. The web port receives ONE KEYSTROKE per socket message, so
 * any prompt ported as "call the handler with whatever arrived" is not a
 * line prompt at all - it runs the handler once per character.
 *
 * That is not a subtle difference. The A command flagged a file per
 * keystroke: typing WOOF at its prompt left W, O, O and F flagged, saved to
 * Partdownload/flagged<slot>, and reprinted the prompt after every letter.
 *
 * The download filename prompt already had this right and this is its
 * logic, lifted so there is one copy rather than one per prompt.
 */
import { emitText, flushOutput } from './output.util';
import { LoggedOnSubState } from '../constants/bbs-states';

/**
 * THE LENGTH RULE, and the lengths themselves.
 *
 * express.e refuses the keystroke that would overflow a prompt's field:
 *
 *     ELSEIF (ch>31) AND (EstrLen(outputString)<maxLen)      express.e:2335
 *
 * Without it the echo runs past the right edge, the TERMINAL wraps the line,
 * and the `\b \b` sent to rub a character out cannot climb back over that
 * wrap - `\b` stops at column 0. Whatever landed on the first row can then
 * never be deleted, and is still in the buffer at Enter. The sysop, on the
 * live board 2026-09-13: "when i type in the ansi prompt, it wraps to the
 * next line and i cant backspace to delete on the first line".
 */
export const ANSI_PROMPT_MAX_LEN = 10;

export interface LineEdit {
  /** The buffer after the keystroke. */
  buffer: string;
  /** What to send to the caller's terminal - '' when the key is refused. */
  echo: string;
}

/**
 * A printable character, accepted only if the field has room for it.
 *
 * express.e:2335. A refused key echoes NOTHING: the caller sees the field
 * stop taking input, which is the same feedback a real Amiga gave. Sending
 * a bell here would be our invention, not express's.
 */
export function acceptTypedChar(buffer: string, ch: string, maxLen: number): LineEdit {
  const printable = ch.length === 1 && ch >= ' ' && ch <= '~';
  if (!printable || buffer.length >= maxLen) return { buffer, echo: '' };
  return { buffer: buffer + ch, echo: ch };
}

/**
 * Backspace over the last character, if there is one.
 *
 * express.e:2306 - `IF curpos>0`. An empty buffer ignores the key, which is
 * what stops a caller rubbing out the prompt itself.
 */
export function acceptBackspace(buffer: string): LineEdit {
  if (buffer.length === 0) return { buffer, echo: '' };
  // BS, space, BS: back over the character, paint a space on it, back again
  // (express.e:2307-2319 builds the same three-part string).
  return { buffer: buffer.slice(0, -1), echo: '\b \b' };
}

/**
 * The lengths express gives its prompts, with the line that says so.
 *
 * Each is `lineInput()`'s maxLen at that prompt. Where express's own
 * counterpart could not be identified - prompts this port added, like the
 * webhook URL - MAX_COMMAND_LINE is used: it is express's most permissive
 * length (28624), so it bounds the buffer without inventing a number.
 */
/** The menu command line. express.e:28624 - lineInput('','',255,...). */
export const MAX_COMMAND_LINE = 255;
/** Who a message is to. express.e:9817, and 10779 for a new message. */
export const MAX_MSG_TO = 30;
/** A message subject. express.e:9826, and 10847 for a new message. */
export const MAX_MSG_SUBJECT = 30;
/** A door's password prompt. express.e:4720 - lineInput('','',15,...). */
export const MAX_DOOR_PASSWORD = 15;

/** Enough of a session for line collection; keeps this usable from tests. */
export interface LineInputSession {
  inputBuffer?: string;
  /** Set by recordPromptColumn where the prompt is emitted. */
  promptColumn?: number;
  wireWidth?: number;
  screenWidth?: number;
  petsciiMode?: boolean;
}

export interface LineInputOptions {
  /**
   * The field's length, as express gives it to `lineInput()`.
   *
   * A key past it is refused and never echoed (express.e:2335). Omitted
   * means MAX_COMMAND_LINE - express's own most permissive length - so a
   * prompt registered without one is still bounded.
   */
  maxLen?: number;
  /**
   * Echo a line break when Enter is pressed.
   *
   * express.e's lineInput does this itself (see the note at
   * express.e:30376), so a caller that ports a prompt faithfully wants it;
   * one whose handler writes its own leading newline does not, or the
   * screen gains a blank line.
   */
  echoNewline?: boolean;
}

/**
 * Feed one keystroke into the session's line buffer.
 *
 * Returns true once a complete line has been handed to `onLine`, false
 * while the line is still being typed. Either way the keystroke has been
 * dealt with - printable characters are echoed, backspace erases - so the
 * caller should return rather than route the byte anywhere else.
 */
export async function collectLine(
  socket: any,
  session: LineInputSession,
  data: string,
  onLine: (line: string) => Promise<void> | void,
  options: LineInputOptions = {}
): Promise<boolean> {
  if (!session.inputBuffer) {
    session.inputBuffer = '';
  }

  if (data === '\r' || data === '\n') {
    const line = session.inputBuffer || '';
    session.inputBuffer = '';
    if (options.echoNewline) {
      emitText(socket, '\r\n');
    }
    // express.e's lineInput has put every echoed character on the wire before
    // it returns. emitText is 16ms-buffered and most prompt handlers answer
    // with a direct socket.emit, so without this the answer can overtake the
    // echo of what was typed and the line appears AFTER the reply to it.
    flushOutput(socket);
    await onLine(line);
    return true;
  }

  if (data === '\x7f' || data === '\b') {
    const had = session.inputBuffer;
    const edit = acceptBackspace(had);
    session.inputBuffer = edit.buffer;
    // Wrap-aware: a prompt plus its answer can pass the right edge, and
    // `\b` cannot climb back over the wrap (see backspaceEcho).
    if (edit.echo) emitText(socket, backspaceEcho(had, edit.buffer, session as any));
    return false;
  }

  // Printable ASCII only - control bytes must not become part of a filename,
  // and echoing them would move the cursor off the prompt line - and only
  // while the field has room, so the line cannot reach the wrap that
  // backspace is unable to climb back over.
  {
    const edit = acceptTypedChar(
      session.inputBuffer, data, options.maxLen ?? MAX_COMMAND_LINE,
    );
    session.inputBuffer = edit.buffer;
    if (edit.echo) emitText(socket, edit.echo);
  }

  return false;
}

/**
 * The prompts express.e reads with `lineInput()`.
 *
 * WHY A TABLE AND NOT A HABIT. `handleCommand` dispatches on `subState`, and
 * every prompt's branch decides for itself how much input it consumes. A
 * branch written as `handler(socket, session, data.trim())` looks like a line
 * prompt and is not one: the transport delivers ONE KEYSTROKE per call
 * (server/socket-handlers.ts:818 iterates the string character by character),
 * so the handler runs on the first key pressed and the prompt is gone.
 *
 * That is the sysop's 2026-09-06 report, "z takes a hotkey instead of a
 * string": at the Z prompt his `C` became the whole search string, his `H`
 * became the whole directory span, and `ASE` was then typed at the menu. The
 * Z command only started reaching this code that day - 6c021d85e made a door
 * refused for width fall through to the internal command - but the branch had
 * been a per-keystroke branch all along.
 *
 * Registering a sub-state here is the ONE declaration needed. `handleCommand`
 * consults this table before any branch runs, buffers the keystrokes itself,
 * and calls the branch once with the completed line - so a prompt cannot lose
 * its line-ness by being written in the shorter shape.
 *
 * Membership rule: the sub-state answers a prompt express.e reads with
 * `lineInput()`. A `readChar()` / `yesNo()` prompt - one key, no Enter - must
 * NOT be listed, or the caller would have to press Return after Y.
 *
 */
export const LINE_PROMPT_SUBSTATES: ReadonlyMap<string, LineInputOptions> = new Map<string, LineInputOptions>([
  // express.e:26151 - lineInput('','',78,...) "Enter string to search for: ".
  // lineInput's break here; handleSearchInput prints 26154's own after it.
  [LoggedOnSubState.ZIPPY_SEARCH_INPUT, { maxLen: 78, echoNewline: true }],
  // express.e:26869 - lineInput('','',8,...) inside getDirSpan(). Answers are
  // spans ("1-3"), not single keys, and handleDirSpanInput emits its own
  // newline on both the cancel and the search path.
  [LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT, { maxLen: 8 }],
  // The same getDirSpan prompt, asked by a bare F (express.e:27647).
  [LoggedOnSubState.FILE_LIST_DIR_INPUT, { maxLen: 8 }],
  // express.e:20414 - lineInput('','',40,...) "Enter filename of file to view?"
  // lineInput's own line break (2378) ends every answer; handleFilenameInput
  // adds express.e:20418's second one when the line is empty.
  [LoggedOnSubState.VIEW_FILE_INPUT, { maxLen: 40, echoNewline: true }],
  // express.e:17666 - lineInput('','',100,...) "FileName n: " in the batch
  // upload. The branch took whatever one keystroke arrived as the whole name,
  // so a telnet caller naming RG136005.BIN uploaded a file called R (found by
  // the telnet regression suite, 2026-09-27). The branch emits its own
  // newlines - the blank line's and the description block's.
  [LoggedOnSubState.UPLOAD_FILENAME_INPUT, { maxLen: 100 }],
  // express.e:25225 JM's 'Message Base Number (1-n): ', 25300 NM's 'Which to
  // change <Q>=QUIT ? ' and 24489 CL's 'Which node to view? ' are lineInput
  // calls (5, 2 and 5 characters). Each took the first key as the whole
  // answer, so node 12 or base 10 could not be typed. The handlers print
  // lineInput's line break themselves.
  [LoggedOnSubState.JM_INPUT, { maxLen: 5 }],
  [LoggedOnSubState.NM_INPUT, { maxLen: 2 }],
  [LoggedOnSubState.CALLERSLOG_NODE_INPUT, { maxLen: 5 }],
  // express.e:25425 OLM's 'OLM to Which Node? ...' - two characters; the
  // next text (25429, 25438, or the menu's) follows lineInput's break.
  [LoggedOnSubState.OLM_NODE_INPUT, { maxLen: 2, echoNewline: true }],
  // express.e:25145 J's 'Conference Number (1-n): ' - five characters.
  [LoggedOnSubState.JOIN_CONF_INPUT, { maxLen: 5, echoNewline: true }],
]);

/**
 * The visible width of already-rendered prompt text.
 *
 * Colour is not width. The menu prompt is mostly SGR - `[0m[35m...` - and
 * counting those bytes would put the input start tens of columns to the
 * right of where the caller's cursor actually is.
 */
export function visibleColumns(text: string): number {
  // ONLY THE LAST LINE. A newline puts the cursor back at column 0, so the
  // rows above it say nothing about where the cursor ends up - and the
  // board's prompts are routinely multi-line: the connect question prints
  // "COMMODORE 64: PRESS <DEL>" on its own row first. Counting every row
  // measured that prompt at 101 columns instead of the 78 on its last, put
  // the input start 17 columns left of the truth, and the wrap went
  // undetected - the sysop, twice: "it gets stuck at the left edge",
  // "still doesnt climb up to the previous row".
  const lastLine = text.slice(text.lastIndexOf('\n') + 1);
  return lastLine
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\r/g, '')
    .length;
}

/** Where an edited line stands: the text, and the cursor inside it. */
export interface LineState {
  text: string;
  curpos: number;
}

/**
 * WEB_ DEVIATION, on the sysop's instruction 2026-09-13 ("yes make climb the
 * wrap"). express does not do this and cannot: `lineInput` rubs a character
 * out with BS-space-BS (express.e:2307-2319), which stops dead at column 0,
 * so on a real Amiga a wrapped line's first row was simply unreachable. The
 * menu command line takes 255 characters (express.e:28624) and an 80-column
 * terminal wraps at 80, so express's own answer leaves the caller stuck.
 *
 * Instead of stepping the cursor, this REDRAWS the line from where it began:
 * up to the prompt's row, across to the column the input starts at, clear to
 * the end of the screen, write the text again, then put the cursor where the
 * edit left it. Crossing a row boundary is then not a special case - the
 * cursor is positioned absolutely rather than walked backwards - so the same
 * path serves a delete in the middle of a wrapped line.
 *
 * Returns '' when the line does not wrap, and the caller keeps its cheap
 * BS-space-BS: one wrapped line is no reason to make every keystroke on the
 * board repaint a row (RULES.md, doors draw smart).
 */
export function rewrapEcho(
  before: LineState,
  after: LineState,
  startCol: number,
  width: number,
): string {
  if (!Number.isFinite(width) || width < 2) return '';
  const wrapped = (startCol + before.text.length) >= width
    || (startCol + after.text.length) >= width;
  if (!wrapped) return '';

  const rowOf = (n: number): number => Math.floor((startCol + n) / width);
  const colOf = (n: number): number => ((startCol + n) % width) + 1;

  let out = '';
  // 1. Up from wherever the cursor was, to the row the input starts on.
  const upFromCursor = rowOf(before.curpos);
  if (upFromCursor > 0) out += `\x1b[${upFromCursor}A`;
  // 2. Across to the column the input starts at, and wipe everything after
  //    it - including the rows below, which is what a shorter line leaves.
  out += `\x1b[${startCol + 1}G\x1b[0J`;
  // 3. The line as it now reads.
  out += after.text;
  // 4. Back up to where the edit left the cursor. After writing the text the
  //    cursor sits at its end; a cursor at the very end needs no move, and
  //    the column move is absolute so it is safe on either row.
  const rowsAtEnd = rowOf(after.text.length);
  const rowsAtCursor = rowOf(after.curpos);
  if (rowsAtEnd > rowsAtCursor) out += `\x1b[${rowsAtEnd - rowsAtCursor}A`;
  out += `\x1b[${colOf(after.curpos)}G`;
  return out;
}

/**
 * The caller's REAL terminal width, for anything that must not wrap.
 *
 * `screenWidth` is the board's column MODEL - reset to 80 for an ANSI
 * caller at the graphics prompt - while `wireWidth` is what NAWS or the PTY
 * actually reported. foldForWire (utils/wrap-for-session.util.ts) makes the
 * same distinction for the same reason: conflating them made the fold read
 * 80 for a terminal that had said 200.
 */
export function wireColumns(
  session: { wireWidth?: number; screenWidth?: number } | null | undefined,
): number {
  const reported = session?.wireWidth ?? session?.screenWidth;
  return typeof reported === 'number' && reported >= 20 ? Math.floor(reported) : 80;
}

/**
 * Remember what column a prompt leaves the cursor in.
 *
 * Anything that wants to redraw a wrapped line needs to know where the
 * input STARTS, and that is the prompt's visible width - colour excluded.
 * Recorded where the prompt is emitted, because nothing downstream can
 * recover it. A prompt wider than the terminal has wrapped itself, so only
 * the part on the last row counts.
 *
 * Returns the text unchanged, so a call site can wrap its emit in place.
 */
/** DECSC. Emit straight after a prompt, as its own write. */
export const SAVE_CURSOR = '\x1b7';

export function recordPromptColumn<T extends string>(
  session: {
    wireWidth?: number; screenWidth?: number; promptColumn?: number;
    promptCursorSaved?: boolean;
  } | null | undefined,
  text: T,
): T {
  if (session) {
    session.promptColumn = visibleColumns(text) % wireColumns(session);
    // This prompt saved a cursor, so a redraw may restore it. A prompt
    // printed by a path that has not been converted sets nothing, and the
    // erase below stays the plain one - restoring a cursor saved by some
    // EARLIER prompt would clear from the wrong place entirely.
    session.promptCursorSaved = true;
  }
  /**
   * AND THE TERMINAL REMEMBERS IT FOR US.
   *
   * ESC 7 (DECSC) saves the cursor exactly where the input will begin. A
   * redraw can then restore it with ESC 8 and needs no column, no width
   * and no row arithmetic - which is the whole class of bug this feature
   * kept producing: measured against 80 while the caller's window was not
   * 80, it climbed a row that was never wrapped into and erased real text;
   * measured against a width reported before a resize, it did not climb at
   * all. The terminal always knows where its own cursor was.
   *
   * The board already uses this pair elsewhere (smiley-picker.util,
   * internode-chat.handler), so the sequence is known to work on every
   * terminal this board serves. The save lives only from printing the
   * prompt to the next keystroke.
   *
   * It is emitted SEPARATELY, never appended to the prompt text: those
   * bytes are pinned for express parity (tests/handlers/menu-prompt-width)
   * and budgeted to the column on a 40-column screen, and two extra bytes
   * inside them broke both.
   */
  return text;
}

/**
 * Backspace for a prompt that only ever types at the END of its line.
 *
 * The menu command line has a cursor that moves and does its own redraw;
 * every other prompt on the board appends and deletes at the end, so this
 * is all they need: the cheap BS-space-BS while the line fits on one row,
 * and a redraw once it has wrapped - because `\b` stops dead at column 0
 * and would otherwise strand the first row (the sysop, 2026-09-13).
 */
export function backspaceEcho(
  before: string,
  after: string,
  session: {
    wireWidth?: number; screenWidth?: number; promptColumn?: number;
    petsciiMode?: boolean; promptCursorSaved?: boolean;
  } | null | undefined,
): string {
  if (before === after) return '';
  // A PETSCII caller's terminal is not an ANSI one; it keeps the simple
  // erase it has always had.
  if (session?.petsciiMode === true) return '\b \b';
  // Only when THIS prompt saved a cursor to restore.
  if (session?.promptCursorSaved !== true) return '\b \b';
  return redrawFromSavedStart({ text: after, curpos: after.length });
}

/**
 * Redraw an edited line from where the prompt saved the cursor.
 *
 * ESC 8 puts the cursor back at the first column of the input - across any
 * number of wrapped rows, because the terminal recorded the real position
 * rather than a computed one. ESC[0J then clears everything after it,
 * including the rows below that a shortened line vacates.
 *
 * A cursor left mid-line is handled by restoring a second time and
 * reprinting only the characters before it: identical bytes, so nothing
 * changes on screen, and the cursor lands exactly where the edit left it
 * without a single cursor-movement escape.
 */
export function redrawFromSavedStart(after: LineState): string {
  let out = '\x1b8\x1b[0J' + after.text;
  if (after.curpos < after.text.length) {
    out += '\x1b8' + after.text.slice(0, after.curpos);
  }
  return out;
}
