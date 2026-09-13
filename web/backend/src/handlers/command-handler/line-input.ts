/**
 * The board's line-editing rules, in one place.
 *
 * express.e has ONE input routine - `lineInput()` at 2170 - and every prompt
 * calls it with the length that prompt allows: 10 for the graphics question
 * (29530), 15 for a door password (4720), 3, 14, 30, 40, 50, 80, 250
 * elsewhere. This port has twenty hand-rolled copies of that loop instead,
 * and not one of them carries a length.
 *
 * That is the bug the sysop hit on 2026-09-13: "when i type in the ansi
 * prompt, it wraps to the next line and i cant backspace to delete on the
 * first line". With no limit the echo runs past the right edge, the TERMINAL
 * wraps it, and the `\b \b` we send to rub a character out cannot climb back
 * over that wrap - `\b` stops dead at column 0. Everything on the first line
 * is then unreachable: it cannot be deleted, and it is still in the buffer
 * when Enter is pressed.
 *
 * express never has the problem because it refuses the keystroke that would
 * overflow the field (2335: `ELSEIF (ch>31) AND (EstrLen(outputString)<maxLen)`).
 * A full field simply stops accepting, so the line cannot reach the edge.
 *
 * These two functions are that rule, and nothing else - no session, no
 * socket - so they can be tested directly and adopted by each prompt as it
 * is converted.
 */

/**
 * The graphics question at connect: `ANSI, RIP or No graphics (A/r/n)? `.
 * express.e:29530 - `lineInput('','',10,INPUT_TIMEOUT/2,tempStr,FALSE)`.
 * Ten is enough for every answer this board takes (A, R, N, Q, P, P8, T)
 * with room to fumble, and far short of the wrap.
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
