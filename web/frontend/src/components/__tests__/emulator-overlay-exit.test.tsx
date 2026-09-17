/**
 * The way out of the emulator.
 *
 * The surface is deliberately bare - no strip, no button - so the only way
 * back to the BBS is a key. That key has to be heard INSIDE the frame,
 * because the frame is the whole surface and a focused frame's keys never
 * reach the hosting document.
 *
 * The first version listened only on the host document, on the theory that
 * the caller would click off the machine onto the black around it. There is
 * no black. Every click lands in the frame, focus never comes back, and
 * "esc does nothing" (sysop, 2026-09-17) was the only possible outcome.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { EmulatorOverlay } from '../../../../../packages/terminal/src/components/EmulatorOverlay';

function overlay(onClose: () => void) {
  return render(
    <EmulatorOverlay url="/beeb/?model=B-DFS1.2" title="GOMOKU" onClose={onClose} />,
  );
}

/** Let the mount effect attach its listener inside the frame. */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(100);
  });
}

describe('leaving the emulator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('closes on Shift+Escape from the hosting page', () => {
    const onClose = vi.fn();
    overlay(onClose);
    settle();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Shift+Escape pressed INSIDE the machine', () => {
    /*
     * THE BUG. While the caller is playing, the frame holds the keyboard,
     * and nothing they press reaches the hosting document at all - so a
     * listener only there can never fire.
     */
    const onClose = vi.fn();
    const { container } = overlay(onClose);
    settle();

    const inner = container.querySelector('iframe')?.contentDocument;
    expect(inner, 'the frame is same-origin, so its document is reachable').toBeTruthy();

    act(() => {
      inner!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves a bare Escape to the BBC, where it is a real key', () => {
    // ESCAPE stops a BASIC program and games read it. A surface that
    // swallowed it would make some software unusable.
    const onClose = vi.fn();
    const { container } = overlay(onClose);
    settle();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      container.querySelector('iframe')?.contentDocument
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops listening once it is gone', () => {
    const onClose = vi.fn();
    const { unmount } = overlay(onClose);
    settle();
    unmount();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the speed the machine runs at', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  /** Alt-T presses jsbeeb sees, by its own contract: it matches event.code. */
  function turboPresses(inner: Document): { count: () => number } {
    let n = 0;
    inner.addEventListener('keydown', (event) => {
      const key = event as KeyboardEvent;
      if (key.altKey && key.code === 'KeyT') n++;
    });
    return { count: () => n };
  }

  function mounted() {
    const onClose = vi.fn();
    const { container } = overlay(onClose);
    const inner = container.querySelector('iframe')!.contentDocument!;
    const turbo = turboPresses(inner);
    settle();
    return { inner, turbo, onClose };
  }

  it('boots and loads at turbo', () => {
    // A BBC Micro boots, types and pulls a program off a disc in its own
    // time, and none of that is what anyone came for.
    const { turbo } = mounted();
    expect(turbo.count()).toBe(1);
  });

  it('drops back to 2MHz at the first keystroke', () => {
    /*
     * THE POINT OF THE WHOLE THING. These are 1982 action games timed
     * against a 2MHz 6502; left at fast-as-possible they are unplayable.
     * The first key is the one moment that reliably means "it is loaded
     * and I am playing", with nothing to detect.
     */
    const { inner, turbo } = mounted();
    act(() => {
      inner.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
    });
    expect(turbo.count()).toBe(2);
  });

  it('is not ended by a bare modifier', () => {
    const { inner, turbo } = mounted();
    act(() => {
      inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftLeft' }));
    });
    expect(turbo.count()).toBe(1);
  });

  it('ends on its own when nothing is ever pressed', () => {
    // Software that wants no input would otherwise play at warp forever.
    const { turbo } = mounted();
    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(turbo.count()).toBe(2);
  });

  it('ends once, however many keys follow', () => {
    const { inner, turbo } = mounted();
    act(() => {
      for (const code of ['Space', 'KeyA', 'KeyB']) {
        inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', code }));
      }
    });
    expect(turbo.count()).toBe(2);
  });
});
