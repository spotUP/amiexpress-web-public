/**
 * The shared arcade shell.
 *
 * Pieces every arcade door needs and each had its own copy of. Starting with
 * the main menu; the plan's other pieces (manual pager, leaderboard, attract
 * state machine, per-user settings) belong here too.
 */

export {
  arcadeMenu,
  moveSelection,
  optionText,
  visibleLength,
  DEFAULT_HINT,
  MENU_COLORS,
} from './menu';
export type { ArcadeMenuSpec, MenuOption } from './menu';
