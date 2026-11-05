/**
 * What a run is worth when it ends.
 *
 * Lifted out of `core/game.ts` unchanged (2026-09-15) to keep that file under
 * its cap. It is a summary of state and three counters and nothing else - no
 * board, no piece, no decision.
 */
import type { GameResult, GameState } from './types';
/** The counters the engine keeps beside the state. */
export interface RunCounters {
    tetrisCount: number;
    tSpinCount: number;
    perfectClearCount: number;
    finesseErrors: number;
    finesseErrorRate: number;
}
export declare function buildResult(state: GameState, counters: RunCounters): GameResult;
//# sourceMappingURL=game-result.d.ts.map