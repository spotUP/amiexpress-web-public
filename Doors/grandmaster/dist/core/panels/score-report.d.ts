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
export type PanelsMode = 'endless' | 'timeattack' | 'vscpu' | 'challenge' | 'puzzle' | 'stageclear' | 'vsplayer' | 'replays';
/**
 * The score a panel game reports.
 *
 * `level` is the stack's SPEED, which is the number the original shows and the
 * one that means something to a player: it climbs from 1 to 99 and is what
 * makes a game get hard. `lines` is panels cleared - the nearest honest
 * equivalent, and the number the mode is actually about.
 */
export declare function buildPanelsResult(stack: Stack, mode: PanelsMode, gameMode?: GameMode, completed?: boolean): GameResult;
//# sourceMappingURL=score-report.d.ts.map