/**
 * How fast the solo modes play.
 *
 * A caller's first game felt sluggish - "the animation when they disappear is
 * very slow" - and the reason was a default, not a bug. ENDLESS ran on classic
 * NORMAL, where a three-panel match spends 36 frames flashing, 13 showing its
 * face and 8 popping each panel: 73 frames, one and a fifth SECONDS, before
 * the board moves again. That is the second-slowest of the four.
 *
 * The numbers themselves are not ours to change. They are panel-attack's, and
 * two frame-exact replays and 234 recorded puzzle solutions are pinned to
 * them; editing the table to feel snappier would falsify every one of those
 * oracles and the port would no longer be a port. The original's own answer is
 * the right one: OFFER THE CHOICE. Tetris Attack's Endless has easy, normal
 * and hard, and this adds the EX speed panel-attack ships as a fourth.
 *
 * The list opens on HARD rather than on the slowest row, because a player who
 * has just chosen TETRIS ATTACK from a menu wants to play it, not to configure
 * it, and hard is where the game starts feeling like the arcade.
 */

import type { ChooserRow } from './chooser';
import type { ClassicDifficulty } from '../../core/panels/level-data';

/** The rows, and the difficulty each one selects. Index-aligned. */
export const DIFFICULTY_ROWS: readonly ChooserRow[] = [
  { wide: 'EASY       gentle rise, long clears', compact: 'EASY' },
  { wide: 'NORMAL     the arcade default', compact: 'NORMAL' },
  { wide: 'HARD       quicker clears, faster rise', compact: 'HARD' },
  { wide: 'VERY HARD  EX speed, for chaining', compact: 'VERY HARD' },
];

export const DIFFICULTY_VALUES: readonly ClassicDifficulty[] = [
  'easy', 'normal', 'hard', 'ex',
];

/** Where the list opens. */
export const DEFAULT_DIFFICULTY: ClassicDifficulty = 'hard';

export function defaultDifficultyIndex(): number {
  return DIFFICULTY_VALUES.indexOf(DEFAULT_DIFFICULTY);
}
