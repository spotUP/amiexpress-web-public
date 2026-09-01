/**
 * On-screen BBS keyboard.
 *
 * Reported live 2026-08-25: new users could not register on a phone because
 * the keyboard had no '@', so an email address was impossible to type. The
 * keyboard shipped without anyone typing an address on it, so what these
 * tests protect is that every character a registration actually needs can be
 * pressed and reaches the terminal.
 *
 * Rewritten after 71b1eb4f0 laid the keyboard out the way a phone does. Two
 * of the assumptions here went stale with it and the suite had been failing
 * ever since:
 *
 *   - the mode key was '!#1'; it is '123' to the numbers layer and '#+=' on
 *     from there to the symbols layer
 *   - letter labels follow the SHIFT state now, which is what that commit
 *     set out to fix ("it still shows uppercase chars, which makes it really
 *     confusing to type passwords"), so an unshifted key reads 'q', not 'Q'
 *
 * What they assert is unchanged: every character a registration needs is
 * reachable, and reaches the terminal as itself.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MobileBBSKeyboard } from '../MobileBBSKeyboard';

afterEach(cleanup);

/** Press a key the way a thumb does - the delegated touchstart path. */
function press(label: string): void {
  fireEvent.touchStart(screen.getByRole('button', { name: label }));
}

describe('MobileBBSKeyboard', () => {
  it('can type an email address, so registration is possible on a phone', () => {
    const onKey = vi.fn();
    render(<MobileBBSKeyboard onKey={onKey} />);

    // A thumb types this by switching layers, so the test does too.
    press('j'); press('o');
    press('123'); press('@'); press('ABC');
    press('m'); press('y');
    press('123'); press('-'); press('ABC');
    press('b'); press('b'); press('s');
    press('123'); press('.'); press('ABC');
    press('n'); press('e'); press('t');

    expect(onKey.mock.calls.map(c => c[0]).join('')).toBe('jo@my-bbs.net');
  });

  it('has the characters an email needs', () => {
    render(<MobileBBSKeyboard onKey={() => undefined} />);

    // @ - . are on the 123 layer; _ is one further on, under #+=.
    press('123');
    for (const label of ['@', '.', '-']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    press('#+=');
    expect(screen.getByRole('button', { name: '_' })).toBeTruthy();
  });

  it('sends @ unchanged when shift is held', () => {
    // Shift upper-cases single characters; '@' has no upper case and must not
    // be mangled on the way through.
    const onKey = vi.fn();
    render(<MobileBBSKeyboard onKey={onKey} />);

    press('⇧');
    press('123');
    press('@');

    expect(onKey).toHaveBeenCalledWith('@');
  });

  it('can reach every printable ASCII character a password may contain', () => {
    // Reported live: "it's missing ! etc, so many people will not be able to
    // type their passwords". Anything typeable on a real keyboard has to be
    // typeable here, across both layouts.
    render(<MobileBBSKeyboard onKey={() => undefined} />);

    const reachable = new Set<string>();
    const collect = () => {
      for (const button of screen.getAllByRole('button')) {
        const data = button.getAttribute('data-bbs-key');
        if (data && data.length === 1) reachable.add(data);
      }
    };

    collect();
    press('123');          // the numbers layer
    collect();
    press('#+=');          // and the symbols layer beyond it
    collect();

    const missing: string[] = [];
    for (let code = 0x21; code <= 0x7e; code++) {
      const ch = String.fromCharCode(code);
      // Upper case is reached through shift, which has its own test.
      if (ch >= 'A' && ch <= 'Z') continue;
      if (!reachable.has(ch)) missing.push(ch);
    }

    expect(missing).toEqual([]);
  });

  it('switches back to the letters with the same key', () => {
    render(<MobileBBSKeyboard onKey={() => undefined} />);

    press('123');
    expect(screen.queryByRole('button', { name: 'q' })).toBeNull();

    press('ABC');
    expect(screen.getByRole('button', { name: 'q' })).toBeTruthy();
  });

  it('keeps the arrows, Return and Escape on both layouts', () => {
    // Navigation is how you get around the BBS; losing it behind a mode
    // switch would strand anyone who went looking for a symbol.
    render(<MobileBBSKeyboard onKey={() => undefined} />);

    press('123');

    // Full words, not abbreviations - the keys read 'space' and 'return'.
    for (const label of ['←', '↑', '↓', '→', 'ESC', 'return', '⌫', 'space']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('does not leave shift armed across a layout switch', () => {
    const onKey = vi.fn();
    render(<MobileBBSKeyboard onKey={onKey} />);

    press('⇧');
    press('123');
    press('ABC');
    press('a');          // unshifted, so the label is lowercase

    expect(onKey).toHaveBeenLastCalledWith('a');
  });

  it('still types letters in upper case after shift', () => {
    const onKey = vi.fn();
    render(<MobileBBSKeyboard onKey={onKey} />);

    press('⇧');
    press('A');

    expect(onKey).toHaveBeenCalledWith('A');
  });
});
