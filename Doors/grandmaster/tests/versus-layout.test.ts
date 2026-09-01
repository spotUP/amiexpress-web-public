/**
 * How many opponents fit as full boards.
 *
 * "grandmaster does benefit but maybe it's a special case, the playfields are
 * hardcoded but it can have MANY playfields that are forced to miniature maps
 * today." The screen decided by counting opponents; now it asks how many fit.
 *
 * The 80-column caller must see exactly what they see today - that is the
 * property most worth pinning, because widening a layout is where regressions
 * hide for the people who never widen anything.
 */

import assert from 'assert';
import {
  versusLayout, boardLeft, widthForFullBoards,
  LEFT_PANEL_COLS, OPPONENT_BOARD_COLS, VS_INFO_COLS,
} from '../ui/versus-layout';

export async function eightyColumnsBehavesExactlyAsItDoesToday(): Promise<void> {
  // One opponent: full board plus the VS panel. That is 22 + 21 = 43, and
  // 80 - 37 = 43 exactly, which is why the old layout could be written in
  // literals that happened to fit.
  const oneVsOne = versusLayout(80, 1);
  assert.strictEqual(oneVsOne.fullBoards, 1);
  assert.strictEqual(oneVsOne.showInfo, true);

  // More than one: the minimap grid, as before.
  for (const count of [2, 3, 4, 5, 8]) {
    assert.strictEqual(versusLayout(80, count).fullBoards, 0,
      `${count} opponents do not fit in 80 columns and must stay miniatures`);
  }
}

export async function aWideTerminalShowsEveryOpponentInFull(): Promise<void> {
  assert.strictEqual(versusLayout(103, 3).fullBoards, 3); // 37 + 3*22
  assert.strictEqual(versusLayout(160, 5).fullBoards, 5);
}

export async function itIsAllOrNothing(): Promise<void> {
  // 81 columns hold two boards; a third needs 103. With three opponents at
  // 81 nobody gets a full board - two full and one miniature would read as
  // "these two are the threats".
  assert.strictEqual(versusLayout(81, 2).fullBoards, 2);
  assert.strictEqual(versusLayout(81, 3).fullBoards, 0);
  assert.strictEqual(versusLayout(102, 3).fullBoards, 0);
  assert.strictEqual(versusLayout(103, 3).fullBoards, 3);
}

export async function aNarrowTerminalDropsTheInfoPanelBeforeTheBoard(): Promise<void> {
  // The opponent's board matters more than the VS numbers beside it.
  const tight = versusLayout(LEFT_PANEL_COLS + OPPONENT_BOARD_COLS, 1);
  assert.strictEqual(tight.fullBoards, 1);
  assert.strictEqual(tight.showInfo, false);

  const tighter = versusLayout(LEFT_PANEL_COLS + OPPONENT_BOARD_COLS - 1, 1);
  assert.strictEqual(tighter.fullBoards, 0, 'below one board, the minimap grid');
}

export async function noOpponentsIsNotABoard(): Promise<void> {
  assert.strictEqual(versusLayout(200, 0).fullBoards, 0);
}

export async function boardsSitSideBySideAfterTheLeftPanel(): Promise<void> {
  assert.strictEqual(boardLeft(0), LEFT_PANEL_COLS);
  assert.strictEqual(boardLeft(1), LEFT_PANEL_COLS + OPPONENT_BOARD_COLS);
  assert.strictEqual(boardLeft(2), LEFT_PANEL_COLS + 2 * OPPONENT_BOARD_COLS);
}

export async function theWidthItAsksForIsTheWidthThatWorks(): Promise<void> {
  // The two functions must agree, or the door would advertise a width its
  // own layout then refuses.
  for (const count of [1, 2, 3, 5, 8]) {
    const needed = widthForFullBoards(count);
    assert.strictEqual(versusLayout(needed, count).fullBoards, count,
      `${count} opponents should fit in the ${needed} columns claimed for them`);
  }

  // One column less means something different for a single opponent: the
  // width it asks for INCLUDES the VS panel, so losing a column drops the
  // panel and keeps the board. For two or more there is no panel to drop,
  // so a column short means nobody gets a board.
  const single = versusLayout(widthForFullBoards(1) - 1, 1);
  assert.strictEqual(single.fullBoards, 1, 'the board survives');
  assert.strictEqual(single.showInfo, false, 'the panel is what goes');

  for (const count of [2, 3, 5, 8]) {
    assert.strictEqual(versusLayout(widthForFullBoards(count) - 1, count).fullBoards, 0,
      `${count} opponents must NOT fit in one column less`);
  }
}

export async function oneOpponentClaimsRoomForTheInfoPanelToo(): Promise<void> {
  assert.strictEqual(widthForFullBoards(1), LEFT_PANEL_COLS + OPPONENT_BOARD_COLS + VS_INFO_COLS);
  assert.strictEqual(widthForFullBoards(1), 80, 'which is the board a caller already has');
}
