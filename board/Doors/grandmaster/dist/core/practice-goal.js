"use strict";
/**
 * PRACTICE goals - how a training run ends.
 *
 * HeborisCE's practice mode (gameMode 5) ends on one of five conditions,
 * chosen in its setup screen (gamestart.c:743-745, 11229-11252):
 *
 *   p_goaltype 0  none    - play until you top out
 *   p_goaltype 1  level   - `tc >= p_goaltypenumlist[n] * 10`
 *   p_goaltype 2  lines   - `li >= p_goaltypenumlist[n]`
 *   p_goaltype 3  blocks  - `bdowncnt >= p_goaltypenumlist[n]` (pieces placed)
 *   p_goaltype 4  time    - a countdown, `ltime <= 0` (gamestart.c:4781-4788)
 *
 * and the value comes from one shared list, p_goaltypenumlist
 * (gamestart.c:745). Note the level goal multiplies it by ten: picking 30
 * means level 300, while picking 30 for lines means thirty lines.
 *
 * This door's training mode had a start level and nothing else - a run went
 * on until the player topped out or quit.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRACTICE_GOAL_VALUES = void 0;
exports.practiceGoalTarget = practiceGoalTarget;
exports.practiceGoalReached = practiceGoalReached;
/** gamestart.c:745 `p_goaltypenumlist[10]`. */
exports.PRACTICE_GOAL_VALUES = [5, 10, 20, 30, 50, 75, 100, 130, 160, 200];
/** What the run has to reach, in the units the HUD shows. */
function practiceGoalTarget(goal) {
    if (goal.type === 'none' || goal.value <= 0)
        return null;
    // gamestart.c:11231 - the level goal is the list value times ten.
    return goal.type === 'level' ? goal.value * 10 : goal.value;
}
function practiceGoalReached(goal, run) {
    const target = practiceGoalTarget(goal);
    if (target === null)
        return false;
    switch (goal.type) {
        case 'level': return run.level >= target;
        case 'lines': return run.lines >= target;
        case 'pieces': return run.pieces >= target;
        case 'time': return run.elapsedSeconds >= target;
        default: return false;
    }
}
//# sourceMappingURL=practice-goal.js.map