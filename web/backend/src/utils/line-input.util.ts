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
import { emitText } from './output.util';

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
