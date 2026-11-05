"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTetriNetResult = buildTetriNetResult;
/**
 * GameResult view of a finished TetriNET game.
 *
 * `completed` marks a WIN - outliving every opponent - which is what the
 * high score table and the score server treat as finishing the mode, as
 * opposed to topping out.
 */
function buildTetriNetResult(state) {
    const won = state.status === 'won';
    const time = state.startTime && state.endTime
        ? state.endTime - state.startTime
        : null;
    return {
        mode: 'tetrinet',
        score: state.score,
        level: state.level,
        lines: state.lines,
        linesCleared: state.lines,
        // TetriNET has no grade system; the outcome goes here so the Discord
        // embed's Grade field says something true rather than a TGM letter.
        grade: won ? 'WIN' : 'OUT',
        time,
        combo: state.combo,
        tetrisCount: 0,
        tSpinCount: 0,
        perfectClears: 0,
        completed: won,
    };
}
//# sourceMappingURL=score-report.js.map