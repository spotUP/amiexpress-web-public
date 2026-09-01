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

/**
 * The cascade: boards, then bars, then a leaderboard.
 *
 * A 99-player battle royale can never be all boards - 98 of them is 2,156
 * columns - and a leaderboard alone throws away a wide terminal. "top few
 * as boards, some minimaps and the rest as list" (2026-09-01), which is
 * also how the field reads: the two closest to killing you get playfields,
 * the next handful get danger bars, and the rest are a ranked list.
 *
 * It is a WIDE-terminal shape by arithmetic rather than by rule: all three
 * sections need 37 + 22 + 14 + 22 columns before the first board is worth
 * drawing, which no 80-column caller has. At 80 the screen behaves exactly
 * as it did.
 */
export const CASCADE_MAX_BOARDS = 3;

/** A bucket bar and its separator - the minimap grid's own geometry. */
export const BUCKET_SLOT_COLS = 4;

/** Bars are not worth a section below three of them, borders included. */
export const MIN_BUCKETS_COLS = 3 * BUCKET_SLOT_COLS + 2;

/** One leaderboard column: rank, name, level, height, plus borders. */
export const LIST_COLUMN_COLS = 20;
export const MIN_LIST_COLS = LIST_COLUMN_COLS + 2;

/** Bars stop being readable past this many, however wide the panel is. */
export const MAX_BUCKETS = 10;

/**
 * A field this size cannot be shown in full at any width, so the cascade
 * is honest about ranking it rather than pretending to be the whole field.
 */
export const CASCADE_MIN_OPPONENTS = 6;

export interface VersusLayout {
  /** How many opponents to draw as full boards. Zero means the minimap grid. */
  fullBoards: number;
  /** How many go to the minimap grid instead. */
  minimaps: number;
  /** How many go to the leaderboard, after the boards and the bars. */
  listed: number;
  /** Whether the 1v1 VS/attack panel fits beside them. */
  showInfo: boolean;
  /** Where the opponent boards start, in columns. */
  left: number;
  /** Columns each full board occupies. */
  boardWidth: number;
  /** Where the bucket-bar panel goes, and how wide. Zero width means none. */
  minimapLeft: number;
  minimapWidth: number;
  /** Where the leaderboard goes, and how wide. Zero width means none. */
  listLeft: number;
  listWidth: number;
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
  const available = Math.max(0, screenWidth - LEFT_PANEL_COLS);

  /** Everything that is not on a board fills one grid panel, as it always did. */
  const grid = (fullBoards: number, showInfo = false): VersusLayout => {
    const left = LEFT_PANEL_COLS + fullBoards * OPPONENT_BOARD_COLS;
    const rest = total - fullBoards;
    return {
      fullBoards,
      minimaps: rest,
      listed: 0,
      showInfo,
      left: LEFT_PANEL_COLS,
      boardWidth: OPPONENT_BOARD_COLS,
      minimapLeft: rest > 0 ? left : 0,
      minimapWidth: rest > 0 ? Math.max(0, screenWidth - left - (showInfo ? VS_INFO_COLS : 0)) : 0,
      listLeft: 0,
      listWidth: 0,
    };
  };

  if (total <= 0) return { ...grid(0), minimaps: 0, minimapWidth: 0, minimapLeft: 0 };

  const fits = (n: number): boolean => {
    if (n <= 0) return false;
    // A lone opponent is the classic 1v1 and wants the VS panel beside it,
    // but the board matters more than the numbers: below that, board only.
    if (n === 1) return available >= OPPONENT_BOARD_COLS;
    return Math.floor(available / OPPONENT_BOARD_COLS) >= n;
  };

  if (fits(total)) {
    return grid(total, total === 1 && available >= OPPONENT_BOARD_COLS + VS_INFO_COLS);
  }

  if (humanCount > 0 && fits(humanCount)) {
    return grid(humanCount, humanCount === 1 && total === 1
      && available >= OPPONENT_BOARD_COLS + VS_INFO_COLS);
  }

  const cascaded = cascade(screenWidth, total);
  if (cascaded) return cascaded;

  return grid(0);
}

/**
 * Boards, then bars, then the leaderboard - or null if it does not fit.
 *
 * Only for a field too large to show any other way, and only where all
 * three sections have room. Sections are filled in priority order: a board
 * is the most information about one opponent, a bar is the next most, and
 * the list is what a hundred players look like. Anything that cannot be
 * given a section is simply not drawn, which is why each has a minimum.
 */
function cascade(screenWidth: number, total: number): VersusLayout | null {
  if (total < CASCADE_MIN_OPPONENTS) return null;

  const available = Math.max(0, screenWidth - LEFT_PANEL_COLS);
  const reserved = MIN_BUCKETS_COLS + MIN_LIST_COLS;
  if (available < OPPONENT_BOARD_COLS + reserved) return null;

  let boards = 0;
  while (
    boards < CASCADE_MAX_BOARDS
    && boards + 1 < total
    && (boards + 1) * OPPONENT_BOARD_COLS + reserved <= available
  ) {
    boards++;
  }

  const afterBoards = available - boards * OPPONENT_BOARD_COLS;
  // The bars take what they can hold, up to the point where a bar stops
  // saying anything; whatever remains is the leaderboard's.
  const barsFor = Math.min(
    MAX_BUCKETS,
    total - boards,
    Math.floor((afterBoards - MIN_LIST_COLS - 2) / BUCKET_SLOT_COLS),
  );
  const buckets = Math.max(0, barsFor);
  const bucketWidth = buckets > 0 ? buckets * BUCKET_SLOT_COLS + 2 : 0;
  const listWidth = afterBoards - bucketWidth;
  const listed = total - boards - buckets;

  if (buckets <= 0 || listed <= 0 || listWidth < MIN_LIST_COLS) return null;

  const boardsEnd = LEFT_PANEL_COLS + boards * OPPONENT_BOARD_COLS;
  return {
    fullBoards: boards,
    minimaps: buckets,
    listed,
    showInfo: false,
    left: LEFT_PANEL_COLS,
    boardWidth: OPPONENT_BOARD_COLS,
    minimapLeft: boardsEnd,
    minimapWidth: bucketWidth,
    listLeft: boardsEnd + bucketWidth,
    listWidth,
  };
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
