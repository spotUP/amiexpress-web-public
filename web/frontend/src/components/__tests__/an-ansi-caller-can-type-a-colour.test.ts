/**
 * AN EIGHTY-COLUMN CALLER TYPES A COLOUR THE WAY A C64 CALLER DOES.
 *
 * "let ansi users type colors the same way and it gets translated to the
 * petscii users" (the sysop, 2026-09-22). The stored form and both renderers
 * landed under K; the keyboard half did not. A PETSCII session's keys go
 * through the canvas keymap, which learned CTRL+1-8 and C=+1-8; an
 * eighty-column session's keys go through xterm and `classifyKey`, which had
 * never been told - so the chord did nothing there, or switched a browser
 * tab.
 *
 * The decisive assertion is the last one: the two terminals must produce the
 * SAME text for the same chord, because there is one decoder.
 */
import { describe, it, expect } from 'vitest';
import { classifyKey, type TerminalKeyState } from '@amiexpress/terminal';
import { keyEventToPetscii } from '../../../../../packages/terminal/src/petscii/keymap';
import { petsciiInputToAscii } from '@amiexpress/bbs-door-sdk/petscii';

const normal: TerminalKeyState = { gameMode: false, connected: true, mouseTrackingDisabled: false };
const inGame: TerminalKeyState = { ...normal, gameMode: true };

/** The board's own colour marker for a VIC index. */
const marker = (vic: number) => String.fromCodePoint(0xe200 + vic);

describe('the eight CTRL colours', () => {
  it('reach the board as the colour the caller asked for', () => {
    // CTRL+3 is red, which is VIC 2.
    expect(classifyKey({ key: '3', code: 'Digit3', ctrlKey: true, type: 'keydown' }, normal))
      .toEqual({ kind: 'input', text: marker(2) });
  });

  it('are all eight of them', () => {
    for (const digit of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const action = classifyKey(
        { key: String(digit), code: `Digit${digit}`, ctrlKey: true, type: 'keydown' },
        normal,
      );
      expect(action.kind).toBe('input');
    }
  });
});

describe('the other eight, on the Commodore key', () => {
  it('are reached with ALT, as they are on the canvas', () => {
    // C=+1 is orange, which is VIC 8.
    expect(classifyKey({ key: '1', code: 'Digit1', altKey: true, type: 'keydown' }, normal))
      .toEqual({ kind: 'input', text: marker(8) });
  });
});

describe('what a colour chord is not', () => {
  it('is not the Command key - those are the browser\'s tabs', () => {
    expect(classifyKey({ key: '1', code: 'Digit1', metaKey: true, type: 'keydown' }, normal))
      .toEqual({ kind: 'pass' });
  });

  it('is not a key release, or one chord would send two colours', () => {
    expect(classifyKey({ key: '3', code: 'Digit3', ctrlKey: true, type: 'keyup' }, normal))
      .toEqual({ kind: 'pass' });
  });

  it('is not CTRL+9, which is reverse and has no meaning on an ANSI terminal', () => {
    expect(classifyKey({ key: '9', code: 'Digit9', ctrlKey: true, type: 'keydown' }, normal))
      .toEqual({ kind: 'pass' });
  });

  it('is not typed at a door that is reading raw key edges', () => {
    expect(classifyKey({ key: '3', code: 'Digit3', ctrlKey: true, type: 'keydown' }, inGame))
      .toEqual({ kind: 'block' });
  });

  it('is not a bare digit', () => {
    expect(classifyKey({ key: '3', code: 'Digit3', type: 'keydown' }, normal))
      .toEqual({ kind: 'pass' });
  });
});

describe('the two terminals', () => {
  it('turn the same chord into the same text, because there is one decoder', () => {
    for (const [digit, ctrl, alt] of [
      [1, true, false], [4, true, false], [8, true, false],
      [1, false, true], [5, false, true], [8, false, true],
    ] as const) {
      const code = `Digit${digit}`;
      // What a PETSCII session sends: keymap bytes, then the shared decoder.
      const onCanvas = petsciiInputToAscii(
        keyEventToPetscii(String(digit), false, false, code, alt, ctrl)!,
      );
      const onXterm = classifyKey(
        { key: String(digit), code, ctrlKey: ctrl, altKey: alt, type: 'keydown' },
        normal,
      );

      expect(onXterm).toEqual({ kind: 'input', text: onCanvas });
    }
  });
});
