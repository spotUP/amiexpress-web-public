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
import { Position } from './types';
export interface TargetBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}
/**
 * A random target near `center`, `sigma` cells out on each axis on
 * average, clamped into `bounds` - the maze interior, so a wide sample
 * never sends a Sno-Bee walking at the wall ring.
 */
export declare function gaussianTargetNear(center: Position, sigma: number, bounds: TargetBounds, rng?: () => number): Position;
//# sourceMappingURL=ai.d.ts.map