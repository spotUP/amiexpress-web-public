/**
 * Option+2 is an `@`, not an escape.
 *
 * "right option on mac + 2 seem to be the same as q or esc, it closes the
 * dialog the first time and the door the second time" (sysop, live board,
 * 2026-09-07), typing his email address into the ACHIEVE door.
 *
 * A door in game mode is sent raw key events, and the backend spells Alt to it
 * as ESC before the key. On a Nordic Mac layout `@` IS Option+2, so the door
 * was handed `\x1b@` - which blessed reads as an escape keypress followed by
 * an `@`. The dialog took the first escape and the door's own quit binding
 * took the second.
 */
import {
  altComposedCharacter,
  keyBytesFor,
  unmodifiedCharFor,
} from '../../src/server/composed-key';

describe('what the physical key types unmodified', () => {
  it('reads letters and digits off the key code', () => {
    expect(unmodifiedCharFor('KeyG')).toBe('g');
    expect(unmodifiedCharFor('Digit2')).toBe('2');
  });

  it('answers null for a key it cannot place', () => {
    expect(unmodifiedCharFor('Enter')).toBeNull();
    expect(unmodifiedCharFor('BracketLeft')).toBeNull();
    expect(unmodifiedCharFor(undefined)).toBeNull();
  });
});

describe('composed or meta', () => {
  it('Option+2 giving @ is composed', () => {
    expect(altComposedCharacter('@', 'Digit2')).toBe(true);
  });

  it('Option+G giving a copyright sign is composed', () => {
    expect(altComposedCharacter('©', 'KeyG')).toBe(true);
  });

  it('Alt+G giving g is meta, not composition', () => {
    expect(altComposedCharacter('g', 'KeyG')).toBe(false);
    expect(altComposedCharacter('G', 'KeyG')).toBe(false); // Alt+Shift+G
  });

  it('a named key is never a composed character', () => {
    expect(altComposedCharacter('Enter', 'Enter')).toBe(false);
    expect(altComposedCharacter('ArrowUp', 'ArrowUp')).toBe(false);
  });

  it('an unplaceable key keeps the meta spelling it has always had', () => {
    expect(altComposedCharacter('{', 'BracketLeft')).toBe(false);
  });
});

describe('the bytes a game-mode door receives', () => {
  it('sends the composed character alone - the sysop types his address', () => {
    expect(keyBytesFor('@', '@', 'Digit2', true)).toBe('@');
  });

  it('still spells Alt+Enter as ESC + CR, which GRANDMASTER reads as its size toggle', () => {
    expect(keyBytesFor('\r', 'Enter', 'Enter', true)).toBe('\x1b\r');
  });

  it('still spells a real meta chord as ESC + the key', () => {
    expect(keyBytesFor('g', 'g', 'KeyG', true)).toBe('\x1bg');
  });

  it('leaves an unmodified key exactly as it was', () => {
    expect(keyBytesFor('@', '@', 'Digit2', false)).toBe('@');
    expect(keyBytesFor('\r', 'Enter', 'Enter', undefined)).toBe('\r');
  });
});
