/**
 * TetriNET score reporting
 *
 * A finished TetriNET game used to report NOTHING: the door's high score
 * table, the BBS score server and the door_score webhook (the Discord post)
 * are all fed from a GameResult, and the three TetriNET paths never built
 * one. broadcastScore() has carried a `'tetrinet' -> 'TetriNET'` branch the
 * whole time that nothing could reach, so the mode's leaderboard stayed
 * empty and TetriNET games never appeared in Discord alongside the other
 * doors' scores.
 *
 * The engine's state is the only source for this, so the mapping lives here
 * once instead of being rewritten at each call site.
 */
import type { GameResult } from '../types';
import type { TetriNetGameState } from './tetrinet-engine';
/**
 * GameResult view of a finished TetriNET game.
 *
 * `completed` marks a WIN - outliving every opponent - which is what the
 * high score table and the score server treat as finishing the mode, as
 * opposed to topping out.
 */
export declare function buildTetriNetResult(state: TetriNetGameState): GameResult;
//# sourceMappingURL=score-report.d.ts.map