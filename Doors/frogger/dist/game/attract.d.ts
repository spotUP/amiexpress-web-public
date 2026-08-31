/**
 * Frogger - Attract mode
 *
 * What the cabinet shows when nobody is playing: the title over the point
 * table, then the score ranking, then the invitation to play, then the
 * machine playing itself. Any key drops out of it into the menu.
 *
 * The panels are built here as plain lines of tagged text so they can be
 * asserted without a terminal attached.
 */
import { FroggerData } from './types';
/** The order the cabinet cycles through, and how long each one holds. */
export type AttractPhase = 'points' | 'ranking' | 'invite' | 'demo';
export declare const ATTRACT_ORDER: AttractPhase[];
/** How long each panel stays up, in game ticks (20 per second). */
export declare const ATTRACT_FRAMES: Record<AttractPhase, number>;
/** How fast the invitation blinks, in ticks per state. */
export declare const ATTRACT_BLINK_FRAMES = 10;
/**
 * The title as a grid of cells: '#' for the face of the letter, '+' for the
 * shaded edge, ' ' for nothing.
 */
export declare function titleGrid(): string[];
/**
 * The title, painted as blocks of background colour rather than as '#'
 * characters: a green face with the arcade logo's yellow shading beside it.
 *
 * Drawn the way the board is drawn, so the letters read as solid shapes on
 * a terminal instead of as a wall of punctuation.
 */
export declare function titleLines(width: number): string[];
/**
 * The point table (FAQ 6.3), in the arcade's own wording and colours: the
 * headline of each rule in yellow, its qualifier under it in red.
 */
export declare function pointTablePanel(width: number): string[];
/** The score ranking, top five, highest first. */
export declare function rankingPanel(data: FroggerData, width: number): string[];
/**
 * The invitation.
 *
 * The cabinet asks for a coin and says how many frogs that buys. A BBS door
 * has no coin slot, so it asks for a key instead, and the count follows the
 * lives setting rather than being fixed.
 */
export declare function invitePanel(data: FroggerData, width: number, blinkOn: boolean): string[];
/** The credit line under every panel. */
export declare function creditLine(width: number): string;
/**
 * One attract screen, ready to render.
 *
 * `demo` has no panel of its own - the machine plays the game instead, and
 * the caller renders the board.
 */
export declare function attractScreen(phase: AttractPhase, data: FroggerData, width: number, frame: number): string[];
/** The phase that follows this one. */
export declare function nextPhase(phase: AttractPhase): AttractPhase;
//# sourceMappingURL=attract.d.ts.map