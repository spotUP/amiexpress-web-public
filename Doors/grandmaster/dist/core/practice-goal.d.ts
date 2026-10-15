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
export type PracticeGoalType = 'none' | 'level' | 'lines' | 'pieces' | 'time';
/** gamestart.c:745 `p_goaltypenumlist[10]`. */
export declare const PRACTICE_GOAL_VALUES: readonly number[];
export interface PracticeGoal {
    type: PracticeGoalType;
    /** One of PRACTICE_GOAL_VALUES; seconds for 'time', levels/10 for 'level'. */
    value: number;
}
export interface PracticeProgress {
    level: number;
    lines: number;
    pieces: number;
    elapsedSeconds: number;
}
/** What the run has to reach, in the units the HUD shows. */
export declare function practiceGoalTarget(goal: PracticeGoal): number | null;
export declare function practiceGoalReached(goal: PracticeGoal, run: PracticeProgress): boolean;
//# sourceMappingURL=practice-goal.d.ts.map