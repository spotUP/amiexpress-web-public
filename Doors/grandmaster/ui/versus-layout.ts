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
  /** How many go to the minimap grid instead. */
  minimaps: number;
  /** Whether the 1v1 VS/attack panel fits beside them. */
  showInfo: boolean;
  /** Where the opponent boards start, in columns. */
  left: number;
  /** Columns each full board occupies. */
  boardWidth: number;
}

/**
 * Humans get the boards; bots get miniatures if that is what it takes.
 *
 * "the normal case is probably that we have enough room for all human
 * players" - which is the observation the whole rule turns on. A match can
 * carry many CPU opponents, and forcing everyone to miniatures because eight
 * bots will not fit wastes a wide terminal on the two people actually
 * playing. So: fit everyone if everyone fits, otherwise fit the humans, and
 * only fall back to an all-miniature grid when even they do not.
 *
 * Within a group it stays all-or-nothing. Showing two humans full and a
 * third as a miniature would say something false about the match - the
 * player would read the two as the threats.
 */
export function versusLayout(
  screenWidth: number,
  humanCount: number,
  botCount: number = 0,
): VersusLayout {
  const total = Math.max(0, humanCount) + Math.max(0, botCount);
  const base: VersusLayout = {
    fullBoards: 0,
    minimaps: total,
    showInfo: false,
    left: LEFT_PANEL_COLS,
    boardWidth: OPPONENT_BOARD_COLS,
  };

  if (total <= 0) return { ...base, minimaps: 0 };

  const available = Math.max(0, screenWidth - LEFT_PANEL_COLS);
  const fits = (n: number): boolean => {
    if (n <= 0) return false;
    // A lone opponent is the classic 1v1 and wants the VS panel beside it,
    // but the board matters more than the numbers: below that, board only.
    if (n === 1) return available >= OPPONENT_BOARD_COLS;
    return Math.floor(available / OPPONENT_BOARD_COLS) >= n;
  };

  if (fits(total)) {
    return {
      ...base,
      fullBoards: total,
      minimaps: 0,
      showInfo: total === 1 && available >= OPPONENT_BOARD_COLS + VS_INFO_COLS,
    };
  }

  if (humanCount > 0 && fits(humanCount)) {
    return {
      ...base,
      fullBoards: humanCount,
      minimaps: total - humanCount,
      showInfo: humanCount === 1 && total === 1
        && available >= OPPONENT_BOARD_COLS + VS_INFO_COLS,
    };
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
