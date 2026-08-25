/**
 * Motion trail model.
 *
 * The streak has to be brightest where the object just was and fade with
 * age, and it has to expire - a trail that never dies leaves permanent smear
 * on the playfield.
 */

import {
  buildTrail,
  expireTrails,
  trailIntensity,
  trailTier,
  TRAIL_LIFETIME_MS,
} from '../../engines/graphics/motion-trail';

describe('laying a trail', () => {
  it('covers the ground between where the object was and where it landed', () => {
    const cells = buildTrail({ axis: 'vertical', fixed: 4, from: 2, to: 8, now: 0 });

    expect(cells.map(c => c.y)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(cells.every(c => c.x === 4)).toBe(true);
  });

  it('is brightest nearest the destination', () => {
    const cells = buildTrail({ axis: 'vertical', fixed: 4, from: 2, to: 8, now: 0 });

    const last = cells[cells.length - 1];
    expect(last.strength).toBeGreaterThan(cells[0].strength);
    expect(last.strength).toBeCloseTo(1);
  });

  it('works the other way too', () => {
    const cells = buildTrail({ axis: 'horizontal', fixed: 20, from: 30, to: 24, now: 0 });

    expect(cells.map(c => c.x)).toEqual([30, 29, 28, 27, 26, 25]);
    expect(cells.every(c => c.y === 20)).toBe(true);
  });

  it('leaves nothing behind when the object did not move', () => {
    expect(buildTrail({ axis: 'horizontal', fixed: 5, from: 10, to: 10, now: 0 })).toEqual([]);
  });

  it('caps a very long streak rather than painting the whole screen', () => {
    const cells = buildTrail({ axis: 'vertical', fixed: 1, from: 0, to: 500, now: 0, maxCells: 10 });

    expect(cells).toHaveLength(10);
  });
});

describe('fading', () => {
  it('dims with age', () => {
    const [cell] = buildTrail({ axis: 'vertical', fixed: 1, from: 0, to: 1, now: 0 });

    const fresh = trailIntensity(cell, 0);
    const older = trailIntensity(cell, TRAIL_LIFETIME_MS / 2);

    expect(older).toBeLessThan(fresh);
    expect(older).toBeGreaterThan(0);
  });

  it('is gone once it has outlived its lifetime', () => {
    const [cell] = buildTrail({ axis: 'vertical', fixed: 1, from: 0, to: 1, now: 0 });

    expect(trailIntensity(cell, TRAIL_LIFETIME_MS)).toBe(0);
  });

  it('expires cells so the playfield does not smear permanently', () => {
    const cells = buildTrail({ axis: 'vertical', fixed: 1, from: 0, to: 5, now: 0 });

    expect(expireTrails(cells, TRAIL_LIFETIME_MS - 1)).toHaveLength(cells.length);
    expect(expireTrails(cells, TRAIL_LIFETIME_MS + 1)).toHaveLength(0);
  });

  it('keeps fresh cells when older ones expire', () => {
    const old = buildTrail({ axis: 'vertical', fixed: 1, from: 0, to: 3, now: 0 });
    const fresh = buildTrail({ axis: 'vertical', fixed: 2, from: 0, to: 3, now: 200 });

    const alive = expireTrails([...old, ...fresh], 220);

    expect(alive).toHaveLength(fresh.length);
    expect(alive.every(c => c.x === 2)).toBe(true);
  });
});

describe('tiers a terminal can actually draw', () => {
  it('steps from solid through mid to faint', () => {
    expect(trailTier(0.9)).toBe('solid');
    expect(trailTier(0.5)).toBe('mid');
    expect(trailTier(0.1)).toBe('faint');
  });

  it('draws nothing at all once dead', () => {
    expect(trailTier(0)).toBeNull();
  });
});
