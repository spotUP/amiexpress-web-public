/**
 * LOVE's RandomGenerator, ported bit for bit.
 *
 * Panel Attack seeds panel generation with `love.math.newRandomGenerator()`,
 * so the generator is NOT in the panel-game repository at all - it lives in
 * the LOVE engine's C++ (`src/modules/math/RandomGenerator.{h,cpp}`). Every
 * seeded thing this port claims to reproduce - the starting board, each new
 * row, the garbage colours, and therefore every replay and every netplay
 * board - stands on this file being identical to that C++.
 *
 * Three pieces have to be exact, and each has a way of being subtly wrong:
 *
 *  1. The seeding hash. LOVE does not feed the seed to xorshift directly
 *     ("Xorshift isn't designed to give a good distribution of values across
 *     many similar seeds"), it runs Thomas Wang's 64-bit integer hash first,
 *     repeating while the result is 0 because xorshift cannot leave that state.
 *
 *  2. The step. Marsaglia's 64-bit xorshift, in the "xorshift*" variant: three
 *     shifts mutate the state, then the RETURNED value is the state times a
 *     constant. The multiply is deliberately not stored back.
 *
 *  3. The conversion to a double, which is a bit-pattern reinterpret, not a
 *     division: the top 12 bits are replaced with an exponent that puts the
 *     value in [1, 2), then 1 is subtracted. `Number(state) / 2**64` is a
 *     different number and would desync every seeded test in the suite.
 *
 * Everything is BigInt masked to 64 bits. Note `~x` on a BigInt is `-x - 1`,
 * not a 64-bit complement, so the complement in wangHash64 is written as an
 * xor with the mask.
 */
/**
 * A LOVE RandomGenerator.
 *
 * Only the surface Panel Attack uses is implemented: setSeed, random(min,max),
 * and the hex state get/set that GeneratorSource needs for rollback. The state
 * is the whole generator - snapshot it, not a call count, or a rollback lands
 * on a different stream.
 */
export declare class RandomGenerator {
    private state;
    constructor(seed?: number | bigint);
    /**
     * Seed the generator.
     *
     * LOVE takes a single numeric seed as `(uint64)(double)num`; Panel Attack
     * always uses that one-argument form. Seeds here are well inside 2^53 so the
     * double round-trip is exact.
     */
    setSeed(seed: number | bigint): void;
    /** The raw 64-bit step. Public only so the state can be reasoned about in tests. */
    rand(): bigint;
    /**
     * A double in [0, 1).
     *
     * The bit-pattern trick from xoroshiro.di.unimi.it: take the top 52 bits of
     * the random word as a mantissa under exponent 0x3FF, which is a double in
     * [1, 2), then subtract 1. Doing this by division instead would produce a
     * different sequence.
     */
    random(): number;
    /**
     * An integer in [min, max].
     *
     * This is wrap_RandomGenerator.lua's `getrandom`: `floor(r * (u - l + 1)) + l`.
     * Panel Attack only ever calls the two-argument form.
     */
    randomRange(min: number, max: number): number;
    /** The state as LOVE serialises it: `0x` plus 16 lowercase hex digits. */
    getState(): string;
    /** Restore a state produced by getState. LOVE requires the 0x prefix. */
    setState(state: string): void;
}
//# sourceMappingURL=prng.d.ts.map