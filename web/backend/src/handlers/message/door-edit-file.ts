/**
 * JH_EF - a door asks the board to edit a text file with the board's own
 * message editor (express.e:3477-3485, and 1145-1154 for the XIM trap):
 *
 *   fileattach:=FALSE
 *   loadMsg(msg.string)
 *   IF(edit()=RESULT_SUCCESS)
 *     saveMsg(msg.string); msg.data:=1
 *   ELSE
 *     msg.data:=-1
 *   ENDIF
 *
 * The door is paused waiting for its reply; it lends the terminal to the line
 * editor (session.doorLentTerminal routes every key to the board) and gets it
 * back when the caller saves (S) or aborts (A, Y).
 *
 * Deviation: edit() would offer the full-screen editor first. FULLEDIT is a
 * door of its own, and a door run from inside a paused door would take over
 * the paused door's input handler and exit state - so a door's edit is the
 * line editor.
 */
import type { BBSSession } from '../../index';
import * as amigafs from '../../utils/amigafs';
import { flushOutput } from '../../utils/output.util';
import { promptForMessageBody } from './message-entry.handler';

/**
 * loadMsg (express.e:9969-9996): one line per LF, every CR removed, trailing
 * empty lines dropped - but never the first line. A missing file is an empty
 * buffer.
 */
export function loadMsgLines(text: string | null): string[] {
  if (text === null) return [];
  const lines = text.split('\n').map((line) => line.replace(/\r/g, ''));
  // ReadStr at end of file with nothing read is not a line.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * saveMsg (express.e:9952-9967): each line through fileWriteLn, which ends it
 * with LF. No lines, no write - the file is left as it was.
 */
export function saveMsgText(lines: string[]): string | null {
  if (lines.length === 0) return null;
  return lines.map((line) => `${line}\n`).join('');
}

/** Run edit() on `hostPath` for a door. Resolves true when the caller saved. */
export function editFileForDoor(socket: any, session: BBSSession, hostPath: string): Promise<boolean> {
  let text: string | null = null;
  try {
    text = (amigafs.readFileSync(hostPath) as Buffer).toString('latin1');
  } catch {
    text = null;
  }
  const body = loadMsgLines(text);

  const doorSubState = session.subState;
  const doorTempData = session.tempData;

  return new Promise<boolean>((resolve) => {
    const finishOutside = async (saved: string[] | null): Promise<void> => {
      let ok = false;
      if (saved !== null) {
        const out = saveMsgText(saved);
        ok = true;
        if (out !== null) {
          try {
            amigafs.writeFileSync(hostPath, Buffer.from(out, 'latin1'));
          } catch (err) {
            console.error(`[JH_EF] could not save ${hostPath}:`, err);
          }
        }
      }
      session.subState = doorSubState;
      session.tempData = doorTempData;
      session.doorLentTerminal = false;
      // The editor's last words reach the caller before the door's next ones.
      flushOutput(socket);
      resolve(ok);
    };

    session.tempData = {
      messageEntry: {
        body,
        currentLine: body.length + 1,
        fileAttach: false,
        lineEditorOnly: true,
        finishOutside,
      },
    };
    session.doorLentTerminal = true;
    void promptForMessageBody(socket, session).then(() => flushOutput(socket));
  });
}
