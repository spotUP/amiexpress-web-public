/**
 * Arkanoid sub-cell paddle movement (Doors/arkanoid/paddle-motion.ts).
 *
 * Requested live: "is there some way to do subpixel or subchar movements for
 * the paddle so it looks like it moves less than one ANSI block at a time?"
 *
 * Half-block rendering can only show a half-cell position if the paddle ever
 * HOLDS one. The pointer reports whole columns, so the paddle has to glide
 * toward the pointer rather than take its column directly - that glide is
 * what these tests protect. Rendering the half cells is the SDK's job and is
 * covered by sdk/tests/unit/subcell.test.ts.
 */

import { easePaddle, PADDLE_EASE, PADDLE_SNAP } from '../../../../Doors/arkanoid/paddle-motion';

/** Run the glide until it settles, collecting every position it held. */
function glide(from: number, to: number, maxFrames = 60): number[] {
  const positions: number[] = [];
  let x = from;
  for (let i = 0; i < maxFrames && x !== to; i++) {
    x = easePaddle(x, to);
    positions.push(x);
  }
  return positions;
}

describe('paddle glide', () => {
  it('holds positions between whole columns, which is the whole point', () => {
    const positions = glide(10, 14);

    const fractional = positions.filter(x => !Number.isInteger(x));

    expect(fractional.length).toBeGreaterThan(0);
  });

  it('passes through the half-cell band the block glyphs can draw', () => {
    // A half block is only drawn between .25 and .75 of a cell, so the glide
    // has to actually land in that band or the smoothing is invisible.
    const positions = glide(10, 14);

    const inHalfBand = positions.some(x => {
      const frac = x - Math.floor(x);
      return frac >= 0.25 && frac < 0.75;
    });

    expect(inHalfBand).toBe(true);
  });

  it('arrives at the pointer rather than easing forever', () => {
    const positions = glide(10, 20);

    expect(positions[positions.length - 1]).toBe(20);
  });

  it('never overshoots the pointer', () => {
    const positions = glide(10, 20);

    expect(positions.every(x => x <= 20)).toBe(true);
  });

  it('works the same way going left', () => {
    const positions = glide(30, 20);

    expect(positions.every(x => x >= 20)).toBe(true);
    expect(positions[positions.length - 1]).toBe(20);
  });

  it('keeps up with the thumb - most of the distance in a couple of frames', () => {
    // Latency is the risk with easing: too slow and the paddle feels
    // detached. Two frames must cover the bulk of a short flick.
    const afterTwoFrames = easePaddle(easePaddle(10, 20), 20);

    expect(afterTwoFrames).toBeGreaterThan(18);
  });

  it('settles instead of creeping by imperceptible amounts', () => {
    expect(easePaddle(20 - PADDLE_SNAP / 2, 20)).toBe(20);
  });

  it('stays put when it is already there', () => {
    expect(easePaddle(15, 15)).toBe(15);
  });

  it('covers the configured fraction of the distance in one frame', () => {
    expect(easePaddle(0, 10)).toBeCloseTo(10 * PADDLE_EASE);
  });
});
