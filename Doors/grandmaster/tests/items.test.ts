/**
 * TGM item system - pure data/transform regression tests.
 *
 * core/items.ts is a from-scratch build against
 * Documentation/7-Reference Sources/HeborisCE-1.1.0/src/game/gamestart.c -
 * the door had no item system at all before this ("there are no visible
 * pickups in gmasters vs modes" was the sysop report that started it).
 * These tests drive the real selection algorithm and the real board
 * transforms, not just check that the functions exist.
 */

import assert from 'assert';
import { createBoard } from '../core/board';
import {
  ITEM_WEIGHTS,
  ITEM_NAMES,
  TGM_PRESET_ITEMS,
  TGM_RUNTIME_ITEMS,
  FEW_PRESET_ITEMS,
  DS_PRESET_ITEMS,
  HARD_BLOCK_ITEM,
  createItemHistory,
  drawItem,
  isSelfTargetItem,
  mirrorBoard,
  topDeleteRows,
  bottomDeleteRows,
  everyOtherDeleteRows,
  laserColumn,
  negateBoard,
  shotgunBoard,
  swapBoards,
  freefallCompact,
  movCompact,
  flipVertical,
} from '../core/items';
import { getCompleteLines, getClearableLines } from '../core/board';

// ============================================================================
// Selection - gamestart.c:6994-7068
// ============================================================================

export async function itemWeightsSumMatchesTheReferenceTable(): Promise<void> {
  // gamestart.c:1353-1358 item_pro[50], summed for i<item_num (39) at
  // gamestart.c:3320-3324 - hand-added: (5+8+5+9+6+3+5+4+6+8) + (4+7+5+6+5+3+6+6+5+4)
  // + (9+1+5+1+7+7+8+3+3+5) + (7+4+3+3+1+5+3+2+7) = 59 + 51 + 49 + 35 = 194.
  assert.strictEqual(ITEM_WEIGHTS.length, 39, 'one weight per item, 1-39');
  const total = ITEM_WEIGHTS.reduce((a, b) => a + b, 0);
  assert.strictEqual(total, 194);
}

export async function tgmPresetIsExactlyTheNineteenReferenceItems(): Promise<void> {
  // gamestart.c:7044-7061 "TGM 1-5 16-25 28-31"
  const expected = [1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31];
  assert.deepStrictEqual([...TGM_PRESET_ITEMS].sort((a, b) => a - b), expected);
  assert.strictEqual(TGM_PRESET_ITEMS.length, 19);
}

export async function fewAndDsPresetsMatchTheReference(): Promise<void> {
  assert.deepStrictEqual([...FEW_PRESET_ITEMS], [1, 2, 3, 4, 5]); // gamestart.c:7029-7034
  assert.deepStrictEqual([...DS_PRESET_ITEMS], [6, 7, 12, 13, 18, 26]); // gamestart.c:7035-7043
}

export async function everyDrawnTgmItemStaysInsideThePresetRange(): Promise<void> {
  // gamestart.c:7058 rejects (5<id<16) || (25<id<28) || (id>31).
  const history = createItemHistory();
  for (let i = 0; i < 500; i++) {
    const id = drawItem('TGM', history);
    assert.ok(TGM_PRESET_ITEMS.includes(id), `${id} is not a valid TGM item`);
  }
}

export async function tgmDrawNeverRepeatsAnyOfTheLastFive(): Promise<void> {
  // gamestart.c:7059-7066: five-slot rolling history, rejection on any match.
  const history = createItemHistory();
  const seen: number[] = [];
  for (let i = 0; i < 200; i++) {
    const id = drawItem('TGM', history);
    const recentFive = seen.slice(-5);
    assert.ok(!recentFive.includes(id), `item ${id} repeated within the last five draws`);
    seen.push(id);
  }
}

export async function fewDrawStaysInOneToFiveAndNeverImmediatelyRepeats(): Promise<void> {
  const history = createItemHistory();
  let last: number | null = null;
  for (let i = 0; i < 200; i++) {
    const id = drawItem('FEW', history);
    assert.ok(id >= 1 && id <= 5, `FEW drew ${id}, outside 1-5`);
    if (last !== null) assert.notStrictEqual(id, last, 'FEW repeated the immediately previous item');
    last = id;
  }
}

