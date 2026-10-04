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

type Waiter =
  | { kind: 'line'; maxLen: number; text: string; curpos: number; resolve: (line: string) => void }
  | { kind: 'char'; resolve: (key: string) => void };

/** lineInput's history (express.e addToHistory, 2150-2160): twenty lines, cycled. */
interface LineHistory {
  items: string[];
  num: number;
  cycle: number;
}

export interface InputWaitingSession {
  inputWaiter?: Waiter;
  lineHistory?: LineHistory;
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
  // 2202-2204: the default is copied whole and printed; the cursor after it.
  if (defaultOutput) emitText(socket, defaultOutput);
  flushOutput(socket);
  return new Promise<string>((resolve) => {
    session.inputWaiter = { kind: 'line', maxLen, text: defaultOutput, curpos: defaultOutput.length, resolve };
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
 * readChar(seconds) - the next key, or null when none came in time (E's
 * readChar returns 0 then). pGoodbye's countdown reads with readChar(1).
 */
export function readCharWithin(socket: any, session: InputWaitingSession, seconds: number): Promise<string | null> {
  flushOutput(socket);
  return new Promise<string | null>((resolve) => {
    const waiter: Waiter = {
      kind: 'char',
      resolve: (key: string) => {
        clearTimeout(timer);
        resolve(key);
      },
    };
    const timer = setTimeout(() => {
      if (session.inputWaiter === waiter) session.inputWaiter = undefined;
      resolve(null);
    }, seconds * 1000);
    session.inputWaiter = waiter;
  });
}

/** What yesNo(1) and yesNo(2) print before reading the key (express.e yesNo). */
export const YES_NO_PROMPT = {
  1: '\x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m)\x1b[32m?\x1b[0m ',
  2: '\x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)\x1b[32m?\x1b[0m ',
} as const;

/**
 * yesNo(flag) - express.e yesNo. flag 1 prints `(Y/n)?` and Enter means yes,
 * flag 2 prints `(y/N)?` and Enter means no, flag 0 prints nothing and Enter
 * means nothing. Only Y, N and (flag 1/2) CR end it; it answers `Yes` or `No`.
 * LF is not Enter here - express.e removed it.
 */
export async function yesNo(socket: any, session: InputWaitingSession, flag: 0 | 1 | 2): Promise<boolean> {
  if (flag === 2) emitText(socket, YES_NO_PROMPT[2]);
  else if (flag === 1) emitText(socket, YES_NO_PROMPT[1]);
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

  let echo = '';
  for (const key of lineKeys(data)) {
    if (key === 13) {
      if (echo) emitText(socket, echo);
      if (waiter.text.length > 0) addToHistory(session, waiter.text);
      emitText(socket, '\r\n'); // 2378
      flushOutput(socket);
      session.inputWaiter = undefined;
      waiter.resolve(waiter.text);
      return true;
    }
    echo += lineInputKey(session, waiter, key);
  }
  if (echo) emitText(socket, echo);
  return true;
}

type LineKey = number | 'left' | 'right' | 'up' | 'down';

/**
 * What arrived, as lineInput's keys. Terminal translation, not a deviation:
 * express.e's readChar turned the serial arrow sequences into its arrow
 * codes (7515-7530); xterm sends 0x7F for Backspace where an Amiga sent 8,
 * and ESC[3~ for Delete (127). Other sequences - F-keys, Home - are dropped.
 */
function lineKeys(data: string): LineKey[] {
  const keys: LineKey[] = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] === '\x1b') {
      const m = /^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Za-z])/.exec(data.slice(i));
      if (m) {
        const seq = m[0];
        const last = seq[seq.length - 1];
        if (last === 'D') keys.push('left');
        else if (last === 'C') keys.push('right');
        else if (last === 'A') keys.push('up');
        else if (last === 'B') keys.push('down');
        else if (seq === '\x1b[3~') keys.push(127);
        i += seq.length;
        continue;
      }
    }
    const code = data.charCodeAt(i++);
    if (code === 0x7f) keys.push(8);
    else if (code === 0x0a) keys.push(13);
    else if (code <= 0xff) keys.push(code);
  }
  return keys;
}

const RIGHT = '\x1b[1C';
const LEFT = '\x1b[1D';

/** The screen bytes that rub out the whole line from wherever the cursor is (2243-2251). */
function eraseLine(w: { text: string; curpos: number }): string {
  return RIGHT.repeat(w.text.length - w.curpos) + '\b \b'.repeat(w.text.length);
}

/** One key at a lineInput prompt - express.e 2242-2350, statement by statement. */
function lineInputKey(
  session: InputWaitingSession,
  w: { maxLen: number; text: string; curpos: number },
  key: LineKey,
): string {
  const history = session.lineHistory;
  if (key === 2) { // Ctrl-B clears the history (2229-2234)
    session.lineHistory = undefined;
    return '';
  }
  if (key === 24) { // Ctrl-X (2242-2254)
    const out = eraseLine(w);
    w.text = '';
    w.curpos = 0;
    return out;
  }
  if ((key === 'up' || key === 'down') && history && history.items.length > 0) {
    const out = eraseLine(w);
    w.text = history.items[history.cycle].slice(0, w.maxLen);
    if (key === 'up') {
      history.cycle -= 1;
      if (history.cycle < 0) history.cycle = history.items.length - 1;
    } else {
      history.cycle += 1;
      if (history.cycle >= history.items.length) history.cycle = 0;
    }
    w.curpos = w.text.length;
    return out + w.text;
  }
  if (key === 'left') {
    if (w.curpos > 0) {
      w.curpos -= 1;
      return LEFT;
    }
    return '';
  }
  if (key === 'right') {
    if (w.curpos < w.text.length) {
      w.curpos += 1;
      return RIGHT;
    }
    return '';
  }
  if (typeof key !== 'number') return '';
  if (key === 8) { // backspace (2305-2320)
    if (w.curpos === 0) return '';
    const oldLen = w.text.length;
    w.curpos -= 1;
    w.text = w.text.slice(0, w.curpos) + w.text.slice(w.curpos + 1);
    return '\b' + w.text.slice(w.curpos) + ' ' + LEFT.repeat(oldLen - w.curpos);
  }
  if (key === 127) { // delete (2321-2333)
    if (w.curpos >= w.text.length) return '';
    const oldLen = w.text.length;
    w.text = w.text.slice(0, w.curpos) + w.text.slice(w.curpos + 1);
    return w.text.slice(w.curpos) + ' ' + LEFT.repeat(oldLen - w.curpos);
  }
  if (key > 31 && w.text.length < w.maxLen) { // insert (2334-2350)
    const ch = String.fromCharCode(key);
    w.text = w.text.slice(0, w.curpos) + ch + w.text.slice(w.curpos);
    w.curpos += 1;
    const tail = w.text.slice(w.curpos);
    return ch + tail + LEFT.repeat(tail.length);
  }
  return '';
}

/** addToHistory (2150-2160). */
function addToHistory(session: InputWaitingSession, text: string): void {
  const h = session.lineHistory ?? (session.lineHistory = { items: [], num: 0, cycle: 0 });
  if (h.items.length < 20) {
    h.items.push(text);
    h.num = h.items.length - 1;
    h.cycle = h.num;
  } else {
    h.items[h.num] = text;
    h.cycle = h.num;
    h.num += 1;
    if (h.num >= h.items.length) h.num = 0;
  }
}
