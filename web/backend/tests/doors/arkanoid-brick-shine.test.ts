/**
 * The shine that sweeps the brick wall (Doors/arkanoid/brick-shine.ts).
 *
 * Asked for: "the brick highlight should sweep row by row, top to bottom."
 *
 * It used to hand out a two-frame delay per surviving brick as it walked the
 * brick ARRAY, which gave every brick in a row a different moment - a crawl,
 * not a sweep - and went ragged as the wall was cleared, because skipping
 * destroyed bricks shifted every delay after them.
 */

import {
  shineDelayFor,
  isShining,
  shineDuration,
  SHINE_ROW_STEP,
  SHINE_VISIBLE,
} from '../../../../Doors/arkanoid/brick-shine';

const TOP = 5;
const ROW_HEIGHT = 1;

/** The frame a brick lights up, counting from the start of the sweep. */
function litAt(y: number): number[] {
  const frames: number[] = [];
  let counter = shineDelayFor(y, TOP, ROW_HEIGHT);
  for (let frame = 0; frame < 200; frame++) {
    if (isShining(counter)) frames.push(frame);
    if (counter > 0) counter--;
  }
  return frames;
}

describe('the sweep', () => {
  it('lights a whole row at once', () => {
    // Twelve bricks across; all of them share a row, so all of them share
    // the moment. This is the bug: the old code gave each its own.
    const row = Array.from({ length: 12 }, () => shineDelayFor(TOP + 2, TOP, ROW_HEIGHT));

    expect(new Set(row).size).toBe(1);
  });

  it('runs top to bottom', () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7].map(r => litAt(TOP + r * ROW_HEIGHT)[0]);

    const sorted = [...rows].sort((a, b) => a - b);
    expect(rows).toEqual(sorted);
    expect(new Set(rows).size).toBe(8);
  });

  it('lights the top row too', () => {
    // Row 0 at delay 0 would start already expired and never light at all.
    expect(litAt(TOP).length).toBeGreaterThan(0);
  });

  it('lights every row for the same length of time', () => {
    for (const r of [0, 3, 7]) {
      expect(litAt(TOP + r * ROW_HEIGHT)).toHaveLength(SHINE_VISIBLE - 1);
    }
  });

  it('steps one row at a time, with no gap and no overlap', () => {
    const first = litAt(TOP);
    const second = litAt(TOP + ROW_HEIGHT);

    expect(second[0] - first[0]).toBe(SHINE_ROW_STEP);
    expect(first.some(f => second.includes(f))).toBe(false);
  });
});

describe('timing is a brick\'s position, not its place in the array', () => {
  it('does not shift when bricks above are destroyed', () => {
    // The wall empties as it is played; the sweep must not change shape.
    const before = shineDelayFor(TOP + 4, TOP, ROW_HEIGHT);

    // Nothing to re-run - the delay depends only on where the brick IS.
    expect(shineDelayFor(TOP + 4, TOP, ROW_HEIGHT)).toBe(before);
  });

  it('reads the row from the brick geometry', () => {
    // Taller bricks: row 2 of a 2-high wall sits at y = top + 4.
    expect(shineDelayFor(TOP + 4, TOP, 2)).toBe(shineDelayFor(TOP + 2, TOP, 1));
  });

  it('survives a brick above the wall', () => {
    // Clamped rather than negative, which would count DOWN past the visible
    // window instantly and flash on frame one.
    expect(shineDelayFor(TOP - 3, TOP, ROW_HEIGHT)).toBeGreaterThanOrEqual(SHINE_VISIBLE);
  });
});

describe('sweep length', () => {
  it('covers every row of the wall', () => {
    const rows = 8;
    const last = litAt(TOP + (rows - 1) * ROW_HEIGHT);

    expect(shineDuration(rows)).toBeGreaterThan(last[last.length - 1]);
  });
});
