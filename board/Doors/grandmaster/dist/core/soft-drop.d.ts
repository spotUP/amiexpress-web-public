/**
 * Soft-drop speed, and the two rotation systems that change it.
 *
 * HeborisCE's soft drop is a fall-speed override while down is held
 * (world.c:401-408), in units where 60 = one cell per frame:
 *
 *   ACE-SRS and DS-WORLD   bs += 30   half a cell per frame
 *                          ("ACE-SRSとDS-WORLDの高速落下を遅く" - world.c:405)
 *   SRS-X                  bs += 90   one and a half
 *   everything else        bs  = 61   one
 *
 * This door's soft drop is a repeat rate rather than a gravity override: the
 * input handler fires `soft_drop` on its own clock and each one moves the
 * piece a cell. The reference's ratios carry over exactly - a system that
 * falls at half speed repeats at half the rate.
 *
 * PlayerSettings.softDropSpeed is the player's own rate in cells per second.
 * It has a settings row and a saved value, and until this module existed it
 * was read by NOTHING: the handler always used the fixed TIMING.SOFT_DROP_RATE
 * of 50 ms, so every value from 1 to 40 played identically. The default of 20
 * is exactly that 50 ms, so nothing changes for a player who never touched it.
 */
import type { RotationSystem } from './types';
/** Cells per second when the setting is absent (TIMING.SOFT_DROP_RATE = 50ms). */
export declare const DEFAULT_SOFT_DROP_SPEED = 20;
/** The reference's per-system multiplier (world.c:401-408). */
export declare function softDropFactor(rotationSystem: RotationSystem): number;
/**
 * Milliseconds between soft-drop repeats. Clamped to a sane range so a
 * corrupt or hand-edited setting cannot stall the piece or flood the engine.
 */
export declare function softDropIntervalMs(softDropSpeed: number | undefined, rotationSystem: RotationSystem): number;
//# sourceMappingURL=soft-drop.d.ts.map