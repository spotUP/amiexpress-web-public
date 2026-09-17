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
