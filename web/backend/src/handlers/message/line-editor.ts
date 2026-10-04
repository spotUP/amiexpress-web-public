/**
 * express.e edit()'s key loop, 10166-10360, as one pure function.
 *
 * The line being typed is express's `space`, the cursor is its `x`. Each key
 * is one pass of the LOOP at `next2:`, and the statements below follow the
 * source in its order - including where express falls through from one test
 * to the next. What a pass prints is returned as `echo`; a pass that ends in
 * `JUMP brk` returns `brk`, and the caller does what `brk:` and `bEG_IN:` do
 * (store the line, count it, print the next ` N> ` with the carried text).
 *
 * Keys arrive here as express's own codes. The translation from what a
 * terminal sends lives in `editorKeyCodes`, below, and nowhere else.
 */

/** express.e axconsts.e:75-82. */
export const LEFTARROW = 2;
export const RIGHTARROW = 3;
export const CHAR_BACKSPACE = 8;
export const CHAR_TAB = 9;
export const CHAR_DELETE = 127;
/** The key edit() clears the line with (10195). */
export const CLEAR_LEFT = 30;

/** `[1D` / `[1C` - the cursor moves express writes (10220, 10287-10292). */
const LEFT = '\x1b[1D';
const RIGHT = '\x1b[1C';

export interface EditLine {
  /** express.e `space`. */
  space: string;
  /** express.e `x`. */
  x: number;
}

export interface EditKeyResult extends EditLine {
  /** What express sends for this key. */
  echo: string;
  /**
   * `JUMP brk`: 'blank' is Enter on an empty line (bkFlag:=1, 10178-10182),
   * 'line' stores `committed` and opens the next line with `space` in it.
   */
  brk?: 'blank' | 'line';
  committed?: string;
}

/**
 * One key through edit()'s loop. `c` is a key code; `maxLineLen` is edit()'s
 * parameter (75 on an eighty-column screen, messageBodyLineLimit elsewhere).
 *
 * `wordWrap` is C*Base's CTRL+W, which only a PETSCII caller can turn off
 * (message-entry.handler.ts). Off, a line past `maxLineLen` breaks where it
 * stands: express's own no-space branch (10330-10335), which is what C*Base
 * does with `wordwrap` clear (`ml0123.a65:2122`, `wrapit` skips the break).
 */
export function editKey(line: EditLine, c: number, maxLineLen: number, wordWrap = true): EditKeyResult {
  let space = line.space;
  let x = line.x;
  let echo = '';

  // express.e:10177-10189
  //   IF(c=13)
  //     IF(StrLen(space)=0) ... bkFlag:=1; JUMP brk
  //     msgBuf.setItem(lines,space); StrCopy(space,''); aePuts('\b\n'); x:=0; JUMP brk
  if (c === 13) {
    if (space.length === 0) return { space, x, echo, brk: 'blank' };
    return { space: '', x: 0, echo: '\r\n', brk: 'line', committed: space };
  }

  // express.e:10190-10200 - IF(c=30): `\b \b` once for every character LEFT
  // of the cursor, then the whole line is emptied. What stood right of the
  // cursor stays on the screen; express leaves it there too.
  if (c === CLEAR_LEFT) {
    while (x) {
      echo += '\b \b';
      x--;
    }
    return { space: '', x, echo };
  }

  // express.e:10201-10224 - IF(c=CHAR_BACKSPACE): the character before the
  // cursor goes, the tail is redrawn one left, a space blanks its old last
  // cell, and `[1D` walks back once for each cell from x to the old end.
  if (c === CHAR_BACKSPACE) {
    if (x > 0) {
      echo += '\b';
      x--;
      const tail = space.slice(x + 1);
      echo += tail + ' ' + LEFT.repeat(space.length - x);
      space = space.slice(0, x) + tail;
    }
    return { space, x, echo };
  }

  // express.e:10226-10240 - IF (c=CHAR_DELETE): the character AT the cursor.
  if (c === CHAR_DELETE) {
    if (x < space.length) {
      const tail = space.slice(x + 1);
      echo += tail + ' ' + LEFT.repeat(space.length - x);
      space = space.slice(0, x) + tail;
    }
    return { space, x, echo };
  }

  // express.e:10241-10283 - IF(c=CHAR_TAB). c becomes Mod(x,8) and is NOT
  // reset on the mid-line path, so the arrow tests below still see it: a
  // mid-line tab taken at x MOD 8 = 2 then also steps the cursor left, and
  // at 3 steps it right. That is express, kept.
  if (c === CHAR_TAB) {
    c = x % 8;
    if (x === space.length) {
      // 10244-10254: at the end of the line, only while the stop still
      // leaves three columns; otherwise the tab is dropped (c:=CHAR_TAB).
      if (x + (8 - c) > maxLineLen - 3) {
        c = CHAR_TAB;
      } else {
        while (c < 8) {
          echo += ' ';
          space += ' ';
          x++;
          c++;
        }
      }
    } else if (space.length + (7 - c) < maxLineLen) {
      // 10256-10278: the mid-line guard. 8-c spaces go in at the cursor,
      // are sent, and the tail is redrawn with `[1D` back to the cursor.
      const n = 8 - c;
      space = space.slice(0, x) + ' '.repeat(n) + space.slice(x);
      echo += ' '.repeat(n);
      x += n;
      echo += space.slice(x) + LEFT.repeat(space.length - x);
    } else {
      c = CHAR_TAB;
    }
  }

  // express.e:10284-10291
  if (c === LEFTARROW && x > 0) {
    x--;
    echo += LEFT;
  }
  if (c === RIGHTARROW && x < space.length) {
    x++;
    echo += RIGHT;
  }

  // express.e:10293 - IF(c<" ") THEN JUMP next2
  if (c < 32) return { space, x, echo };

  const ch = String.fromCharCode(c);
  if (x < space.length) {
    // express.e:10295-10312 - insert at the cursor, only while the line
    // is shorter than maxLineLen; a full line refuses the key silently.
    if (space.length < maxLineLen) {
      space = space.slice(0, x) + ch + space.slice(x);
      echo += ch;
      x++;
      echo += space.slice(x) + LEFT.repeat(space.length - x);
    }
  } else {
    // express.e:10313-10318 - append.
    x++;
    echo += ch;
    space += ch;
  }

  // express.e:10320-10357 - the word wrap. Past maxLineLen, look back for
  // the last space; the word after it moves to the next line.
  if (x > maxLineLen && !wordWrap) {
    return { space: '', x: 0, echo: echo + '\r\n', brk: 'line', committed: space };
  }
  if (x > maxLineLen) {
    let back = 0;
    let brkflag = false;
    for (let cn = x; cn >= 1; cn--) {
      if (space[cn - 1] === ' ') {
        back = x - cn;
        // SetStr(space,cn-1) only shortens the E-string; the characters
        // after it are still in the buffer and are read below.
        brkflag = true;
      }
      if (brkflag) {
        const kept = space.slice(0, cn - 1);
        if (back === 0) {
          // 10330-10335: the space was the last key - store the line
          // without it and start an empty one.
          return { space: '', x: 0, echo: echo + '\r\n', brk: 'line', committed: kept };
        }
        const carried = space.slice(x - back, x);
        // 10343-10350: `\b \b` for cn:=0 TO x - once more than the word is
        // long, which rubs out the space before it too.
        echo += '\b \b'.repeat(back + 1) + '\r\n';
        return { space: carried, x: back, echo, brk: 'line', committed: kept };
      }
    }
    // No space at all (10330-10335): the whole line is stored as it stands.
    return { space: '', x: 0, echo: echo + '\r\n', brk: 'line', committed: space };
  }

  return { space, x, echo };
}

