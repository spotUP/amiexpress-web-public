/**
 * TGM Item System
 *
 * HeborisCE-1.1.0 reference: Documentation/7-Reference Sources/HeborisCE-1.1.0/src/game/gamestart.c
 *
 * This is a from-scratch build against that reference (the door had no item
 * system at all before this file - "there are no visible pickups in
 * gmasters vs modes" was the sysop report that started this work).
 *
 * Scope: this file implements the full item table (names, weights, all four
 * presets, the weighted-draw-with-history selection algorithm - gamestart.c
 * lines cited throughout) plus effects for the items whose gameplay behaviour
 * is confirmed by LIVE code paths in the reference. Six of the nineteen TGM
 * preset items (ROLLROLL, DEATH, X-RAY, COLOR, DARK, TRANSFORM) are NOT
 * wired to an effect - see NOT_IMPLEMENTED_ITEMS below for why each one was
 * left out. They are still valid data (names, weights, TGM_PRESET_ITEMS
 * membership) and the engine will never draw them at runtime because
 * TGM_RUNTIME_ITEMS excludes them (core/game.ts only ever picks from that
 * restricted pool) - a drawn item always has a real effect.
 */

import type { Board, Cell, PieceType } from './types';

// ============================================================================
// Item identity
// ============================================================================

/**
 * Item id -> display name, gamestart.c:3292-3296 (comment table matching
 * item_num = 39 at gamestart.c:3289).
 */
export const ITEM_NAMES: Readonly<Record<number, string>> = {
  1: 'MIRROR', 2: 'ROLLROLL', 3: 'DEATH', 4: 'X-RAY', 5: 'COLOR',
  6: 'ROTATE LOCK', 7: 'HIDE NEXT', 8: 'MAGNET', 9: 'TIME STOP', 10: 'HOLD LOCK',
  11: '<->REV', 12: 'BOOST', 13: 'FEVER', 14: '^vREV', 15: 'REMOTE CON',
  16: 'DARK', 17: '^DEL', 18: 'vDEL', 19: 'DELEVEN', 20: 'TRANSFORM',
  21: 'LASER', 22: 'NEGA', 23: 'SHOTGUN', 24: 'EXCHG', 25: 'HARD',
  26: 'SHUFFLE', 27: 'RANDOM', 28: 'FREEFALL', 29: '<-MOV', 30: '->MOV',
  31: '180DEG', 32: '16T', 33: 'REFLECT', 34: 'DOUBLE', 35: 'ALLCLEAR',
  36: 'MISS', 37: 'COPYFLD', 38: 'FAKENEXT', 39: '[]',
};

export const ITEM_COUNT = 39; // gamestart.c:3289 item_num = 39

/**
 * Hard block sentinel used in the item plane (gamestart.c:1409
 * `fldihardno = 43`). A cell carrying this "item" is not collectible - it
 * blocks its row from ever being cleared (gamestart.c:10127-10131,10148).
 */
export const HARD_BLOCK_ITEM = 43;

/**
 * Per-item draw weight, 1-indexed (ITEM_WEIGHTS[0] is item 1's weight).
 * gamestart.c:1353-1358 `item_pro[50]`, first 39 entries (item_num caps the
 * sum loop at gamestart.c:3320-3324: `for(i=0;i<item_num;i++) item_pronum +=
 * item_pro[i];` - the trailing 11 entries for items 40-50 are never summed).
 */
export const ITEM_WEIGHTS: readonly number[] = [
  5, 8, 5, 9, 6, 3, 5, 4, 6, 8,
  4, 7, 5, 6, 5, 3, 6, 6, 5, 4,
  9, 1, 5, 1, 7, 7, 8, 3, 3, 5,
  7, 4, 3, 3, 1, 5, 3, 2, 7,
];

// ============================================================================
// Presets (gamestart.c:6994-7068, use_item[player] switch)
// ============================================================================

export type ItemPresetName = 'ALL' | 'FEW' | 'DS' | 'TGM';

/** gamestart.c:7029-7034 `use_item == item_num+1` - "few 1~5". */
export const FEW_PRESET_ITEMS: readonly number[] = [1, 2, 3, 4, 5];

