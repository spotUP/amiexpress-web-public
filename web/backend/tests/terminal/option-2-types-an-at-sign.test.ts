/**
 * Option+2 on a Swedish Mac keyboard types `@`.
 *
 * The eighty-column colour chord takes Alt+digit as the Commodore key and a
 * colour. On a Mac, Option is the layout's third level, so Option+2 is `@`
 * (and Option+7/8/9 are `|`, `[`, `]`); the chord swallowed them and the
 * sysop could not type an email address at new-user signup (2026-09-30).
 */
import { colourChordText } from '@amiexpress/terminal/utils/key-overrides';

describe('Alt/Option and a digit', () => {
  it('types the character a Mac layout makes of it', () => {
    for (const [code, key] of [['Digit2', '@'], ['Digit7', '|'], ['Digit8', '['], ['Digit9', ']']]) {
      expect(colourChordText({ type: 'keydown', code, key, altKey: true })).toBeNull();
    }
  });

  it('is still the Commodore colour chord when the key is only its digit', () => {
    expect(colourChordText({ type: 'keydown', code: 'Digit2', key: '2', altKey: true })).not.toBeNull();
  });

  it('leaves the CTRL colour chord alone', () => {
    expect(colourChordText({ type: 'keydown', code: 'Digit2', key: '2', ctrlKey: true })).not.toBeNull();
  });
});
