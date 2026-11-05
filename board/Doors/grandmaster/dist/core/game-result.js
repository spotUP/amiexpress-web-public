"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildResult = buildResult;
function buildResult(state, counters) {
    const time = state.endTime && state.startTime
        ? state.endTime - state.startTime
        : null;
    return {
        mode: state.mode,
        score: state.score,
        level: state.level,
        lines: state.lines,
        linesCleared: state.lines,
        grade: state.grade,
        time,
        combo: state.combo,
        tetrisCount: counters.tetrisCount,
        tSpinCount: counters.tSpinCount,
        perfectClears: counters.perfectClearCount,
        completed: state.status === 'complete',
        finesseRate: 1 - counters.finesseErrorRate,
        finesseErrors: counters.finesseErrors,
    };
}
//# sourceMappingURL=game-result.js.map