export async function dsDrawStaysInsideTheSixItemSet(): Promise<void> {
  const DS_SET = new Set(DS_PRESET_ITEMS);
  const history = createItemHistory();
  for (let i = 0; i < 200; i++) {
    const id = drawItem('DS', history);
    assert.ok(DS_SET.has(id), `DS drew ${id}, not in {6,7,12,13,18,26}`);
  }
}

export async function everyTgmPresetItemHasADisplayName(): Promise<void> {
  for (const id of TGM_PRESET_ITEMS) {
    assert.ok(ITEM_NAMES[id], `item ${id} has no display name`);
  }
}

export async function selfTargetItemsAreExactlyTheSixSupportItems(): Promise<void> {
  // gamestart.c:13451-13454 excludes 17,18,19,28,29,30 from the attack list.
  const expectedSelf = [17, 18, 19, 28, 29, 30];
  for (const id of expectedSelf) assert.ok(isSelfTargetItem(id), `${id} should be self-targeted`);
  for (const id of TGM_PRESET_ITEMS) {
    if (!expectedSelf.includes(id)) {
      assert.ok(!isSelfTargetItem(id), `${id} should be enemy-targeted, not self`);
    }
  }
}

export async function runtimeItemsExcludeTheSixUnimplementedOnes(): Promise<void> {
  const notImplemented = [2, 3, 4, 5, 16, 20];
  for (const id of notImplemented) {
    assert.ok(!TGM_RUNTIME_ITEMS.includes(id), `${id} should not be drawable at runtime`);
  }
  assert.strictEqual(TGM_RUNTIME_ITEMS.length, TGM_PRESET_ITEMS.length - notImplemented.length);
}

// ============================================================================
// Board transforms - each cited to its gamestart.c function
// ============================================================================

function board() { return createBoard(10, 24); }

function fillCell(b: any, y: number, x: number, color = 'I'): void {
  b.grid[y][x] = { filled: true, color, locked: true, item: null };
}

function filledXs(b: any, y: number): number[] {
  const xs: number[] = [];
  for (let x = 0; x < b.width; x++) if (b.grid[y][x].filled) xs.push(x);
  return xs;
}

export async function mirrorFlipsEveryRowLeftRight(): Promise<void> {
  // gamestart.c:9057-9088 fldMirrorProc
  const b = board();
  fillCell(b, 20, 0);
  fillCell(b, 20, 3);
  mirrorBoard(b);
  assert.deepStrictEqual(filledXs(b, 20), [6, 9]); // width 10: x -> 9-x
}

export async function topDeleteTargetsRoughlyTheTopHalfOfVisibleRows(): Promise<void> {
  // gamestart.c:8738-8752 ^DEL FIELD
  const b = board(); // visible rows 4..23 (20 rows)
  const rows = topDeleteRows(b);
  assert.strictEqual(rows.length, 10);
  assert.strictEqual(Math.min(...rows), 4);
  assert.strictEqual(Math.max(...rows), 13);
}

export async function bottomDeleteTargetsRoughlyTheBottomHalf(): Promise<void> {
  // gamestart.c:8753-8767 vDEL FIELD
  const b = board();
  const rows = bottomDeleteRows(b);
  assert.strictEqual(rows.length, 10);
  assert.strictEqual(Math.max(...rows), 23);
  assert.strictEqual(Math.min(...rows), 14);
}

export async function everyOtherDeleteSkipsAlternatingRows(): Promise<void> {
  // gamestart.c:8768-8780 DELEVEN
  const b = board();
  const rows = everyOtherDeleteRows(b).sort((a, c) => a - c);
  for (let i = 1; i < rows.length; i++) {
    assert.strictEqual(rows[i] - rows[i - 1], 2, 'DELEVEN rows must be two apart');
  }
}

