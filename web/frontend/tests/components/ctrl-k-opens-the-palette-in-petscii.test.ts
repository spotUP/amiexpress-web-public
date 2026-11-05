/**
 * CTRL+K OPENS THE COMMAND PALETTE ON A PETSCII SESSION TOO.
 *
 * "ctrl+k does nothing in petscii mode" (the sysop, 2026-10-18).
 *
 * The board opens its palette on VT (`\x0b`). The canvas keeps only the CTRL
 * chords `controlChordToPetscii` knows, so with KeyK missing it gave the chord
 * to the browser; and the input map dropped `$0B` as a byte with no meaning.
 *
 * Both ends in one test: the chord has to become `$0B`, and the input map has
 * to hand the board the palette key.
 */

import { describe, it, expect } from 'vitest';
import { keyEventToPetscii, controlChordToPetscii } from '@amiexpress/terminal';
import { petsciiInputToAscii } from '@amiexpress/bbs-door-sdk/petscii';

describe('CTRL+K on the PETSCII canvas', () => {
  it('is a chord the canvas keeps, sending $0B', () => {
    expect(controlChordToPetscii('KeyK')).toBe(0x0B);
    expect(keyEventToPetscii('k', false, false, 'KeyK', false, true)).toEqual([0x0B]);
  });

  it('reaches the board as the palette key', () => {
    expect(petsciiInputToAscii([0x0B])).toBe('\x0b');
  });

  it('leaves CTRL+L and CTRL+W where they were', () => {
    expect(controlChordToPetscii('KeyL')).toBe(0x0C);
    expect(controlChordToPetscii('KeyW')).toBe(0x17);
  });
});
