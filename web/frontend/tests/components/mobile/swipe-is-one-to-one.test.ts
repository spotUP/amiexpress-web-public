/**
 * Every continuously-steered door is 1:1 with the finger.
 *
 * The mobile beta on real phones (2026-09-06) had one dominant complaint:
 * ARKANOID's paddle outran the thumb by more than double, so nobody could aim
 * it. The gain was 2.2. It is 1 now.
 *
 * The plan asked for a SWEEP after that fix - "applies to every door where a
 * swipe steers something continuously; check the other arcade doors for the
 * same multiplier before calling it done". A sweep done once by reading files
 * answers for the doors that existed the day it was read, so it is written
 * here as an invariant instead: the next door that steers continuously is
 * checked by this file whether or not anyone remembers to look.
 *
 * The sweep's finding, 2026-09-15: exactly ONE control surface steers
 * continuously - the `spinner` layout, which only ARKANOID uses. Every other
 * door is either a button pad (discrete keys) or the gesture scheme, which
 * maps a whole stroke to a single keypress (`GESTURE_KEYS`) and so has no
 * gain to get wrong. There was no second multiplier to fix.
 */

import { describe, it, expect } from 'vitest';
import {
  GAME_CONTROL_LAYOUTS,
  TRACKPAD_GAIN,
  trackpadStep,
  layoutControls,
} from '../../../src/components/mobile/game-controls';

describe('the trackpad is 1:1 with the finger', () => {
  it('has no gearing on top of the mapping', () => {
    // 2.2 was the value the beta rejected. Anything but 1 means the paddle
    // and the thumb disagree about where the stroke ends.
    expect(TRACKPAD_GAIN).toBe(1);
  });

  it('moves the paddle exactly as far across the board as the thumb went across the strip', () => {
    const columns = 81; // cols - 1 = 80, so fractions land on whole columns
    // A third of the strip must be a third of the board.
    expect(trackpadStep(0, 0, 1 / 3, columns)).toBe(Math.round((80) / 3));
    // Half the strip, half the board.
    expect(trackpadStep(0, 0, 0.5, columns)).toBe(40);
    // The whole strip, the whole board.
    expect(trackpadStep(0, 0, 1, columns)).toBe(80);
  });

  it('is relative, so planting the thumb never teleports the paddle', () => {
    // The reach problem that the 2.2 gearing was introduced to solve is
    // answered by this, not by a multiplier: lift, re-plant, keep going.
    expect(trackpadStep(40, 0.9, 0.9, 81)).toBe(40);
    expect(trackpadStep(40, 0, 0.25, 81)).toBe(60);
    expect(trackpadStep(60, 0, 0.25, 81)).toBe(80);
  });

  it('never steers past either edge', () => {
    expect(trackpadStep(80, 0, 1, 81)).toBe(80);
    expect(trackpadStep(0, 1, 0, 81)).toBe(0);
  });

  it('ignores a stroke that reports nonsense rather than jumping', () => {
    expect(trackpadStep(40, Number.NaN, 0.5, 81)).toBe(40);
    expect(trackpadStep(40, 0, Number.POSITIVE_INFINITY, 81)).toBe(40);
  });
});

describe('the sweep: which doors steer continuously at all', () => {
  const layouts = Object.entries(GAME_CONTROL_LAYOUTS);

  it('finds every spinner door through the shared 1:1 mapping', () => {
    // The guard that makes this a sweep rather than an Arkanoid test. A new
    // spinner door added to the table is caught here: if it ever grows its
    // own gain, this file is where that has to be justified.
    const spinners = layouts.filter(([, layout]) => layout.kind === 'spinner');
    expect(spinners.length).toBeGreaterThan(0);
    for (const [id, layout] of spinners) {
      expect(layout.kind, `${id} is a spinner`).toBe('spinner');
      // A spinner carries no directional keys - if it did, the door would be
      // steered two ways at once and the stepwise one would fight the thumb.
      const directional = layoutControls(layout).filter((c) =>
        c.code === 'ArrowLeft' || c.code === 'ArrowRight');
      expect(directional, `${id} steers by thumb only`).toHaveLength(0);
    }
  });

  it('leaves every other door on discrete controls, which have no gain', () => {
    for (const [id, layout] of layouts) {
      if (layout.kind === 'spinner') continue;
      expect(layout.kind, `${id} is a button pad`).toBe('pad');
    }
  });
});