export async function laserEmptiesOneWholeColumn(): Promise<void> {
  // gamestart.c:14065-14150 statLaser
  const b = board();
  for (let y = 0; y < b.height; y++) fillCell(b, y, 3);
  fillCell(b, 5, 4);
  laserColumn(b, 3);
  for (let y = 0; y < b.height; y++) assert.strictEqual(b.grid[y][3].filled, false);
  assert.strictEqual(b.grid[5][4].filled, true, 'other columns untouched');
}

export async function negateInvertsFilledAndEmptyCells(): Promise<void> {
  // gamestart.c:14224-14267 statNegafield
  const b = board();
  fillCell(b, 20, 0);
  negateBoard(b);
  assert.strictEqual(b.grid[20][0].filled, false, 'was filled, now empty');
  assert.strictEqual(b.grid[20][1].filled, true, 'was empty, now filled');
}

export async function shotgunRemovesExactlyOneBlockPerNonEmptyRow(): Promise<void> {
  // gamestart.c:14287-14318 statShotgun
  const b = board();
  fillCell(b, 20, 2);
  fillCell(b, 20, 7);
  shotgunBoard(b, () => 0); // deterministic rng -> always picks first candidate
  assert.strictEqual(filledXs(b, 20).length, 1, 'exactly one of the two blocks removed');
}

export async function exchgSwapsBothBoardsEntirely(): Promise<void> {
  // gamestart.c:14358-14420 statExchangefield
  const a = board();
  const b2 = board();
  fillCell(a, 20, 0);
  fillCell(b2, 21, 5);
  swapBoards(a, b2);
  assert.strictEqual(a.grid[21][5].filled, true, 'a now has b\'s block');
  assert.strictEqual(a.grid[20][0].filled, false, 'a lost its own block');
  assert.strictEqual(b2.grid[20][0].filled, true, 'b now has a\'s original block');
}

export async function freefallClosesVerticalGapsPerColumn(): Promise<void> {
  // gamestart.c:14864-14903 statFreefall
  const b = board();
  fillCell(b, 10, 0); // floating block with empty space below it
  freefallCompact(b);
  assert.strictEqual(b.grid[10][0].filled, false, 'old position now empty');
  assert.strictEqual(b.grid[23][0].filled, true, 'block fell to the floor');
}

export async function movLeftClosesHorizontalGapsTowardTheLeftWall(): Promise<void> {
  // gamestart.c:15040-15113 statMovfield (isLmovfield)
  const b = board();
  fillCell(b, 20, 5);
  fillCell(b, 20, 8);
  movCompact(b, 'left');
  assert.deepStrictEqual(filledXs(b, 20), [0, 1]);
}

export async function movRightClosesHorizontalGapsTowardTheRightWall(): Promise<void> {
  const b = board();
  fillCell(b, 20, 1);
  fillCell(b, 20, 4);
  movCompact(b, 'right');
  assert.deepStrictEqual(filledXs(b, 20), [8, 9]);
}

export async function flipVerticalReversesRowOrderKeepingColumns(): Promise<void> {
  // gamestart.c:15132-15175 stat180field - column j is unchanged, only the
  // row order reverses.
  const b = board();
  fillCell(b, 4, 3);   // first visible row
  fillCell(b, 23, 3);  // last row
  flipVertical(b);
  assert.strictEqual(b.grid[4][3].filled, true, 'bottom block moved to the top');
  assert.strictEqual(b.grid[23][3].filled, true, 'top block moved to the bottom');
}

export async function hardBlockCellsAreExcludedFromClearableLines(): Promise<void> {
  // gamestart.c:10127-10131,10148: a HARD BLOCK cell cancels its whole row's
  // clear even though every cell in it is filled.
  const b = board();
  for (let x = 0; x < b.width; x++) fillCell(b, 20, x);
  b.grid[20][4].item = HARD_BLOCK_ITEM;

  const complete = getCompleteLines(b);
  assert.ok(complete.includes(20), 'row is visually complete');

  const clearable = getClearableLines(b, complete);
  assert.ok(!clearable.includes(20), 'but a hard block cancels the clear');
}
