/**
 * The Gaussian target-picker enemies use instead of chasing Pengo's exact
 * cell.
 *
 * Deterministic via an injected RNG (Box-Muller needs two uniform draws
 * per sample) rather than depending on Math.random(), so the formula and
 * the clamp are both pinned exactly rather than "probably around there".
 */

import assert from 'assert';
import { gaussianTargetNear } from '../game/ai';

/** A fixed sequence of "random" draws, cycling if it runs out. */
function scriptedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const wideBounds = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };

/** u1=0.5, u2=0 makes Box-Muller collapse to a known, checkable value. */
export async function theSampleMatchesBoxMullerForKnownInputs(): Promise<void> {
  const rng = scriptedRng([0.5, 0]);
  const target = gaussianTargetNear({ x: 10, y: 10 }, 3, wideBounds, rng);

  // z = sqrt(-2 * ln(0.5)) * cos(0) = sqrt(2 * ln 2) ~= 1.1774
  const expectedOffset = Math.round(Math.sqrt(-2 * Math.log(0.5)) * Math.cos(0) * 3);
  assert.strictEqual(target.x, 10 + expectedOffset);
  assert.strictEqual(target.y, 10 + expectedOffset, 'x and y draw from the same scripted sequence here');
}

/** u1 -> 0 is the Box-Muller singularity (ln(0) = -Infinity); it must not produce NaN/Infinity. */
export async function aZeroFirstDrawDoesNotProduceInfinityOrNaN(): Promise<void> {
  const rng = scriptedRng([0, 0.25]);
  const target = gaussianTargetNear({ x: 5, y: 5 }, 3, wideBounds, rng);

  assert.ok(Number.isFinite(target.x), `x was ${target.x}`);
  assert.ok(Number.isFinite(target.y), `y was ${target.y}`);
}

/** A target is always inside the given bounds, however wide the sample. */
export async function theTargetIsAlwaysClampedIntoBounds(): Promise<void> {
  const bounds = { minX: 1, maxX: 11, minY: 1, maxY: 13 };
  // A near-zero u1 produces a huge sample - the case most likely to escape the clamp.
  const rng = scriptedRng([1e-12, 0.99]);
  const target = gaussianTargetNear({ x: 6, y: 7 }, 3, bounds, rng);

  assert.ok(target.x >= bounds.minX && target.x <= bounds.maxX, `x=${target.x}`);
  assert.ok(target.y >= bounds.minY && target.y <= bounds.maxY, `y=${target.y}`);
}

/** With sigma 0, the target is always exactly the centre - a sanity check on the shape of the formula. */
export async function zeroSigmaAlwaysReturnsTheCentre(): Promise<void> {
  const rng = scriptedRng([0.3, 0.7, 0.9, 0.1]);
  const target = gaussianTargetNear({ x: 4, y: 9 }, 0, wideBounds, rng);
  assert.deepStrictEqual(target, { x: 4, y: 9 });
}

/**
 * Real randomness produces variety, not the same tile every time - the
 * one loose (non-seeded) check, guarding against an accidental constant
 * return that the deterministic tests above wouldn't catch.
 */
export async function repeatedRealDrawsAreNotAllIdentical(): Promise<void> {
  const bounds = { minX: 1, maxX: 11, minY: 1, maxY: 13 };
  const samples = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const t = gaussianTargetNear({ x: 6, y: 7 }, 3, bounds);
    samples.add(`${t.x},${t.y}`);
  }
  assert.ok(samples.size > 1, 'twenty draws with sigma=3 should not all land on the same tile');
}
