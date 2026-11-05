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
  wheelDeltaInRows,
  WHEEL_DELTA_LINE,
  WHEEL_DELTA_PAGE,
  WHEEL_DELTA_PIXEL,
} from '../../../../packages/terminal/src/petscii/scrollback';

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

describe('how far a wheel event asks to move', () => {
  it('counts pixels in rows as tall as the row is drawn', () => {
    expect(wheelDeltaInRows(-60, WHEEL_DELTA_PIXEL, 20, 25)).toBe(-3);
  });

  it('takes a line as a row', () => {
    expect(wheelDeltaInRows(3, WHEEL_DELTA_LINE, 20, 25)).toBe(3);
  });

  it('takes a page as the whole screen', () => {
    expect(wheelDeltaInRows(-1, WHEEL_DELTA_PAGE, 20, 25)).toBe(-25);
  });

  it('moves nothing when the canvas has no height yet', () => {
    expect(wheelDeltaInRows(-60, WHEEL_DELTA_PIXEL, 0, 25)).toBe(0);
  });
});

describe('the wheel over the PETSCII glass', () => {
  it('goes BACK in time when the caller scrolls up (a negative delta)', () => {
    expect(scrollOffsetForWheel(0, -3, 0, 500)).toEqual({ offset: 3, carry: 0 });
  });

  it('comes forward again when he scrolls down', () => {
    expect(scrollOffsetForWheel(6, 3, 0, 500)).toEqual({ offset: 3, carry: 0 });
  });

  /*
   * "it scrolls very fast so its hard to control" (the sysop, 2026-09-24).
   * Every EVENT moved three rows, and a trackpad swipe is dozens of events of
   * a few pixels each. Forty 5px events at 20px a row is ten rows of travel;
   * the old arithmetic made it a hundred and twenty.
   */
  it('moves a trackpad swipe by its distance, not by its number of events', () => {
    let state = { offset: 0, carry: 0 };
    for (let i = 0; i < 40; i++) {
      state = scrollOffsetForWheel(state.offset, wheelDeltaInRows(-5, WHEEL_DELTA_PIXEL, 20, 25), state.carry, 500);
    }
    expect(state.offset).toBe(10);
  });

  it('carries a fraction of a row until it adds up to one', () => {
    const first = scrollOffsetForWheel(0, -0.5, 0, 500);
    expect(first.offset).toBe(0);
    expect(scrollOffsetForWheel(first.offset, -0.5, first.carry, 500).offset).toBe(1);
  });

  it('cannot scroll further back than the history goes, and drops the carry there', () => {
    expect(scrollOffsetForWheel(2, -3.5, 0, 2)).toEqual({ offset: 2, carry: 0 });
  });

  it('cannot scroll past the live screen', () => {
    expect(scrollOffsetForWheel(1, 3, 0, 500)).toEqual({ offset: 0, carry: 0 });
  });

  it('moves nothing on a purely horizontal wheel', () => {
    expect(scrollOffsetForWheel(6, 0, 0, 500)).toEqual({ offset: 6, carry: 0 });
  });
});
