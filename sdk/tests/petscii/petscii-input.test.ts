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
    expect(petsciiInputToAscii([0x0A, 0x93, 0x03, 0x05, 0x12])).toBe('');
  });
  it('a mixed sequence including @ [ \\ ] ^ _ round-trips as one command string (moved from key-bytes-to-command.test.ts)', () => {
    // "cat@[h]" typed on the canvas: unshifted letters use keymap.ts's
    // ascii-lowercase -> $41-$5A mapping, i.e. the uppercase ASCII code.
    const letters = ['c', 'a', 't', 'h'].map((ch) => ch.toUpperCase().charCodeAt(0));
    const fullSequence = [letters[0], letters[1], letters[2], 0x40, 0x5b, letters[3], 0x5d]; // cat@[h]
    expect(petsciiInputToAscii(fullSequence)).toBe('cat@[h]');
  });
});