/** gamestart.c:7035-7043 `use_item == item_num+2` - "DS 6 7 12 13 18 26". */
export const DS_PRESET_ITEMS: readonly number[] = [6, 7, 12, 13, 18, 26];

/**
 * gamestart.c:7044-7061 `use_item == item_num+3` - "TGM 1-5 16-25 28-31"
 * (nineteen items; the reject condition at gamestart.c:7058 excludes
 * `(5<id<16) || (25<id<28) || (id>31)`).
 */
export const TGM_PRESET_ITEMS: readonly number[] = [
  1, 2, 3, 4, 5,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
  28, 29, 30, 31,
];

/**
 * Of TGM_PRESET_ITEMS, the six whose reference behaviour could not be
 * confirmed via a live (reachable) code path:
 *
 *  - ROLLROLL (2): live effect is entangled with the "roll" scroll-mode
 *    subsystem (m_roll_blockframe, p_rollroll_interval) and only one narrow,
 *    cosmetic consequence (hold-swap piece colour, gamestart.c:7687-7690) is
 *    confidently traceable. Not enough to reconstruct the real mechanic.
 *  - DEATH (3): setBigBlock/judgeBigBlock (gamestart.c:16234-16297) are real
 *    and fully live, but doubling piece footprint touches spawn, rotation
 *    kicks, ghost and hold across the whole piece system - out of scope for
 *    "extend the board cell model minimally".
 *  - X-RAY (4): its only consumer, getFieldBlock(..., opt=1) at
 *    gamestart.c:15353-15356, is dead code - grepping the file, every call
 *    site (gamestart.c:10457,10469) passes opt=0. No live effect to copy.
 *  - COLOR (5): same story - color_counter (gamestart.c:4018-4021) is
 *    incremented but nothing in the file reads it for gameplay or rendering.
 *  - DARK (16): same story - isdark only gates the same dead
 *    getFieldBlock(opt=1) branch; live code only counts its timer down
 *    (gamestart.c:4105-4107).
 *  - TRANSFORM (20): istrance has one live consumer, a CPU auto-move gate
 *    (gamestart.c:7215), not a player-facing field/piece effect.
 *
 * This engine never draws these six at runtime (see TGM_RUNTIME_ITEMS) so a
 * player never receives a pickup with no effect.
 */
export const TGM_NOT_IMPLEMENTED_ITEMS: readonly number[] = [2, 3, 4, 5, 16, 20];

/** TGM_PRESET_ITEMS minus TGM_NOT_IMPLEMENTED_ITEMS - what the engine actually draws. */
export const TGM_RUNTIME_ITEMS: readonly number[] = TGM_PRESET_ITEMS.filter(
  (id) => !TGM_NOT_IMPLEMENTED_ITEMS.includes(id)
);

// ============================================================================
// Selection (gamestart.c:6994-7068)
// ============================================================================

/** Sum of ITEM_WEIGHTS (gamestart.c:3320-3324 item_pronum). */
export function totalItemWeight(pool: readonly number[] = TGM_PRESET_ITEMS): number {
  // The weighted draw always samples over ALL 39 weights (gamestart.c uses
  // item_pronum, the full-table sum) and rejects results outside the pool -
  // it does not renormalize weights to just the pool. See drawWeighted().
  void pool;
  return ITEM_WEIGHTS.reduce((a, b) => a + b, 0);
}

/**
 * One draw from the full weighted table (gamestart.c:6999-7010 / 7046-7057):
 * `tmp2 = gameRand(item_pronum); tmp = 1; do { tmp2 -= item_pro[tmp-1]; if
 * (tmp2 < 0) break; tmp++; } while(...)`. Cumulative-weight sampling.
 */
export function drawWeightedItem(rng: () => number = Math.random): number {
  const total = totalItemWeight();
  let remaining = Math.floor(rng() * total);
  let id = 1;
  for (;;) {
    remaining -= ITEM_WEIGHTS[id - 1];
    if (remaining < 0) break;
    id++;
    if (id > ITEM_COUNT) { id = ITEM_COUNT; break; }
  }
  return id;
}

