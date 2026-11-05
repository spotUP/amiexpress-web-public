/**
 * The Gaussian target-picker enemies use instead of chasing Pengo's exact
 * cell.
 *
 * Deterministic via an injected RNG (Box-Muller needs two uniform draws
 * per sample) rather than depending on Math.random(), so the formula and
 * the clamp are both pinned exactly rather than "probably around there".
 */
/** u1=0.5, u2=0 makes Box-Muller collapse to a known, checkable value. */
export declare function theSampleMatchesBoxMullerForKnownInputs(): Promise<void>;
/** u1 -> 0 is the Box-Muller singularity (ln(0) = -Infinity); it must not produce NaN/Infinity. */
export declare function aZeroFirstDrawDoesNotProduceInfinityOrNaN(): Promise<void>;
/** A target is always inside the given bounds, however wide the sample. */
export declare function theTargetIsAlwaysClampedIntoBounds(): Promise<void>;
/** With sigma 0, the target is always exactly the centre - a sanity check on the shape of the formula. */
export declare function zeroSigmaAlwaysReturnsTheCentre(): Promise<void>;
/**
 * Real randomness produces variety, not the same tile every time - the
 * one loose (non-seeded) check, guarding against an accidental constant
 * return that the deterministic tests above wouldn't catch.
 */
export declare function repeatedRealDrawsAreNotAllIdentical(): Promise<void>;
//# sourceMappingURL=ai.test.d.ts.map