/**
 * A PETSCII cell a caller drew, or the pen he drew it with (bank 0 refused:
 * the board runs one charset board-wide, sdk/petscii/board-rules.ts).
 */
function isPetsciiCell(code: number): boolean {
  return (code >= 0xe100 && code <= 0xe1ff) || (code >= 0xe200 && code <= 0xe20f);
}

/** One key's escape sequence (CSI or SS3). */
const KEY_SEQUENCE = /^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Za-z])/;

/**
 * TERMINAL TRANSLATION, NOT AN EDITOR DEVIATION.
 *
 * express.e's readChar hands edit() key codes, having already turned the
 * serial `ESC [ C` / `ESC [ D` into RIGHTARROW / LEFTARROW (express.e:7515-
 * 7530, with rawArrow set by edit() at 10164). This does the same for the
 * terminals this board serves, and is the one place it happens:
 *
 * - ESC[D / ESC OD -> LEFTARROW (2), ESC[C / ESC OC -> RIGHTARROW (3).
 * - ESC[3~, the Delete key -> CHAR_DELETE (127).
 * - 0x7F -> CHAR_BACKSPACE (8): xterm and a C64 (its DEL arrives as 0x7F,
 *   sdk/petscii/petscii-input.ts) send 0x7F for the Backspace key, where an
 *   Amiga terminal sent 8.
 * - LF -> 13: a lone LF is a Unix client's Return (terminal-input.ts
 *   already collapses CR LF to one CR).
 * - Every other key sequence (up, down, F-keys, Home, End) is dropped; each
 *   reaches express as codes below 32 and edit() drops those (10293).
 * - A character that is neither a byte nor a PETSCII cell is dropped: a
 *   message body is bytes.
 *
 * Everything else passes as its own code, one per character, so a pasted
 * run is typed a byte at a time exactly as express reads it.
 */
export function editorKeyCodes(data: string): number[] {
  const codes: number[] = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] === '\x1b') {
      const m = KEY_SEQUENCE.exec(data.slice(i));
      if (m) {
        const seq = m[0];
        if (seq === '\x1b[D' || seq === '\x1bOD') codes.push(LEFTARROW);
        else if (seq === '\x1b[C' || seq === '\x1bOC') codes.push(RIGHTARROW);
        else if (seq === '\x1b[3~') codes.push(CHAR_DELETE);
        i += seq.length;
        continue;
      }
    }
    const code = data.codePointAt(i) ?? 0;
    i += code > 0xffff ? 2 : 1;
    if (code === 0x7f) codes.push(CHAR_BACKSPACE);
    else if (code === 0x0a) codes.push(13);
    else if (code <= 0xff || isPetsciiCell(code)) codes.push(code);
  }
  return codes;
}
