/**
 * Wiring tests for the mobile BBS page.
 *
 * These prove the game pad is REACHABLE: a door starting has to swap the
 * generic keyboard for the door's pad, and a pad press has to reach the
 * terminal's game-mode key path. A pad nobody can reach is not a feature.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

const harness = vi.hoisted(() => ({
  props: null as Record<string, any> | null,
  pressGameKey: vi.fn(),
  releaseGameKey: vi.fn(),
  injectInput: vi.fn(),
}));

vi.mock('@amiexpress/terminal', () => ({
  BBSTerminal: React.forwardRef((props: Record<string, any>, ref: React.Ref<unknown>) => {
    harness.props = props;
    React.useImperativeHandle(ref, () => ({
      focus: () => undefined,
      sendCommand: () => undefined,
      injectInput: harness.injectInput,
      getSocket: () => null,
      getTerminal: () => null,
      startDownload: async () => undefined,
      startUpload: async () => undefined,
      pressGameKey: harness.pressGameKey,
      releaseGameKey: harness.releaseGameKey,
    }));
    return <div data-testid="bbs-terminal" />;
  }),
}));

// Imported after the mock so TerminalPage picks it up.
const { TerminalPage } = await import('../TerminalPage');

function setPhoneViewport(): void {
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
}

function startDoor(doorId: string | null): void {
  act(() => { harness.props?.onDoorChange?.(doorId); });
}

beforeEach(() => {
  setPhoneViewport();
  harness.props = null;
  harness.pressGameKey.mockReset();
  harness.releaseGameKey.mockReset();
});

afterEach(cleanup);

describe('TerminalPage on a phone', () => {
  it('shows the generic BBS keyboard when no door is running', () => {
    render(<TerminalPage />);

    expect(screen.getByRole('button', { name: 'ESC' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hard Drop' })).toBeNull();
  });

  it('swaps in the GRANDMASTER pad while GMASTER runs, and back afterwards', () => {
    render(<TerminalPage />);

    startDoor('gmaster');

    expect(screen.getByRole('button', { name: 'Hard Drop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ESC' })).toBeNull();

    startDoor(null);

    expect(screen.getByRole('button', { name: 'ESC' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hard Drop' })).toBeNull();
  });

  it('swaps in the ARKANOID pad while ARKANOID runs', () => {
    render(<TerminalPage />);

    startDoor('arkanoid');

    expect(screen.getByRole('button', { name: 'Launch' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hard Drop' })).toBeNull();
  });

  it('keeps the generic keyboard for doors without a pad', () => {
    render(<TerminalPage />);

    startDoor('doorman');

    expect(screen.getByRole('button', { name: 'ESC' })).toBeTruthy();
  });

  it('drives the terminal game-mode key path on press and release', () => {
    render(<TerminalPage />);
    startDoor('gmaster');

    const left = screen.getByRole('button', { name: 'Left' });
    const touchStart = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, 'changedTouches', { value: [{ identifier: 1, target: left }] });
    act(() => { left.dispatchEvent(touchStart); });

    expect(harness.pressGameKey).toHaveBeenCalledWith('ArrowLeft', 'ArrowLeft');
    expect(harness.releaseGameKey).not.toHaveBeenCalled();

    const touchEnd = new Event('touchend', { bubbles: true, cancelable: true });
    Object.defineProperty(touchEnd, 'changedTouches', { value: [{ identifier: 1, target: left }] });
    act(() => { left.dispatchEvent(touchEnd); });

    expect(harness.releaseGameKey).toHaveBeenCalledWith('ArrowLeft', 'ArrowLeft');
  });

  it('asks the terminal to fill the page so the on-screen input cannot cover the bottom rows', () => {
    render(<TerminalPage />);

    expect(harness.props?.fillParent).toBe(true);
  });
});
