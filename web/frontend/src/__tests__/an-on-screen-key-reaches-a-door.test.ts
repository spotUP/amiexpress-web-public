/**
 * A key tapped on the phone's keyboard must reach the door.
 *
 * Two independent faults made every blessed door on this board unreachable
 * from a phone, and a desktop could not see either of them:
 *
 *   1. `CoreDoor.execute()` turned GAME MODE on for every door built on it -
 *      the tip door, the doors menu, the dashboard, the card lobby, the ANSI
 *      editor - although fourteen of them ask for `enableGameMode: false` by
 *      name. That is pinned in sdk/tests.
 *   2. Game mode tells the browser to stop sending characters and send raw
 *      key-down / key-up EDGES instead, which a physical keyboard produces and
 *      an on-screen one does not. `sendInput` drops characters while it is on,
 *      so a tapped key went nowhere.
 *
 * The sysop, 2026-09-14, on the tip-of-the-day door: "the osd keyboard doesnt
 * seem to reach it q does nothing".
 *
 * This covers the second: what an on-screen keystroke BECOMES. The mapping is
 * a pure function so it can be driven directly - the terminal component needs
 * a socket, a canvas and an xterm to do anything at all.
 */
import { describe, it, expect } from 'vitest';
import { injectedKeyEvent } from '../../../../packages/terminal/src/utils/injected-key-event';

describe('a key tapped on the on-screen keyboard', () => {
  it('becomes the key event a real keyboard would have sent', () => {
    // THE REPORTED CASE. `q` is what closes a door; on the phone it did
    // nothing because nothing was sent at all.
    expect(injectedKeyEvent('q')).toEqual({ key: 'q', code: 'KeyQ' });
  });

  it('names the PHYSICAL key in `code`, so a shifted letter is the same key', () => {
    // Held-key tracking pairs a release with its press through `code`. If a
    // shifted Q and a plain q were two keys, a release could never find its
    // press and the door would hold a key down for ever.
    expect(injectedKeyEvent('Q')?.code).toBe('KeyQ');
    expect(injectedKeyEvent('q')?.code).toBe('KeyQ');
    expect(injectedKeyEvent('Q')?.key).toBe('Q');
  });

  it('carries return, space, escape and backspace under their event names', () => {
    // The four a door actually listens for, and the four the keyboard's own
    // bottom row and nav row send.
    expect(injectedKeyEvent('\r')).toEqual({ key: 'Enter', code: 'Enter' });
    expect(injectedKeyEvent(' ')).toEqual({ key: ' ', code: 'Space' });
    expect(injectedKeyEvent('\x1b')).toEqual({ key: 'Escape', code: 'Escape' });
    expect(injectedKeyEvent('\x7f')).toEqual({ key: 'Backspace', code: 'Backspace' });
  });

  it('turns the nav row\'s escape sequences back into arrows', () => {
    // MobileBBSKeyboard sends `\x1b[D` for its left arrow (NAV_ROW). A door in
    // game mode is listening for `ArrowLeft`, and would never see a match in
    // three raw bytes.
    expect(injectedKeyEvent('\x1b[D')).toEqual({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(injectedKeyEvent('\x1b[A')).toEqual({ key: 'ArrowUp', code: 'ArrowUp' });
    // The application-cursor spelling too - the same key, a different mode.
    expect(injectedKeyEvent('\x1bOC')).toEqual({ key: 'ArrowRight', code: 'ArrowRight' });
  });

  it('keeps digits and punctuation', () => {
    expect(injectedKeyEvent('7')).toEqual({ key: '7', code: 'Digit7' });
    expect(injectedKeyEvent('?')).toEqual({ key: '?', code: '?' });
  });

/**
   * "F2 doesnt work in petscii mode for some reason" (the sysop,
   * 2026-09-22). A C64's F-keys reach this path as SS3 and CSI sequences -
   * the canvas reads the key, `petsciiInputToAscii` turns $89 into `\x1bOQ`
   * - and with no entry here the press became null, fell through to
   * `sendInput`, and `sendInput` drops everything while game mode is on. The
   * key vanished between the caller and the door.
   */
  it('names the function keys a C64 sends', () => {
    expect(injectedKeyEvent('\x1bOQ')).toEqual({ key: 'F2', code: 'F2' });
    expect(injectedKeyEvent('\x1bOP')).toEqual({ key: 'F1', code: 'F1' });
    expect(injectedKeyEvent('\x1b[15~')).toEqual({ key: 'F5', code: 'F5' });
    expect(injectedKeyEvent('\x1b[19~')).toEqual({ key: 'F8', code: 'F8' });
  });

  it('names the edit keys that travel the same road', () => {
    expect(injectedKeyEvent('\x1b[H')).toEqual({ key: 'Home', code: 'Home' });
    expect(injectedKeyEvent('\x1b[3~')).toEqual({ key: 'Delete', code: 'Delete' });
  });

  it('refuses anything that is not one keystroke', () => {
    /*
     * A PASTE IS NOT A KEY PRESS. The caller falls back to the ordinary
     * character path for these rather than inventing an edge - pressing and
     * releasing a key called "hello" would be a key nothing can release.
     */
    expect(injectedKeyEvent('hello')).toBeNull();
    expect(injectedKeyEvent('')).toBeNull();
    // A mouse report, which arrives on the same channel.
    expect(injectedKeyEvent('\x1b[M abc')).toBeNull();
    // An unnamed control character: no on-screen key sends one.
    expect(injectedKeyEvent('\x01')).toBeNull();
  });
});
