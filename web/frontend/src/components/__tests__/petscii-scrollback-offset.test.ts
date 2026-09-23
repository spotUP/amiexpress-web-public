/**
 * WHERE ONE NOTCH OF THE WHEEL LEAVES THE PETSCII GLASS.
 *
 * The wheel over a PETSCII screen reached `BBSTerminal`'s cell-pointer
 * handler and fell straight through it: that handler answers `down`, `move`
 * and `up`, so a wheel outside a door was dropped on the floor. Half of
 * "scrollback does not work petscii" (the sysop, 2026-09-24) was this, the
 * other half being that the screen model kept no rows to show.
 *
 * The arithmetic lives on its own so the answer is a test rather than a walk
 * through a browser.
 */
import { describe, it, expect } from 'vitest';
import {
  clampScrollOffset,
  scrollOffsetForWheel,
  PETSCII_WHEEL_ROWS,
} from '../../../../../packages/terminal/src/petscii/scrollback';

describe('the offset the glass is allowed to hold', () => {
  it('is never negative - there is nothing below the live screen', () => {
    expect(clampScrollOffset(-5, 100)).toBe(0);
  });

  it('stops at the oldest row the machine kept', () => {
    expect(clampScrollOffset(500, 40)).toBe(40);
  });

  it('is zero when there is no history at all', () => {
    expect(clampScrollOffset(9, 0)).toBe(0);
  });
});

describe('one notch of the wheel', () => {
  it('goes BACK in time when the caller scrolls up (a negative deltaY)', () => {
    expect(scrollOffsetForWheel(0, -100, 500)).toBe(PETSCII_WHEEL_ROWS);
  });

  it('comes forward again when he scrolls down', () => {
    expect(scrollOffsetForWheel(PETSCII_WHEEL_ROWS * 2, 100, 500)).toBe(PETSCII_WHEEL_ROWS);
  });

  it('moves the same distance whatever units the browser reports', () => {
    // A trackpad reports pixels, a mouse reports lines; the notch is ours.
    expect(scrollOffsetForWheel(0, -3, 500)).toBe(scrollOffsetForWheel(0, -240, 500));
  });

  it('cannot scroll further back than the history goes', () => {
    expect(scrollOffsetForWheel(2, -100, 2)).toBe(2);
  });

  it('cannot scroll past the live screen', () => {
    expect(scrollOffsetForWheel(1, 100, 500)).toBe(0);
  });

  it('moves nothing on a purely horizontal wheel', () => {
    expect(scrollOffsetForWheel(6, 0, 500)).toBe(6);
  });
});
