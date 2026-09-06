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

/** Enough of a session for line collection; keeps this usable from tests. */
export interface LineInputSession {
  inputBuffer?: string;
}

export interface LineInputOptions {
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
    if (session.inputBuffer.length > 0) {
      session.inputBuffer = session.inputBuffer.slice(0, -1);
      emitText(socket, '\b \b');
    }
    return false;
  }

  // Printable ASCII only: control bytes must not become part of a filename,
  // and echoing them would move the cursor off the prompt line.
  if (data.length === 1 && data >= ' ' && data <= '~') {
    session.inputBuffer += data;
    emitText(socket, data);
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
 * Not listed, deliberately: FILE_LIST_DIR_INPUT. It has the same shape and
 * the same fault, but nothing in the tree assigns it, so there is no path
 * that could prove an entry for it right. Give it a setter and add it here in
 * the same change.
 */
export const LINE_PROMPT_SUBSTATES: ReadonlyMap<string, LineInputOptions> = new Map<string, LineInputOptions>([
  // express.e:26151 - lineInput('','',78,...) "Enter string to search for: ".
  // echoNewline is off: handleSearchInput emits express.e:26154's own \b\n.
  [LoggedOnSubState.ZIPPY_SEARCH_INPUT, {}],
  // express.e:26869 - lineInput('','',8,...) inside getDirSpan(). Answers are
  // spans ("1-3"), not single keys, and handleDirSpanInput emits its own
  // newline on both the cancel and the search path.
  [LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT, {}],
  // express.e:20414 - lineInput('','',40,...) "Enter filename of file to view?"
  // handleFilenameInput emits express.e:20418's newline when the line is empty.
  [LoggedOnSubState.VIEW_FILE_INPUT, {}],
]);
