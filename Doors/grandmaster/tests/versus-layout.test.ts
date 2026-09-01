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
  versusLayout, boardLeft, boardPosition, widthForFullBoards,
  LEFT_PANEL_COLS, OPPONENT_BOARD_COLS, OPPONENT_BOARD_ROWS, VS_INFO_COLS,
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
    assert.strictEqual(versusLayout(80, count, 0).fullBoards, 0,
      `${count} opponents do not fit in 80 columns and must stay miniatures`);
  }
}

export async function aWideTerminalShowsEveryOpponentInFull(): Promise<void> {
  assert.strictEqual(versusLayout(103, 3).fullBoards, 3); // 37 + 3*22
  assert.strictEqual(versusLayout(160, 5).fullBoards, 5);
}

export async function humansGetTheBoardsAndBotsTakeTheMiniatures(): Promise<void> {
  // "the normal case is probably that we have enough room for all human
  // players." A match with two people and six bots should not force the
  // people into miniatures because the bots do not fit.
  const wide = versusLayout(120, 2, 6);
  assert.strictEqual(wide.fullBoards, 2, 'both humans get boards');
  assert.strictEqual(wide.minimaps, 6, 'the bots go to the grid');

  // If everyone fits, everyone gets a board - bots included.
  const veryWide = versusLayout(220, 2, 6);
  assert.strictEqual(veryWide.fullBoards, 8);
  assert.strictEqual(veryWide.minimaps, 0);

  // And when even the humans do not fit, nobody does.
  const narrow = versusLayout(80, 2, 6);
  assert.strictEqual(narrow.fullBoards, 0);
  assert.strictEqual(narrow.minimaps, 8);
}

