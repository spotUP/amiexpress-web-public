/**
 * CTRL+9 AND CTRL+0 ARE REVERSE ON AND OFF, NOT THE DIGITS.
 *
 * "ctrl+0/9 just prints 0 or 9" (the sysop, 2026-09-23, typing in LIVE CHAT
 * on a PETSCII session).
 *
 * On a C64 keyboard CTRL owns ten chords: the first eight colours on 1-8, and
 * RVS ON and RVS OFF on 9 and 0. Only the eight were wired here, and the
 * canvas decides whether to keep a keystroke by asking the same question - so
 * with reverse missing it let CTRL+9 through and the browser typed a `9` into
 * the line.
 *
 * Both ends in one test: the chord has to become the PETSCII byte, and the
 * input map has to read that byte as a latch rather than print it.
 */

import { describe, it, expect } from 'vitest';
import { keyEventToPetscii, controlChordToPetscii } from '@amiexpress/terminal';
import { petsciiInputToAscii } from '@amiexpress/bbs-door-sdk/petscii';

const RVS_ON = 0x12;
const RVS_OFF = 0x92;

describe('the reverse chords', () => {
  it('send the PETSCII reverse bytes', () => {
    expect(keyEventToPetscii('9', false, false, 'Digit9', false, true)).toEqual([RVS_ON]);
    expect(keyEventToPetscii('0', false, false, 'Digit0', false, true)).toEqual([RVS_OFF]);
  });

  it('are chords the canvas knows to keep', () => {
    expect(controlChordToPetscii('Digit9')).toBe(RVS_ON);
    expect(controlChordToPetscii('Digit0')).toBe(RVS_OFF);
  });

  it('print no digit', () => {
    expect(petsciiInputToAscii([RVS_ON])).toBe('');
    expect(petsciiInputToAscii([RVS_OFF])).toBe('');
  });

  it('leave the eight colour chords where they were', () => {
    expect(keyEventToPetscii('3', false, false, 'Digit3', false, true)).toEqual([0x1c]); // red
    expect(keyEventToPetscii('8', false, false, 'Digit8', false, true)).toEqual([0x9e]); // yellow
  });
});
