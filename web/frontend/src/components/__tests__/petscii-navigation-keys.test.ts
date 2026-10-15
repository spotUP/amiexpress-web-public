/**
 * Tab and Escape reach a door from a PETSCII session.
 *
 * No C64 keyboard has either key, which is why neither was in the canvas
 * keymap and why `petsciiInputToAscii` dropped their bytes as "no input
 * meaning". But the person at the web canvas is at a real keyboard, and the
 * board's doors navigate with them - a lobby's panes are walked with Tab -
 * so a PETSCII caller could open the TetriNET lobby and then not move around
 * it: "i cant tab in the tetrinet lobby in petscii mode" (2026-09-06).
 *
 * Both ends, in one test, because either alone is silent: the canvas has to
 * emit the byte AND the input map has to let it back out.
 */

import { describe, it, expect } from 'vitest';
import { keyEventToPetscii } from '@amiexpress/terminal';
import { petsciiInputToAscii } from '@amiexpress/bbs-door-sdk/petscii';

/** What the BBS actually receives when this key is pressed on the canvas. */
function pressed(key: string, shift = false): string {
  const bytes = keyEventToPetscii(key, shift);
  expect(bytes).not.toBeNull();
  return petsciiInputToAscii(bytes as number[]);
}

describe('a PETSCII session can navigate a door', () => {
  it('Tab arrives as a tab', () => {
    expect(pressed('Tab')).toBe('\t');
  });

  it('Escape arrives as an escape', () => {
    expect(pressed('Escape')).toBe('\x1b');
  });

  it('still carries the keys it always did', () => {
    expect(pressed('Enter')).toBe('\r');
    expect(pressed('ArrowUp')).toBe('\x1b[A');
    expect(pressed('a')).toBe('a');
    expect(pressed('A')).toBe('A');
  });
});
