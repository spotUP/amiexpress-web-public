"use strict";
/**
 * Enemy AI targeting: where a Sno-Bee is currently headed.
 *
 * Ours used to chase Pengo's exact cell every tick - a deterministic
 * greedy chase that was reported as meaningfully harder than either
 * reference clone, and harder than the arcade. Ref1's model
 * (`Enemy.cpp:379-397`) instead draws a random target tile from a
 * Gaussian centred on Pengo, re-picked once the enemy reaches it - not
 * tracking Pengo exactly.
 *
 * Pulled out of PengoGame as a pure function (rather than inlined with a
 * bare `Math.random()` call) so the distribution itself is testable with
 * an injected, deterministic RNG instead of depending on real randomness.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.gaussianTargetNear = gaussianTargetNear;
/** A standard-normal sample via Box-Muller, from an injectable [0,1) RNG. */
function gaussianSample(rng) {
    // u1 must never be exactly 0 - log(0) is -Infinity, which would produce
    // a target arbitrarily far from centre instead of merely a wide one.
    const u1 = Math.max(rng(), Number.EPSILON);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
/**
 * A random target near `center`, `sigma` cells out on each axis on
 * average, clamped into `bounds` - the maze interior, so a wide sample
 * never sends a Sno-Bee walking at the wall ring.
 */
function gaussianTargetNear(center, sigma, bounds, rng = Math.random) {
    const x = Math.round(center.x + gaussianSample(rng) * sigma);
    const y = Math.round(center.y + gaussianSample(rng) * sigma);
    return {
        x: Math.min(bounds.maxX, Math.max(bounds.minX, x)),
        y: Math.min(bounds.maxY, Math.max(bounds.minY, y)),
    };
}
//# sourceMappingURL=ai.js.map