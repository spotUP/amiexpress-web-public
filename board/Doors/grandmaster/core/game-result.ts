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

export function buildResult(state: GameState, counters: RunCounters): GameResult {
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
