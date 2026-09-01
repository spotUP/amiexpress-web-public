/**
 * How many opponents can be shown as FULL boards, given the width.
 *
 * The versus screen has always decided this by counting opponents: one
 * opponent gets a full board, more than one gets a grid of miniatures. That
 * was right when every caller had exactly 80 columns. Now a door can ask the
 * terminal to widen, and the sysop's point stands - "it can have MANY
 * playfields that are forced to miniature maps today" - so the question is
 * how many boards FIT, not how many exist.
 *
 * Kept as a pure function because the versus screen is two thousand lines of
 * widgets and timers, and the interesting decision here is arithmetic.
 */

/** Player board (22) + NEXT/HOLD column (12) + garbage strip (3). */
export const LEFT_PANEL_COLS = 37;

/** One opponent board, borders included - the geometry the screen already uses. */
export const OPPONENT_BOARD_COLS = 22;

/** The 1v1 VS/attack panel beside a single opponent. */
export const VS_INFO_COLS = 21;

export interface VersusLayout {
  /** How many opponents to draw as full boards. Zero means the minimap grid. */
  fullBoards: number;
  /** Whether the 1v1 VS/attack panel fits beside them. */
  showInfo: boolean;
  /** Where the opponent boards start, in columns. */
  left: number;
  /** Columns each full board occupies. */
  boardWidth: number;
}

/**
 * All-or-nothing, deliberately.
 *
 * Showing two of five opponents full-size and the other three as miniatures
 * would say something false about the match: the player would read the two
 * as the threats. Either every opponent gets a board or none does, which
 * also means an 80-column caller sees exactly what they see today - one
 * opponent full with the VS panel, more than one as the minimap grid.
 */
export function versusLayout(screenWidth: number, opponentCount: number): VersusLayout {
  const base: VersusLayout = {
    fullBoards: 0,
    showInfo: false,
    left: LEFT_PANEL_COLS,
    boardWidth: OPPONENT_BOARD_COLS,
  };

  if (opponentCount <= 0) return base;

  const available = Math.max(0, screenWidth - LEFT_PANEL_COLS);

  // One opponent: the classic 1v1, with the VS panel if there is room for it.
  if (opponentCount === 1) {
    if (available >= OPPONENT_BOARD_COLS + VS_INFO_COLS) {
      return { ...base, fullBoards: 1, showInfo: true };
    }
    if (available >= OPPONENT_BOARD_COLS) {
      return { ...base, fullBoards: 1, showInfo: false };
    }
    return base;
  }

  // Several: only if they ALL fit.
  const fit = Math.floor(available / OPPONENT_BOARD_COLS);
  if (fit >= opponentCount) {
    return { ...base, fullBoards: opponentCount, showInfo: false };
  }
  return base;
}

/** Where the Nth full opponent board starts. */
export function boardLeft(index: number): number {
  return LEFT_PANEL_COLS + index * OPPONENT_BOARD_COLS;
}

/** The narrowest terminal that shows `count` opponents as full boards. */
export function widthForFullBoards(count: number): number {
  if (count <= 0) return LEFT_PANEL_COLS;
  if (count === 1) return LEFT_PANEL_COLS + OPPONENT_BOARD_COLS + VS_INFO_COLS;
  return LEFT_PANEL_COLS + count * OPPONENT_BOARD_COLS;
}
