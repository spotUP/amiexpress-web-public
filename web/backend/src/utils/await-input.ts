/**
 * express.e's input calls - lineInput, readChar, yesNo - as awaitable
 * functions, so a procedure ported from express.e reads like the source:
 *
 *   aePuts('[36mSubject[33m: ...')
 *   stat:=lineInput('',mailHeader.subject,30,INPUT_TIMEOUT,str)
 *
 * becomes
 *
 *   emitText(socket, '\x1b[36mSubject\x1b[33m: ...');
 *   const str = await lineInput(socket, session, 30, header.subject);
 *
 * The board receives one keystroke per handleCommand call. A waiting input
 * sits on the session, and handleCommand hands it every keystroke before any
 * sub-state branch runs (feedInputWaiter). The rest of the board's prompts are
 * sub-state driven and untouched; this is for ports of whole express.e
 * procedures, where a prompt is a line in the middle of the code.
 */
import { emitText, flushOutput } from './output.util';
import { acceptBackspace } from './line-input.util';

type Waiter =
  | { kind: 'line'; maxLen: number; buffer: string; resolve: (line: string) => void }
  | { kind: 'char'; resolve: (key: string) => void };

export interface InputWaitingSession {
  inputWaiter?: Waiter;
}

/** One key's escape sequence (CSI or SS3) - an arrow, a function key. */
function isKeySequence(data: string): boolean {
  return /^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Za-z])$/.test(data);
}

/**
 * lineInput('', defaultOutput, maxLen, ...) - express.e:2170-2381.
 *
 * The default is printed and is the line's starting text. A printable
 * Latin-1 character is taken and echoed while the field has room (2335),
 * backspace takes one back off (2306), and Enter returns the line after
 * lineInput's own line break: `IF ftpConn=FALSE THEN aePuts('\b\n')` (2378).
 */
export function lineInput(
  socket: any,
  session: InputWaitingSession,
  maxLen: number,
  defaultOutput = '',
): Promise<string> {
  const start = defaultOutput.slice(0, maxLen);
  if (start) emitText(socket, start);
  flushOutput(socket);
  return new Promise<string>((resolve) => {
    session.inputWaiter = { kind: 'line', maxLen, buffer: start, resolve };
  });
}

/** readChar(INPUT_TIMEOUT) - the next key, as it arrived. */
export function readChar(socket: any, session: InputWaitingSession): Promise<string> {
  flushOutput(socket);
  return new Promise<string>((resolve) => {
    session.inputWaiter = { kind: 'char', resolve };
  });
}

/**
 * yesNo(flag) - express.e yesNo. flag 1 prints `(Y/n)?` and Enter means yes,
 * flag 2 prints `(y/N)?` and Enter means no, flag 0 prints nothing and Enter
 * means nothing. Only Y, N and (flag 1/2) CR end it; it answers `Yes` or `No`.
 * LF is not Enter here - express.e removed it.
 */
export async function yesNo(socket: any, session: InputWaitingSession, flag: 0 | 1 | 2): Promise<boolean> {
  if (flag === 2) emitText(socket, '\x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)\x1b[32m?\x1b[0m ');
  else if (flag === 1) emitText(socket, '\x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m)\x1b[32m?\x1b[0m ');
  for (;;) {
    let ch = await readChar(socket, session);
    if (ch === '\r') {
      if (flag === 1) ch = 'y';
      if (flag === 2) ch = 'n';
    }
    if (ch === 'y' || ch === 'Y') {
      emitText(socket, 'Yes\r\n');
      return true;
    }
    if (ch === 'n' || ch === 'N') {
      emitText(socket, 'No\r\n');
      return false;
    }
  }
}

/**
 * Hand what the caller typed to the input that is waiting for it. Returns
 * false when nothing is waiting, and handleCommand carries on as before.
 */
export function feedInputWaiter(socket: any, session: InputWaitingSession, data: string): boolean {
  const waiter = session.inputWaiter;
  if (!waiter || data === '') return false;

  if (waiter.kind === 'char') {
    // A key's sequence is one key; anything longer is keys, the first counts.
    const key = isKeySequence(data) ? data : data[0];
    session.inputWaiter = undefined;
    waiter.resolve(key);
    return true;
  }

  if (isKeySequence(data)) return true;
  let echo = '';
  for (const key of data) {
    if (key === '\r' || key === '\n') {
      if (echo) emitText(socket, echo);
      emitText(socket, '\r\n');
      flushOutput(socket);
      session.inputWaiter = undefined;
      waiter.resolve(waiter.buffer);
      return true;
    }
    if (key === '\b' || key === '\x7f') {
      const edit = acceptBackspace(waiter.buffer);
      waiter.buffer = edit.buffer;
      echo += edit.echo;
      continue;
    }
    const code = key.charCodeAt(0);
    const printable = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
    if (printable && waiter.buffer.length < waiter.maxLen) {
      waiter.buffer += key;
      echo += key;
    }
  }
  if (echo) emitText(socket, echo);
  return true;
}