/**
 * Five-slot rolling history (gamestart.c `itemhistory[2*5]`, one player's
 * slice is itemhistory[0..4]). ALL/TGM check and shift all five slots
 * (gamestart.c:7011-7024, 7059-7066); FEW/DS only ever touch slot 0
 * (gamestart.c:7030-7034, 7042-7043) - passing a length-5 array to those
 * presets still works since they only read/write index 0.
 */
export function createItemHistory(): number[] {
  return [0, 0, 0, 0, 0];
}

function shiftHistory(history: number[], id: number): void {
  history.shift();
  history.push(id);
}

/**
 * Draw the next item for a preset, matching gamestart.c:6994-7068. `history`
 * is mutated in place (matches the reference's itemhistory[] side effect).
 */
export function drawItem(
  preset: ItemPresetName,
  history: number[],
  rng: () => number = Math.random
): number {
  switch (preset) {
    case 'FEW': {
      // gamestart.c:7029-7034: uniform 1..39, reject id>=6 or repeat of slot 0.
      let id: number;
      do {
        id = Math.floor(rng() * ITEM_COUNT) + 1;
      } while (id >= 6 || id === history[0]);
      history[0] = id;
      return id;
    }
    case 'DS': {
      // gamestart.c:7035-7043: uniform 1..39 with an anti-bias reroll on a
      // first draw of 6, reject anything outside {6,7,12,13,18,26} or a
      // repeat of slot 0.
      const DS_SET = new Set(DS_PRESET_ITEMS);
      let id: number;
      do {
        id = Math.floor(rng() * ITEM_COUNT) + 1;
        if (id === 6) id = Math.floor(rng() * ITEM_COUNT) + 1;
      } while (!DS_SET.has(id) || id === history[0]);
      history[0] = id;
      return id;
    }
    case 'TGM': {
      const inTgmRange = (id: number) => TGM_PRESET_ITEMS.includes(id);
      let id: number;
      do {
        id = drawWeightedItem(rng);
      } while (history.includes(id) || !inTgmRange(id));
      shiftHistory(history, id);
      return id;
    }
    case 'ALL':
    default: {
      let id: number;
      do {
        id = drawWeightedItem(rng);
      } while (history.includes(id));
      shiftHistory(history, id);
      return id;
    }
  }
}

// ============================================================================
// Targeting (gamestart.c:14358-14365, cited in the task; the "attack"
// exclusion list is gamestart.c:13451-13454)
// ============================================================================

/**
 * Items applied to the collector (gamestart.c's "support items" - set on
 * `player`, not `enemy`, in eraseItem): ^DEL(17), vDEL(18), DELEVEN(19),
 * FREEFALL(28), <-MOV(29), ->MOV(30). Everything else in TGM_RUNTIME_ITEMS
 * is an attack (set on `enemy`), matching eraseItem's exclusion list at
 * gamestart.c:13451-13454 (17,18,19,28,29,30 are excluded from `attack=1`).
 */
export const SELF_TARGET_ITEMS: ReadonlySet<number> = new Set([17, 18, 19, 28, 29, 30]);

export function isSelfTargetItem(itemId: number): boolean {
  return SELF_TARGET_ITEMS.has(itemId);
}

// ============================================================================
// Effects - board transforms
//
// Each of these is a one-shot, instantaneous transform of a Board. The
// reference animates most of these over many frames (fmirrorProc, statLaser,
// etc.) but the underlying data change is a single discrete operation in
// every case cited below; the animation is presentation, not mechanic, and
// is out of scope here (see ui/versus-screen.ts for the visible cue instead).
// ============================================================================

function emptyCell(): Cell {
  return { filled: false, color: null, locked: false, item: null };
}

/** First row of the playable field (gamestart.c checkFieldTop()). */
function visibleTop(board: Board, visibleRows = 20): number {
  return Math.max(0, board.height - visibleRows);
}

/**
 * MIRROR (1): flip the field left-right. gamestart.c:9057-9088 fldMirrorProc
 * animates this column-by-column but the end state is a full horizontal
 * mirror of every row (fld[(w-1-j)] = old fld[j]).
 */
export function mirrorBoard(board: Board): void {
  for (const row of board.grid) row.reverse();
}

