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

  it('still types letters in upper case after shift', () => {
    const onKey = vi.fn();
    render(<MobileBBSKeyboard onKey={onKey} />);

    press('⇧');
    press('A');

    expect(onKey).toHaveBeenCalledWith('A');
  });
});
