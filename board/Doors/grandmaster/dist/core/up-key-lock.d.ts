/**
 * Which rotation systems LOCK on the up key.
 *
 * HeborisCE's up key is one key with two jobs, and which job it does is a
 * property of the rotation ruleset:
 *
 *  - ACE-ARS (rots 4, ars.c:331 grounded, 361-389 airborne): drops the piece
 *    to the floor and locks it. TI-ARS runs classic.c's statCMove, which has
 *    no such branch at all.
 *  - TI-WORLD, ACE-SRS and DS-WORLD (rots 2/3/6, world.c:447-449 grounded,
 *    478-517 airborne): the same, both branches written as `rots != 7`.
 *  - SRS-X (rots 7) is the exception the `!= 7` carves out: world.c:519-540
 *    drops the piece and clears bs/bk instead of locking - a plain sonic
 *    drop, the piece stays live on the floor.
 *
 * The door's own systems (SRS, ARS, NRS, BARS) have no reference to copy and
 * keep the plain sonic drop.
 */
import type { RotationSystem } from './types';
/** Rotation systems whose up key drops AND locks. */
export declare const UP_KEY_LOCK_SYSTEMS: readonly RotationSystem[];
export declare function lockedByUpKey(rotationSystem: RotationSystem): boolean;
//# sourceMappingURL=up-key-lock.d.ts.map