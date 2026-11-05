/**
 * Is this lock a T-Spin, and which kind?
 *
 * Lifted out of `core/game.ts` unchanged (2026-09-15): the rule is a
 * geometric question about one piece and one board, it answers with no side
 * effects, and MISSION mode now cares about the DIFFERENCE between the two
 * kinds rather than just "was there one" - which makes it worth being able
 * to test on its own.
 *
 * The rule is HeborisCE's: `tspin_flag` set by a rotation that was not
 * followed by a move, three of the four corners around the T's centre
 * filled, and both FRONT corners filled for the full spin rather than a
 * mini. ARS shifts the sampled corners down a row when the T is flat-side
 * down (`gamestart.c`: `if(rt == 2) tmp_y = tmp_y + 1`).
 */
import type { Board, Piece } from './types';
export interface TSpinInput {
    /** The live piece. Anything but a T is never a T-Spin. */
    piece: Piece | null;
    board: Board;
    /** HeborisCE's `tspin_flag`: a rotation happened and nothing moved after. */
    tSpinFlag: number;
    /** How many rotations this piece has had (`statusc[...+5]`). */
    rotationCount: number;
    /** What the player did last; only a rotation can leave a spin. */
    lastMove: string | null | undefined;
    /** ARS samples one corner pair a row lower when the T is flat-side down. */
    rotationSystem: string;
}
export declare function detectTSpin(input: TSpinInput): 'full' | 'mini' | 'none';
//# sourceMappingURL=tspin.d.ts.map