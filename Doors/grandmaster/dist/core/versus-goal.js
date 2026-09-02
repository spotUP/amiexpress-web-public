"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VERSUS_GOAL = void 0;
exports.versusGoalTarget = versusGoalTarget;
exports.versusGoalReached = versusGoalReached;
/** init.c:115 `def_vs_goal = 200`. */
exports.DEFAULT_VERSUS_GOAL = 200;
/** What a run has to reach for this win type, or null when there is no goal. */
function versusGoalTarget(winType, goal) {
    if (winType === 'survival' || goal <= 0)
        return null;
    // GOAL LINE is vs_goal/10 lines (gamestart.c:9507 `li[player] >= vs_goal/10`).
    return winType === 'lines' ? Math.floor(goal / 10) : goal;
}
/**
 * Has this run reached the goal? `level` and `lines` are the run's own
 * counters - the same two the reference tests (tc[player], li[player]).
 */
function versusGoalReached(winType, goal, run) {
    const target = versusGoalTarget(winType, goal);
    if (target === null)
        return false;
    return winType === 'lines' ? run.lines >= target : run.level >= target;
}
//# sourceMappingURL=versus-goal.js.map