/**
 * ^DEL FIELD (17): clear the top half of the stack. gamestart.c:8738-8752
 * `j = (22-checkFieldTop)/2; for(i=checkFieldTop; i<=22; i++){ erase[i]=1;
 * j--; if(j<0) break; }` - marks rows starting at the top for roughly half
 * the field height, then runs them through the normal clear-and-collapse
 * pipeline (statErase). We reproduce the "top half, roughly" rule and let
 * the caller run the door's own clearLines() on the returned rows.
 */
export function topDeleteRows(board: Board): number[] {
  const top = visibleTop(board);
  const height = board.height - top;
  const count = Math.floor(height / 2);
  const rows: number[] = [];
  for (let i = 0; i < count; i++) rows.push(top + i);
  return rows;
}

/**
 * vDEL FIELD (18): clear the bottom half of the stack. gamestart.c:8753-8767
 * `j = (22-checkFieldTop)/2; for(i=22; i>checkFieldTop; i--){ erase[i]=1;
 * j--; if(j<0) break; }` - mirror image of topDeleteRows.
 */
export function bottomDeleteRows(board: Board): number[] {
  const top = visibleTop(board);
  const height = board.height - top;
  const count = Math.floor(height / 2);
  const rows: number[] = [];
  for (let i = 0; i < count; i++) rows.push(board.height - 1 - i);
  return rows;
}

/**
 * DELEVEN (19): clear every other row. gamestart.c:8768-8780 `for(i=22;
 * i>=checkFieldTop; i--){ erase[i]=1; i--; }` - marks the bottom row, skips
 * one, marks the next, etc.
 */
export function everyOtherDeleteRows(board: Board): number[] {
  const top = visibleTop(board);
  const rows: number[] = [];
  for (let y = board.height - 1; y >= top; y -= 2) rows.push(y);
  return rows;
}

/**
 * LASER (21): destroy every block in one column. gamestart.c:14065-14150
 * statLaser - after an interactive aim phase (not reproducible in a
 * non-interactive door), the fired laser empties fld/fldt/fldi/flds for
 * every row at the chosen column (gamestart.c:14128-14140). We keep that
 * discrete effect and simplify the delivery: fire immediately at a supplied
 * column instead of the aim-then-fire minigame.
 */
export function laserColumn(board: Board, x: number): void {
  for (let y = 0; y < board.height; y++) {
    if (board.grid[y][x]) board.grid[y][x] = emptyCell();
  }
}

/**
 * NEGA (22): invert every cell in the stack (filled<->empty).
 * gamestart.c:14224-14267 statNegafield - row by row from checkFieldTop
 * down, `if(fld!=0) fld=0; else if(y>=nega_pos) fld=(y%7)+2` (a generic
 * block, not a specific piece colour).
 */
export function negateBoard(board: Board): void {
  const top = visibleTop(board);
  for (let y = top; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const cell = board.grid[y][x];
      if (cell.filled) {
        board.grid[y][x] = emptyCell();
      } else {
        board.grid[y][x] = { filled: true, color: null, locked: true, item: null };
      }
    }
  }
}

/**
 * SHOTGUN (23): destroy one random filled block per row.
 * gamestart.c:14287-14318 statShotgun - `for(i=checkFieldTop;i<22;i++){
 * pick random x where fld[x,i]!=0; clear it; }`.
 */
export function shotgunBoard(board: Board, rng: () => number = Math.random): void {
  const top = visibleTop(board);
  for (let y = top; y < board.height; y++) {
    const filledX: number[] = [];
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled) filledX.push(x);
    }
    if (filledX.length === 0) continue;
    const x = filledX[Math.floor(rng() * filledX.length)];
    board.grid[y][x] = emptyCell();
  }
}

/**
 * EXCHG (24): swap two boards' contents entirely.
 * gamestart.c:14358-14420 statExchangefield copies fld/fldt/fldi/flds from
 * the opponent's buffered field wholesale.
 */
export function swapBoards(a: Board, b: Board): void {
  const tmp = a.grid;
  a.grid = b.grid;
  b.grid = tmp;
}

/**
 * FREEFALL (28): close every vertical gap - every column's blocks fall to
 * the bottom, keeping relative order. gamestart.c:14864-14903 statFreefall
 * cascades each floating cell down one row at a time per column; the net
 * result is a plain per-column compaction, which is what we compute
 * directly.
 */
