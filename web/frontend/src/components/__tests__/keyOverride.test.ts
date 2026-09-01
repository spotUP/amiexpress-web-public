/**
 * Alt+Enter has to leave the browser as ESC + CR.
 *
 * Reported 2026-09-01 against LiveChat: "it did not snap back to 80x25 when
 * i toggled it off". The door's binding was fine and the terminal's own
 * 'fixed' handler was fine; the keystroke never arrived. xterm only
 * ESC-prefixes an Option combination on macOS when macOptionIsMeta is set,
 * which it is not, so Alt+Enter reached the door as a bare Enter - which in
 * LiveChat sends the message you were typing.
 *
 * The component that owns the keyboard cannot be mounted here (canvas,
 * socket, real xterm), so the decision lives in a pure function and this
 * tests that.
 */

import { describe, it, expect } from 'vitest';
import { keyOverride } from '@amiexpress/terminal';

describe('terminal key overrides', () => {
  it('turns Alt+Enter into ESC + CR', () => {
    expect(keyOverride({ key: 'Enter', altKey: true, type: 'keydown' })).toBe('\x1b\r');
  });

  it('leaves a plain Enter to xterm', () => {
    expect(keyOverride({ key: 'Enter', type: 'keydown' })).toBeNull();
  });

  it('leaves Ctrl+Alt+Enter and Cmd+Alt+Enter alone', () => {
    expect(keyOverride({ key: 'Enter', altKey: true, ctrlKey: true, type: 'keydown' })).toBeNull();
    expect(keyOverride({ key: 'Enter', altKey: true, metaKey: true, type: 'keydown' })).toBeNull();
  });

  it('fires on the press, not on the release', () => {
    // Both would send, and the door would toggle twice per keystroke -
    // straight back to where it started, which is the reported symptom
    // with a different cause.
    expect(keyOverride({ key: 'Enter', altKey: true, type: 'keyup' })).toBeNull();
  });

  it('has no opinion about other keys', () => {
    for (const key of ['a', 'Escape', 'ArrowUp', 'Tab', 'F1']) {
      expect(keyOverride({ key, altKey: true, type: 'keydown' })).toBeNull();
    }
  });
});