export async function anAllBotMatchStillBehavesAsItDidAtEighty(): Promise<void> {
  // CPU Battle: no humans among the opponents at all.
  assert.strictEqual(versusLayout(80, 0, 3).fullBoards, 0);
  assert.strictEqual(versusLayout(103, 0, 3).fullBoards, 3, 'room means boards, human or not');
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

/**
 * The cascade: boards, then bars, then a leaderboard.
 *
 * "top few as boards, some minimaps and the rest as list" (2026-09-01), for
 * the field a battle royale actually has. 98 opponents is 2,156 columns of
 * board, so the question stops being "who fits" and becomes "what is the
 * most each column can say about the players closest to killing you".
 */
export async function aHugeFieldCascadesInsteadOfBecomingOneList(): Promise<void> {
  const wide = versusLayout(160, 0, 98);
  assert.strictEqual(wide.fullBoards, 3, 'the top few get playfields');
  assert.ok(wide.minimaps > 0, 'the next handful get danger bars');
  assert.ok(wide.listed > 0, 'and the rest are a ranked list');
  assert.strictEqual(wide.fullBoards + wide.minimaps + wide.listed, 98,
    'everyone is somewhere - nobody is silently dropped');
}

export async function theCascadesSectionsDoNotOverlap(): Promise<void> {
  for (const width of [95, 100, 120, 160, 200, 240]) {
    const l = versusLayout(width, 0, 98);
    if (l.listed === 0) continue;   // not cascading at this width
    const boardsEnd = LEFT_PANEL_COLS + l.fullBoards * OPPONENT_BOARD_COLS;
    assert.strictEqual(l.minimapLeft, boardsEnd, `${width}: bars start after the boards`);
    assert.strictEqual(l.listLeft, l.minimapLeft + l.minimapWidth,
      `${width}: the list starts after the bars`);
    assert.ok(l.listLeft + l.listWidth <= width,
      `${width}: nothing runs off the right edge (ends at ${l.listLeft + l.listWidth})`);
  }
}

export async function eightyColumnsNeverCascades(): Promise<void> {
  // All three sections need 37 + 22 + 14 + 22 before the first board is
  // worth drawing, so the caller on a board-sized terminal sees exactly
  // what they saw before any of this.
  const narrow = versusLayout(80, 0, 98);
  assert.strictEqual(narrow.fullBoards, 0);
  assert.strictEqual(narrow.listed, 0, 'one grid panel, as always');
  assert.strictEqual(narrow.minimaps, 98);
}

export async function aSmallFieldIsNeverCascaded(): Promise<void> {
  // Three opponents at 102 columns is the all-or-nothing case, and it stays
  // that way: two boards and a miniature would read as "these two are the
  // threats". The cascade is for a field nobody could draw in full.
  const three = versusLayout(102, 0, 3);
  assert.strictEqual(three.fullBoards, 0);
  assert.strictEqual(three.listed, 0);

  const five = versusLayout(160, 0, 5);
  assert.strictEqual(five.fullBoards, 5, 'five still fit as boards at 160');
  assert.strictEqual(five.listed, 0);
}

export async function theBarsStopWhereTheyStopSayingAnything(): Promise<void> {
  // Ten is the readable limit for bars however wide the panel is; the room
  // past that belongs to the list.
  const enormous = versusLayout(400, 0, 98);
  assert.ok(enormous.minimaps <= 10, `bars are capped, saw ${enormous.minimaps}`);
  assert.ok(enormous.listed > 0);
}

export async function theHumansAreStillFirstInLine(): Promise<void> {
  // Two people and 96 CPUs: the people fit as boards, so they get them and
  // the cascade never runs.
  const l = versusLayout(160, 2, 96);
  assert.strictEqual(l.fullBoards, 2);
  assert.strictEqual(l.minimaps, 96);
  assert.strictEqual(l.listed, 0);
}

/**
 * Boards fill a grid, because a tall window has room for more than a row.
 *
 * "we have shitloads of space left for full playfields in gmaster battle
 * royale" - a 192x55 terminal was drawing three boards in a 22-row strip
 * and leaving the other thirty rows black. Three was a cap, not a
 * measurement, and one row was an assumption.
 */
export async function aTallWindowStacksBoardsIntoAGrid(): Promise<void> {
  const tall = versusLayout(192, 0, 98, 55);
  assert.strictEqual(tall.boardRows, 2, '55 rows hold two 22-row boards');
  assert.ok(tall.fullBoards >= 8,
    `a 192x55 window should hold a column of boards per 22 columns, saw ${tall.fullBoards}`);
  assert.strictEqual(tall.fullBoards % tall.boardRows, 0,
    'the columns that are drawn are drawn full - no ragged hole in the field');
}

export async function theBoardsGoDownEachColumnThenAcross(): Promise<void> {
  // The closest opponents are the leftmost, next to your own board.
  assert.deepStrictEqual(boardPosition(0, 2), { left: 37, top: 1 });
  assert.deepStrictEqual(boardPosition(1, 2), { left: 37, top: 23 });
  assert.deepStrictEqual(boardPosition(2, 2), { left: 59, top: 1 });
  assert.deepStrictEqual(boardPosition(3, 2), { left: 59, top: 23 });
  // One row is the old behaviour, exactly.
  assert.deepStrictEqual(boardPosition(0, 1), { left: 37, top: 1 });
  assert.deepStrictEqual(boardPosition(2, 1), { left: 81, top: 1 });
}

export async function theSidePanelsGrowWithTheWindowToo(): Promise<void> {
  const tall = versusLayout(192, 0, 98, 55);
  assert.strictEqual(tall.panelHeight, tall.boardRows * OPPONENT_BOARD_ROWS,
    'the bars and the standings are as tall as the boards beside them');
  assert.ok(tall.panelHeight > 22, 'which on a tall window is more than one board');
}

export async function aShortWindowIsExactlyWhatItWas(): Promise<void> {
  const classic = versusLayout(80, 1, 0, 25);
  assert.strictEqual(classic.boardRows, 1);
  assert.strictEqual(classic.fullBoards, 1);
  assert.strictEqual(classic.panelHeight, OPPONENT_BOARD_ROWS);
}
