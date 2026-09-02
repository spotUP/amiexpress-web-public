"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UP_KEY_LOCK_SYSTEMS = void 0;
exports.lockedByUpKey = lockedByUpKey;
/** Rotation systems whose up key drops AND locks. */
exports.UP_KEY_LOCK_SYSTEMS = [
    'ACE-ARS', // ars.c:331,361-389
    'TI-WORLD', // world.c:447 (rots 2)
    'ACE-SRS', // world.c:447 (rots 3)
    'DS-WORLD', // world.c:447 (rots 6)
];
function lockedByUpKey(rotationSystem) {
    return exports.UP_KEY_LOCK_SYSTEMS.includes(rotationSystem);
}
//# sourceMappingURL=up-key-lock.js.map