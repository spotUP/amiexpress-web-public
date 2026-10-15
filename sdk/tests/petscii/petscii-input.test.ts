import { petsciiInputToAscii } from '../../petscii/petscii-input';

describe('petsciiInputToAscii', () => {
  it('letters: unshifted keys are lowercase, shifted keys are uppercase', () => {
    expect(petsciiInputToAscii([0x41, 0x42, 0xC3])).toBe('abC');
    expect(petsciiInputToAscii([0x61])).toBe('a');
  });
  it('RETURN, Shift+RETURN, DELETE, digits and punctuation', () => {
    expect(petsciiInputToAscii([0x0D, 0x8D, 0x14, 0x7F, 0x31, 0x21, 0x40, 0x5B, 0x5F])).toBe('\r\r\x7f\x7f1!@[_');
  });
  it('cursor keys become the ANSI arrow sequences blessed doors decode', () => {
    expect(petsciiInputToAscii([0x91])).toBe('\x1b[A');
    expect(petsciiInputToAscii([0x11])).toBe('\x1b[B');
    expect(petsciiInputToAscii([0x1D])).toBe('\x1b[C');
    expect(petsciiInputToAscii([0x9D])).toBe('\x1b[D');
    expect(petsciiInputToAscii([0x13])).toBe('\x1b[H');
    expect(petsciiInputToAscii([0x94])).toBe('\x1b[2~');
  });
  it('F1-F8 become the VT sequences client-door-bridge maps to F1-F8', () => {
    expect(petsciiInputToAscii([0x85, 0x89, 0x86, 0x8A])).toBe('\x1bOP\x1bOQ\x1bOR\x1bOS');
    expect(petsciiInputToAscii([0x87, 0x8B, 0x88, 0x8C])).toBe('\x1b[15~\x1b[17~\x1b[18~\x1b[19~');
  });
  it('LF, CLR and unknown control bytes are dropped', () => {
    /*
     * 0x03 IS NO LONGER ONE OF THEM. c753ef871 mapped RUN/STOP (Ctrl+C on the
     * web canvas) to ETX so a PETSCII caller can abort at all - before it, the
     * board's stop key could not be pressed in PETSCII mode and a caller could
     * not leave the operator chat. It is asserted on its own below; a byte the
     * board now acts on does not belong in a list of bytes with no meaning.
     */
    /*
     * NOR IS 0x05, NOR 0x12. A caller can pick a colour and turn reverse on
     * now - "we want full petscii input <3" (the sysop, 2026-09-22) - so the
     * pen becomes the board's own marker and RVS becomes a latch over the
     * cells after it. Both are asserted where they belong, in
     * `a-c64-caller-can-type-a-graphic.test.ts` and
     * `a-colour-a-caller-picked-reaches-every-terminal.test.ts`.
     *
     * What is left here is what genuinely has no input meaning: a line feed
     * a caller cannot type, and a screen clear the board owns.
     */
    expect(petsciiInputToAscii([0x0A, 0x93])).toBe('');
  });
  it('RUN/STOP is passed through as ETX, so a PETSCII caller can abort', () => {
    expect(petsciiInputToAscii([0x03])).toBe('\x03');
  });
  it('a mixed sequence including @ [ \\ ] ^ _ round-trips as one command string (moved from key-bytes-to-command.test.ts)', () => {
    // "cat@[h]" typed on the canvas: unshifted letters use keymap.ts's
    // ascii-lowercase -> $41-$5A mapping, i.e. the uppercase ASCII code.
    const letters = ['c', 'a', 't', 'h'].map((ch) => ch.toUpperCase().charCodeAt(0));
    const fullSequence = [letters[0], letters[1], letters[2], 0x40, 0x5b, letters[3], 0x5d]; // cat@[h]
    expect(petsciiInputToAscii(fullSequence)).toBe('cat@[h]');
  });
});
