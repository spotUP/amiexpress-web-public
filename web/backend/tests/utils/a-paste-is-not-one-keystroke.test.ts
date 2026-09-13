/**
 * "pasting to the bbs is very slow as well" - the sysop, 2026-09-13.
 *
 * It was not slow. The browser delivers a paste as ONE `command` event
 * carrying the whole clipboard, and every text-input consumer on this board
 * was written against a keyboard: chatAcceptsKeystroke refuses anything but a
 * single character, and both typing buffers tested `length === 1`. So a pasted
 * line failed every branch, was dropped without a word, and the caller retyped
 * it - which is what "slow" looked like from the chair.
 */
import { inputKeys } from '../../src/utils/input-chunks.util';

describe('what is inside one input event', () => {
  it('splits pasted text into the keys it would have been typed as', () => {
    expect(inputKeys('hello')).toEqual(['h', 'e', 'l', 'l', 'o']);
  });

  it('leaves a single keystroke exactly as it was', () => {
    expect(inputKeys('a')).toEqual(['a']);
    expect(inputKeys('')).toEqual(['']);
    expect(inputKeys('\r')).toEqual(['\r']);
  });

  it('never splits an escape sequence - F1 is one key, not five', () => {
    // \x1b[OP leaves the chat. Split, it is an ESC and "[OP" typed into the
    // message, and the caller can never get out.
    expect(inputKeys('\x1b[OP')).toEqual(['\x1b[OP']);
    expect(inputKeys('\x1b[D')).toEqual(['\x1b[D']);
  });

  it('leaves anything carrying a control byte whole', () => {
    // Door traffic, telnet negotiation and transfer payloads reach the same
    // boundary, and a byte of those is not a character anybody typed.
    expect(inputKeys('\x00\x01binary')).toEqual(['\x00\x01binary']);
    expect(inputKeys('ab\x03cd')).toEqual(['ab\x03cd']);
  });

  it('gives a multi-line paste its line breaks as their own keys', () => {
    // Each \r takes the Return branch, so a two-line paste sends two lines -
    // exactly what pressing return between them would have done.
    expect(inputKeys('one\rtwo')).toEqual(['o', 'n', 'e', '\r', 't', 'w', 'o']);
  });

  it('keeps the Latin-1 the chat already accepts', () => {
    // Swedish aao died in this chat once before; a paste must not lose it.
    expect(inputKeys('hej då')).toEqual(['h', 'e', 'j', ' ', 'd', 'å']);
  });
});
