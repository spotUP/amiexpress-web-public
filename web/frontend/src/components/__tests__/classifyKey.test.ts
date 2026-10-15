/**
 * Every rule the terminal has about a keystroke, in one place.
 *
 * BBSTerminal registered TWO custom key handlers and xterm keeps only the
 * last one - a second attachCustomKeyEventHandler silently replaces the
 * first - so Shift+Arrow sequences, the copy/select-all path with mouse
 * reporting off, and the Ctrl+Shift+M block had never run since they were
 * written. They are one handler now, and the decision is this pure function
 * because the component that owns the keyboard cannot be mounted (canvas,
 * socket, real xterm).
 *
 * Alt+Enter also fullscreens the browser here: a door asking for the whole
 * terminal is asking for room the page does not have inside the browser's
 * chrome.
 */

import { describe, it, expect } from 'vitest';
import { classifyKey, type TerminalKeyState } from '@amiexpress/terminal';

const normal: TerminalKeyState = {
  gameMode: false,
  connected: true,
  mouseTrackingDisabled: false,
};

const inGame: TerminalKeyState = { ...normal, gameMode: true };
const mouseOff: TerminalKeyState = { ...normal, mouseTrackingDisabled: true };

describe('classifyKey', () => {
  it('sends Alt+Enter as ESC + CR and fullscreens the browser', () => {
    expect(classifyKey({ key: 'Enter', altKey: true, type: 'keydown' }, normal)).toEqual({
      kind: 'send',
      bytes: '\x1b\r',
      fullscreen: true,
    });
  });

  it('does not send Alt+Enter twice in game mode', () => {
    // The window keydown listener already emits key-down WITH its modifiers.
    // Emitting the bytes here too would toggle the door twice per press -
    // straight back to the size it started at - so game mode gets the window
    // toggle and nothing else.
    expect(classifyKey({ key: 'Enter', altKey: true, type: 'keydown' }, inGame)).toEqual({
      kind: 'block',
      fullscreen: true,
    });
  });

  it('fullscreens on the press, never on the release', () => {
    const up = classifyKey({ key: 'Enter', altKey: true, type: 'keyup' }, normal);
    expect(up).toEqual({ kind: 'pass' });
  });

  it('blocks Ctrl/Cmd+Shift+M, in game mode as well', () => {
    // A window listener owns the mouse toggle; xterm must not also type an M.
    for (const state of [normal, inGame]) {
      expect(classifyKey({ key: 'M', ctrlKey: true, shiftKey: true, type: 'keydown' }, state))
        .toEqual({ kind: 'block' });
      expect(classifyKey({ key: 'm', metaKey: true, shiftKey: true, type: 'keydown' }, state))
        .toEqual({ kind: 'block' });
    }
  });

  it('sends the Shift+Arrow sequences xterm will not', () => {
    const expected: Record<string, string> = {
      ArrowUp: '\x1B[1;2A',
      ArrowDown: '\x1B[1;2B',
      ArrowRight: '\x1B[1;2C',
      ArrowLeft: '\x1B[1;2D',
    };
    for (const [key, bytes] of Object.entries(expected)) {
      expect(classifyKey({ key, shiftKey: true, type: 'keydown' }, normal))
        .toEqual({ kind: 'send', bytes });
    }
  });

  it('leaves a plain arrow to xterm', () => {
    expect(classifyKey({ key: 'ArrowUp', type: 'keydown' }, normal)).toEqual({ kind: 'pass' });
  });

  it('serves copy and select-all only while mouse reporting is off', () => {
    expect(classifyKey({ key: 'a', metaKey: true, type: 'keydown' }, mouseOff))
      .toEqual({ kind: 'select-all' });
    expect(classifyKey({ key: 'C', ctrlKey: true, type: 'keydown' }, mouseOff))
      .toEqual({ kind: 'copy' });

    // With mouse reporting ON the door wants the raw key.
    expect(classifyKey({ key: 'a', metaKey: true, type: 'keydown' }, normal))
      .toEqual({ kind: 'pass' });
    expect(classifyKey({ key: 'c', ctrlKey: true, type: 'keydown' }, normal))
      .toEqual({ kind: 'pass' });
  });

  it('does not copy on the key release', () => {
    expect(classifyKey({ key: 'c', metaKey: true, type: 'keyup' }, mouseOff))
      .toEqual({ kind: 'pass' });
  });

  it('blocks everything else in game mode', () => {
    for (const key of ['a', 'ArrowUp', 'Escape', ' ']) {
      expect(classifyKey({ key, type: 'keydown' }, inGame)).toEqual({ kind: 'block' });
    }
  });

  it('leaves game mode alone while the socket is down', () => {
    // Blocking xterm with nothing to emit to would swallow the keystroke.
    const offline: TerminalKeyState = { ...inGame, connected: false };
    expect(classifyKey({ key: 'a', type: 'keydown' }, offline)).toEqual({ kind: 'pass' });
  });

  it('passes an ordinary keystroke to xterm', () => {
    expect(classifyKey({ key: 'q', type: 'keydown' }, normal)).toEqual({ kind: 'pass' });
  });
});
