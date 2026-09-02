/**
 * Final review wave, Finding 4 (Important): the PETSCII canvas's keyboard
 * path dropped @ [ \ ] ^ _ entirely.
 *
 * `petsciiKeyBytesToCommand` (packages/terminal/src/petscii/
 * key-bytes-to-command.ts, the inverse of keymap.ts's keyEventToPetscii)
 * translates the synthetic PETSCII bytes PetsciiCanvas's onKeyDown
 * produces back into the ASCII string the server's 'command' input path
 * understands. Its ASCII-passthrough ranges covered letters, digits and
 * $20-$3F punctuation, but skipped straight from $3F to $41 - the six
 * codepoints $40 and $5B-$5F (@ [ \ ] ^ _, PETSCII-identical to ASCII
 * here) fell through every branch and were silently dropped, so typing any
 * of them into the canvas produced nothing at all.
 *
 * Imported directly, mirroring petscii-keymap.test.ts's pattern for the
 * sibling keymap.ts module.
 */
import { petsciiKeyBytesToCommand } from '../../../../packages/terminal/src/petscii/key-bytes-to-command';

describe('petsciiKeyBytesToCommand', () => {
  it('Enter -> CR, Backspace ($14) -> DEL', () => {
    expect(petsciiKeyBytesToCommand([0x0d])).toBe('\r');
    expect(petsciiKeyBytesToCommand([0x14])).toBe('\x7f');
  });

  it('letters case-swap back to lowercase ASCII', () => {
    expect(petsciiKeyBytesToCommand([0x41])).toBe('a');
    expect(petsciiKeyBytesToCommand([0xc1])).toBe('A');
  });

  it('digits/punctuation in $20-$3F pass through unchanged', () => {
    expect(petsciiKeyBytesToCommand([0x30])).toBe('0'); // '0' is $30 in both encodings
    expect(petsciiKeyBytesToCommand([0x3f])).toBe('?');
  });

  it('@ [ \\ ] ^ _ pass through unchanged (Finding 4 - previously dropped)', () => {
    expect(petsciiKeyBytesToCommand([0x40])).toBe('@');
    expect(petsciiKeyBytesToCommand([0x5b])).toBe('[');
    expect(petsciiKeyBytesToCommand([0x5c])).toBe('\\');
    expect(petsciiKeyBytesToCommand([0x5d])).toBe(']');
    expect(petsciiKeyBytesToCommand([0x5e])).toBe('^');
    expect(petsciiKeyBytesToCommand([0x5f])).toBe('_');
  });

  it('a mixed sequence including the previously-dropped codepoints round-trips as one command string', () => {
    // "cat@[h]" typed on the canvas: unshifted letters use keymap.ts's
    // ascii-lowercase -> $41-$5A mapping, i.e. the uppercase ASCII code.
    const letters = ['c', 'a', 't', 'h'].map((ch) => ch.toUpperCase().charCodeAt(0));
    const fullSequence = [letters[0], letters[1], letters[2], 0x40, 0x5b, letters[3], 0x5d]; // cat@[h]
    expect(petsciiKeyBytesToCommand(fullSequence)).toBe('cat@[h]');
  });

  it('cursor keys, F-keys, and Home/Clear are still dropped (documented limitation, not a regression)', () => {
    expect(petsciiKeyBytesToCommand([0x11, 0x91, 0x1d, 0x9d])).toBe('');
    expect(petsciiKeyBytesToCommand([0x85, 0x86])).toBe('');
    expect(petsciiKeyBytesToCommand([0x13, 0x93])).toBe('');
  });
});
