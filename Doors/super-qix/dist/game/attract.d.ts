/**
 * The attract mode.
 *
 * A cabinet left alone does not sit on a menu - it cycles: what the game is
 * worth, who has done best at it, and an invitation to play. Asked for as
 * "the arcade's, with a blinking 'press button' in place of 'insert coin'":
 * a BBS door has no coin slot, so entering the door IS the coin and the
 * invitation asks for a key instead.
 *
 * Frogger's attract is the model this follows, down to the tick-counted
 * phases and the blink measured in frames rather than wall-clock, so the two
 * doors behave the same way when the board is idle.
 */
import { HighScore, SuperQixData } from './types';
export type AttractPhase = 'points' | 'ranking' | 'invite';
export declare const ATTRACT_ORDER: AttractPhase[];
/** How long each panel stays up, in game ticks (~30 per second). */
export declare const ATTRACT_FRAMES: Record<AttractPhase, number>;
/** How fast the invitation blinks, in ticks per state. */
export declare const ATTRACT_BLINK_FRAMES = 12;
/** How long the menu sits untouched before the cabinet takes over, in ticks. */
export declare const ATTRACT_IDLE_FRAMES = 300;
/** What the game pays for, straight from the scoring constants. */
export declare function pointTablePanel(width: number): string[];
/** The board's best, as the cabinet shows it between rounds. */
export declare function rankingPanel(scores: HighScore[], width: number): string[];
/**
 * The invitation.
 *
 * The cabinet blinks INSERT COIN here. Nobody is putting a coin in a BBS, so
 * it asks for a key - and it blinks, because a still line in an attract loop
 * reads as a crashed door rather than an invitation.
 */
export declare function invitePanel(data: SuperQixData, width: number, blinkOn: boolean): string[];
/** The credit line under every panel. */
export declare function creditLine(width: number): string;
/** One attract screen, ready to render. */
export declare function attractScreen(phase: AttractPhase, data: SuperQixData, width: number, frame: number): string[];
/** The phase that follows this one. */
export declare function nextPhase(phase: AttractPhase): AttractPhase;
//# sourceMappingURL=attract.d.ts.map