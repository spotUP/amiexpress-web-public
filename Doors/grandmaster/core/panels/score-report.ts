/**
 * Turning a finished panel game into the door's own GameResult.
 *
 * The bridge into plumbing that already exists - high scores, the leaderboard,
 * the validator - and the same job core/tetrinet/score-report.ts does for
 * TETRINET.
 *
 * Several GameResult fields are Tetris-shaped and have no panel equivalent:
 * there are no tetrises, no T-spins and no perfect clears here. They are
 * reported as zero rather than as some strained analogy, because a leaderboard
 * that claims a Panel de Pon game scored four T-spins is worse than one that
 * says none.
 */

import type { GameResult, GameMode } from '../types';
import type { Stack } from './stack';

/** Which panel mode produced this result. */
export type PanelsMode = 'endless' | 'timeattack';

/**
 * The score a panel game reports.
 *
 * `level` is the stack's SPEED, which is the number the original shows and the
 * one that means something to a player: it climbs from 1 to 99 and is what
 * makes a game get hard. `lines` is panels cleared - the nearest honest
 * equivalent, and the number the mode is actually about.
 */
export function buildPanelsResult(
  stack: Stack,
  mode: PanelsMode,
  gameMode: GameMode = 'tetris_attack',
): GameResult {
  return {
    mode: gameMode,
    score: stack.score,
    level: stack.speed,
    lines: stack.panelsCleared,
    linesCleared: stack.panelsCleared,
    // Panel de Pon has no grading system; the score is the whole story.
    grade: '',
    // Milliseconds of play, from the engine's own frame count at 60Hz.
    time: Math.round((stack.stopWatch / 60) * 1000),
    // The chain the player reached, which is the closest thing to a combo.
    combo: stack.chainCounter,
    tetrisCount: 0,
    tSpinCount: 0,
    perfectClears: 0,
    // Endless is only ever survived, never completed; Time Attack IS completed
    // by surviving to the end of the clock.
    completed: mode === 'timeattack' ? stack.ranOutOfTime : false,
  };
}