export function freefallCompact(board: Board, top = visibleTop(board)): void {
  for (let x = 0; x < board.width; x++) {
    const filled: Cell[] = [];
    for (let y = top; y < board.height; y++) {
      if (board.grid[y][x].filled) filled.push(board.grid[y][x]);
    }
    let y = board.height - 1;
    for (let i = filled.length - 1; i >= 0; i--) {
      board.grid[y][x] = filled[i];
      y--;
    }
    for (; y >= top; y--) {
      board.grid[y][x] = emptyCell();
    }
  }
}

/**
 * <-MOV / ->MOV FIELD (29/30): close every horizontal gap in each row,
 * sliding blocks toward the chosen wall. gamestart.c:15040-15113
 * statMovfield cascades each row's cells toward the wall one step at a
 * time; the net result is a plain per-row compaction toward that wall.
 */
export function movCompact(board: Board, direction: 'left' | 'right', top = visibleTop(board)): void {
  for (let y = top; y < board.height; y++) {
    const filled: Cell[] = [];
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled) filled.push(board.grid[y][x]);
    }
    const row: Cell[] = new Array(board.width);
    if (direction === 'left') {
      for (let x = 0; x < board.width; x++) row[x] = x < filled.length ? filled[x] : emptyCell();
    } else {
      const start = board.width - filled.length;
      for (let x = 0; x < board.width; x++) row[x] = x >= start ? filled[x - start] : emptyCell();
    }
    board.grid[y] = row;
  }
}

/**
 * 180 FIELD (31): flip the stack upside-down within the playable field
 * (row order reversed; each row keeps its own column contents - this is a
 * vertical flip, not a point rotation). gamestart.c:15132-15175
 * stat180field: `fld[j + (i+top)*w] = fldbuf[j + (h-i)*w]` - column index j
 * is unchanged, only the row is reversed.
 */
export function flipVertical(board: Board, top = visibleTop(board)): void {
  const rows = board.grid.slice(top).reverse();
  for (let i = 0; i < rows.length; i++) board.grid[top + i] = rows[i];
}

// ============================================================================
// Effect dispatch
// ============================================================================

export interface ItemEffectResult {
  /** Rows that should be run through the caller's clearLines() (DEL items). */
  clearRows?: number[];
  /** Set when the item inserts a hard block into the target's next piece. */
  insertHardBlockNext?: boolean;
  /** Set for EXCHG - caller must also swap the collector's own board. */
  swapWithSelf?: boolean;
}

/**
 * Apply a self-targeted item directly to the collector's board.
 * Returns rows for the caller to clear via the door's own clearLines(),
 * since row removal/insertion is board.ts's job, not this module's.
 */
export function applySelfItem(itemId: number, board: Board): ItemEffectResult {
  switch (itemId) {
    case 17: return { clearRows: topDeleteRows(board) };
    case 18: return { clearRows: bottomDeleteRows(board) };
    case 19: return { clearRows: everyOtherDeleteRows(board) };
    case 28: freefallCompact(board); return {};
    case 29: movCompact(board, 'left'); return {};
    case 30: movCompact(board, 'right'); return {};
    default: return {};
  }
}

/**
 * Apply an enemy-targeted item to the target board. `selfBoard`/`rng` are
 * only used by items that need them (EXCHG, LASER, SHOTGUN).
 */
export function applyEnemyItem(
  itemId: number,
  targetBoard: Board,
  selfBoard: Board,
  rng: () => number = Math.random
): ItemEffectResult {
  switch (itemId) {
    case 1:
      mirrorBoard(targetBoard);
      return {};
    case 21: {
      const x = Math.floor(rng() * targetBoard.width);
      laserColumn(targetBoard, x);
      return {};
    }
    case 22:
      negateBoard(targetBoard);
      return {};
    case 23:
      shotgunBoard(targetBoard, rng);
      return {};
    case 24:
      swapBoards(targetBoard, selfBoard);
      return { swapWithSelf: true };
    case 25:
      return { insertHardBlockNext: true };
    case 31:
      flipVertical(targetBoard);
      return {};
    default:
      return {};
  }
}

export type { PieceType };
