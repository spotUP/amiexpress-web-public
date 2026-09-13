/**
 * A prompt stops accepting before the line can wrap.
 *
 * The sysop, on the live board, 2026-09-13: "when i type in the ansi prompt,
 * it wraps to the next line and i cant backspace to delete on the first
 * line" - the graphics question at connect, and he expected the same of
 * every prompt.
 *
 * The mechanism is not a rendering fault. Every character was echoed with no
 * limit, so the TERMINAL wrapped the line, and the `\b \b` sent to rub one
 * out cannot climb back over a wrap - `\b` stops at column 0. Whatever had
 * landed on the first row could not be deleted and was still in the buffer
 * when Enter was pressed.
 *
 * express never has this: `lineInput()` refuses the keystroke that would
 * overflow the field (express.e:2335), and the graphics prompt declares its
 * field as ten characters (express.e:29530).
 */

import {
  acceptTypedChar,
  acceptBackspace,
  ANSI_PROMPT_MAX_LEN,
} from '../../src/handlers/command-handler/line-input';

/** Type a whole string through the rule, as a caller's keystrokes. */
function type(start: string, keys: string, maxLen: number): { buffer: string; wire: string } {
  let buffer = start;
  let wire = '';
  for (const ch of keys) {
    const edit = acceptTypedChar(buffer, ch, maxLen);
    buffer = edit.buffer;
    wire += edit.echo;
  }
  return { buffer, wire };
}

describe('a prompt never runs past the edge', () => {
  it('takes the answers the graphics prompt is for', () => {
    for (const answer of ['A', 'R', 'N', 'Q', 'P', 'P8', 'T']) {
      const { buffer, wire } = type('', answer, ANSI_PROMPT_MAX_LEN);
      expect(buffer).toBe(answer);
      expect(wire).toBe(answer);
    }
  });

  it('stops accepting at the length express gives that prompt', () => {
    // express.e:29530 - lineInput('','',10,...)
    expect(ANSI_PROMPT_MAX_LEN).toBe(10);

    const { buffer, wire } = type('', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ANSI_PROMPT_MAX_LEN);
    expect(buffer).toBe('ABCDEFGHIJ');
    // And nothing past the tenth reached the terminal: an echoed character
    // the buffer refused is exactly how the line used to reach the wrap.
    expect(wire).toBe('ABCDEFGHIJ');
  });

  it('refuses silently, the way express does', () => {
    const full = 'A'.repeat(ANSI_PROMPT_MAX_LEN);
    const edit = acceptTypedChar(full, 'B', ANSI_PROMPT_MAX_LEN);
    expect(edit.buffer).toBe(full);
    // No bell, no message: express.e:2335 simply does not take the branch.
    // Anything else here would be our invention.
    expect(edit.echo).toBe('');
  });

  it('can always backspace what it accepted - the whole of it', () => {
    const typed = type('', 'ABCDEFGHIJKLMNOP', ANSI_PROMPT_MAX_LEN);
    let buffer = typed.buffer;
    expect(buffer).toBe('ABCDEFGHIJ');

    let rubs = 0;
    for (;;) {
      const edit = acceptBackspace(buffer);
      if (!edit.echo) break;
      expect(edit.echo).toBe('\b \b');
      buffer = edit.buffer;
      rubs++;
      if (rubs > 100) throw new Error('backspace never emptied the buffer');
    }

    // Every accepted character came back out. That is the property the bug
    // broke: the field held characters no keypress could remove.
    expect(buffer).toBe('');
    expect(rubs).toBe(ANSI_PROMPT_MAX_LEN);
  });

  it('ignores backspace on an empty field, so the prompt itself survives', () => {
    const edit = acceptBackspace('');
    expect(edit.buffer).toBe('');
    expect(edit.echo).toBe('');
  });

  it('takes no control characters into the buffer', () => {
    for (const ch of ['\x1b', '\x00', '\t', '\x7f']) {
      const edit = acceptTypedChar('AB', ch, ANSI_PROMPT_MAX_LEN);
      expect(edit.buffer).toBe('AB');
      expect(edit.echo).toBe('');
    }
  });
});
