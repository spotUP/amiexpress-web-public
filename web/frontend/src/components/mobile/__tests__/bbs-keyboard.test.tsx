/**
 * On-screen BBS keyboard.
 *
 * Reported live 2026-08-25: new users could not register on a phone because
 * the keyboard had no '@', so an email address was impossible to type. The
 * keyboard shipped without anyone typing an address on it, so what these
 * tests protect is that every character a registration actually needs can be
 * pressed and reaches the terminal.
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

    for (const ch of ['j', 'o', '@', 'm', 'y', '-', 'b', 'b', 's', '.', 'n', 'e', 't']) {
      press(ch === ch.toUpperCase() && /[a-z]/i.test(ch) ? ch : ch.toUpperCase());
    }

    expect(onKey.mock.calls.map(c => c[0]).join('')).toBe('jo@my-bbs.net');
  });

  it('has the characters an email needs', () => {
    render(<MobileBBSKeyboard onKey={() => undefined} />);

    for (const label of ['@', '.', '-', '_']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('sends @ unchanged when shift is held', () => {
    // Shift upper-cases single characters; '@' has no upper case and must not
    // be mangled on the way through.
    const onKey = vi.fn();
    render(<MobileBBSKeyboard onKey={onKey} />);

    press('⇧');
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
    press('!#1');          // switch to the symbol layout
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

    press('!#1');
    expect(screen.queryByRole('button', { name: 'Q' })).toBeNull();

    press('ABC');
    expect(screen.getByRole('button', { name: 'Q' })).toBeTruthy();
  });

  it('keeps the arrows, Return and Escape on both layouts', () => {
    // Navigation is how you get around the BBS; losing it behind a mode
    // switch would strand anyone who went looking for a symbol.
    render(<MobileBBSKeyboard onKey={() => undefined} />);

    press('!#1');

    for (const label of ['←', '↑', '↓', '→', 'ESC', 'Ret', '⌫', 'Spc']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('does not leave shift armed across a layout switch', () => {
    const onKey = vi.fn();
    render(<MobileBBSKeyboard onKey={onKey} />);

    press('⇧');
    press('!#1');
    press('ABC');
    press('A');          // the key is labelled A and sends a

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
