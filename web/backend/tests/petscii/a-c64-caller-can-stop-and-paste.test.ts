/**
 * "ctrl+c and paste doesnt work at all in petscii mode" - the sysop,
 * 2026-09-13.
 *
 * Two different holes behind one report.
 *
 * CTRL+C: PetsciiCanvas hands every Ctrl/Cmd/Alt chord to the browser, so
 * copy and Cmd+R keep working - and the board's abort key went with them. A
 * caller in an operator chat or a door had no way to stop. It reaches the
 * board as $03 now, which is RUN/STOP: the same key, the same meaning, on a
 * real C64 - so the shared input table is where it belongs, and real C64
 * telnet callers get it too.
 *
 * PASTE: a <canvas> is not an editable element and pasted text does not
 * arrive as keystrokes, so nothing in the PETSCII surface ever saw one. The
 * canvas listens for the document's paste event now and turns the text into
 * the same bytes the keymap produces, so it takes the one input path.
 */
import { petsciiInputToAscii } from '../../../../sdk/petscii/petscii-input';
import { keyEventToPetscii, pastedTextToPetscii as pasteToPetscii } from '../../../../packages/terminal/src/petscii/keymap';

describe('stop', () => {
  it('RUN/STOP reaches the board as the abort byte', () => {
    // $03 is what the canvas sends for Ctrl+C and what a real C64 sends for
    // RUN/STOP. It used to fall through every branch and be dropped as "no
    // input meaning", so the board never saw an abort from a C64 caller.
    expect(petsciiInputToAscii([0x03])).toBe('\x03');
  });

  it('and still carries the keys around it', () => {
    expect(petsciiInputToAscii([0x41, 0x03, 0x42])).toBe('a\x03b');
  });
});

describe('paste', () => {
  it('arrives as the same bytes typing it would have produced', () => {
    const pasted = pasteToPetscii('hello');
    const typed = [...'hello'].flatMap((ch) => keyEventToPetscii(ch, false)!);
    expect(pasted).toEqual(typed);
    // And it reads back as what the caller pasted.
    expect(petsciiInputToAscii(pasted)).toBe('hello');
  });

  it('keeps upper and lower case apart, the way a C64 does', () => {
    // Unshifted is $41-$5A and shifted is $C1-$DA on this board's convention.
    expect(petsciiInputToAscii(pasteToPetscii('Up Rough'))).toBe('Up Rough');
  });

  it('turns a line break into RETURN, and CRLF into one', () => {
    expect(pasteToPetscii('a\r\nb')).toEqual([0x41, 0x0D, 0x42]);
    expect(pasteToPetscii('a\nb')).toEqual([0x41, 0x0D, 0x42]);
  });

  it('drops what a C64 keyboard could not have typed rather than sending rubbish', () => {
    // No emoji key on a C64. The rest of the line still arrives.
    expect(petsciiInputToAscii(pasteToPetscii('hi'))).toBe('hi');
  });
});
