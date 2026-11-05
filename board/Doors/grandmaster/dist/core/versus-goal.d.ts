/**
 * VS WIN TYPE - how a versus match is won.
 *
 * HeborisCE's versus setup screen offers three (gamestart.c:12755-12765,
 * "WIN TYPE"):
 *
 *   wintype 0  GOAL LV    - first to vs_goal levels (gamestart.c:9489-9504)
 *   wintype 1  GOAL LINE  - first to vs_goal/10 lines (gamestart.c:9505-9519)
 *   wintype 2  SURVIVAL   - no goal; last player standing
 *
 * Reaching the goal is not a score bonus: the reference sets the OPPONENT's
 * status to 7 (game over) on the spot. vs_goal defaults to 200
 * (init.c:115 def_vs_goal), so GOAL LINE's default is 20 lines.
 *
 * This door only ever played SURVIVAL, which is why the setting defaults to
 * it: an existing player's versus match behaves exactly as before.
 */
export type VersusWinType = 'survival' | 'level' | 'lines';
/** init.c:115 `def_vs_goal = 200`. */
export declare const DEFAULT_VERSUS_GOAL = 200;
/** What a run has to reach for this win type, or null when there is no goal. */
export declare function versusGoalTarget(winType: VersusWinType, goal: number): number | null;
/**
 * Has this run reached the goal? `level` and `lines` are the run's own
 * counters - the same two the reference tests (tc[player], li[player]).
 */
export declare function versusGoalReached(winType: VersusWinType, goal: number, run: {
    level: number;
    lines: number;
}): boolean;
//# sourceMappingURL=versus-goal.d.ts.map