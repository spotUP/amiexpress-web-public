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
} from '../../src/utils/line-input.util';

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

/**
 * The same rule, through the routine most prompts actually use.
 *
 * collectLine() is this port's lineInput: LINE_PROMPT_SUBSTATES registers a
 * prompt and collectLine buffers its keystrokes. It had no length at all, so
 * every prompt that goes through it could run past the edge.
 */
describe('collectLine stops at the field length', () => {
  const { collectLine, MAX_COMMAND_LINE } = require('../../src/utils/line-input.util');

  function socketSpy(): { socket: any } {
    const socket: any = { emit: () => {}, on() { return this; } };
    return { socket };
  }

  it('refuses past the length the prompt declares, and echoes nothing', async () => {
    const { socket } = socketSpy();
    const session: any = { inputBuffer: '' };
    let line: string | null = null;

    for (const ch of 'ABCDEFGHIJKL') {
      await collectLine(socket, session, ch, (l: string) => { line = l; }, { maxLen: 8 });
    }
    // The BUFFER is what this level can prove: emitText routes through the
    // output buffer, which needs a registered session to reach a socket, and
    // faking that here would be testing the fake. What the caller SEES is
    // pinned directly on acceptTypedChar/acceptBackspace above.
    expect(session.inputBuffer).toBe('ABCDEFGH');

    await collectLine(socket, session, '\r', (l: string) => { line = l; }, { maxLen: 8 });
    // What the handler receives is what the caller could see and edit -
    // nothing arrives that backspace could not have removed.
    expect(line).toBe('ABCDEFGH');
  });

  it('bounds a prompt that declares no length, rather than letting it run', async () => {
    const { socket } = socketSpy();
    const session: any = { inputBuffer: '' };
    for (let i = 0; i < MAX_COMMAND_LINE + 50; i++) {
      await collectLine(socket, session, 'x', () => {});
    }
    expect(session.inputBuffer.length).toBe(MAX_COMMAND_LINE);
  });

  it('still backspaces what it accepted', async () => {
    const { socket } = socketSpy();
    const session: any = { inputBuffer: '' };
    for (const ch of 'ABC') await collectLine(socket, session, ch, () => {}, { maxLen: 8 });
    for (let i = 0; i < 3; i++) await collectLine(socket, session, '\b', () => {}, { maxLen: 8 });
    expect(session.inputBuffer).toBe('');
  });
});
