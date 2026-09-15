/**
 * The credit roll's own rules: who gets bone blocks, and what the roll is
 * worth when it ends.
 *
 * Lifted out of `core/game.ts` unchanged (2026-09-15) to keep that file under
 * its cap. All three are decisions rather than machinery - a probability
 * table, a start, and a grade at the end - and none of them touches a piece
 * or a board.
 */
import type { GameState } from './types';
/** `atLeastS13` is the grade manager's answer; below it, nobody gets any. */
export declare function boneBlockChance(grade: string, atLeastS13: boolean): number;
/** What the state carries while the roll runs. */
interface CreditRollManager {
    start(level: number): void;
    getState(): {
        startTime: number;
        timeRemaining: number;
    };
    isQualified(): boolean;
}
/** Begin the roll, and copy its clock into the state the screen reads. */
export declare function startCreditRoll(state: GameState, manager: CreditRollManager): void;
/**
 * End it, and award the rank.
 *
 * GM for a roll survived on the invisible field, M for one that was not -
 * the roll is the last thing standing between Master and Grand Master.
 */
export declare function completeCreditRoll(state: GameState, manager: CreditRollManager): void;
export {};
//# sourceMappingURL=credit-roll-rules.d.ts.map