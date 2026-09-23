/**
 * THE COMMODORE KEY, ON A KEYBOARD THAT HAS NO COMMODORE KEY.
 *
 * A C64 artist draws with C= and a letter. The web canvas had no such
 * chord - `PetsciiCanvas` handed every Ctrl/Cmd/Alt combination back to the
 * browser - so the one machine this board emulates could not type the
 * characters it is famous for ("we want full petscii input <3", the sysop,
 * 2026-09-22).
 *
 * Driven as one chain, keystroke to what the board reads, because that is
 * the only way to see that the two halves agree: the canvas's keymap and the
 * SDK's decode were written years apart.
 */
import { keyEventToPetscii, commodoreKeyToPetscii } from '../../../../packages/terminal/src/petscii/keymap';
import { petsciiInputToAscii, screenCodeGlyph } from '@amiexpress/bbs-door-sdk/petscii';

/** What the board reads when this key is pressed with the given modifiers. */
function typed(key: string, opts: { shift?: boolean; alt?: boolean; code?: string; swedish?: boolean } = {}): string {
  const bytes = keyEventToPetscii(key, !!opts.shift, !!opts.swedish, opts.code, !!opts.alt);
  return bytes ? petsciiInputToAscii(bytes, !!opts.swedish) : '';
}

describe('a caller drawing on the web canvas', () => {
  it('draws the four corners of a box with C= and the keys a C64 artist uses', () => {
    const corners: Array<[string, string, string]> = [
      ['a', 'KeyA', '┌'],
      ['s', 'KeyS', '┐'],
      ['z', 'KeyZ', '└'],
      ['x', 'KeyX', '┘'],
    ];

    for (const [key, code, glyph] of corners) {
      const out = typed(key, { alt: true, code });
      expect(out.length).toBe(1);
      expect(screenCodeGlyph(out.codePointAt(0)!)!.glyph).toBe(glyph);
    }
  });

  it('draws the rules between them', () => {
    expect(screenCodeGlyph(typed('\\', { alt: true, code: 'Backslash' }).codePointAt(0)!)!.glyph).toBe('─');
    expect(screenCodeGlyph(typed('-', { alt: true, code: 'Minus' }).codePointAt(0)!)!.glyph).toBe('│');
  });

  it('turns reverse video on and off, which is the only fill a C64 has', () => {
    const on = keyEventToPetscii('9', false, false, 'Digit9', true);
    const line = keyEventToPetscii('\\', false, false, 'Backslash', true);
    const off = keyEventToPetscii('0', false, false, 'Digit0', true);

    const out = petsciiInputToAscii([...on!, ...line!, ...off!, ...line!]);
    expect(out.length).toBe(2);
    expect(screenCodeGlyph(out.codePointAt(0)!)!.reverse).toBe(true);
    expect(screenCodeGlyph(out.codePointAt(1)!)!.reverse).toBe(false);
  });

  /*
   * THE MAC PROBLEM. The browser applies Alt before the event is delivered,
   * so Alt+a arrives as a letter - and on a Swedish board that letter is one
   * a caller types for its own sake. Resolving the chord through `code` is
   * what keeps the two apart.
   */
  it('reads the physical key, not the letter the browser made of it', () => {
    const mac = typed('å', { alt: true, code: 'KeyA', swedish: true });

    expect(mac.length).toBe(1);
    expect(screenCodeGlyph(mac.codePointAt(0)!)!.glyph).toBe('┌');
  });

  it('still types a Swedish caller’s own letters when Alt is not held', () => {
    expect(typed('å', { swedish: true, code: 'KeyA' })).toBe('å');
  });

  it('hands an unknown Alt chord back to the browser', () => {
    expect(keyEventToPetscii('t', false, false, 'KeyF5', true)).toBeNull();
    expect(commodoreKeyToPetscii('F5')).toBeNull();
  });

  it('leaves ordinary typing exactly as it was', () => {
    expect(typed('h')).toBe('h');
    expect(typed('H', { shift: true })).toBe('H');
  });
});
