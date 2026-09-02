"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SELF_TARGET_ITEMS = exports.TGM_RUNTIME_ITEMS = exports.TGM_NOT_IMPLEMENTED_ITEMS = exports.TGM_PRESET_ITEMS = exports.DS_PRESET_ITEMS = exports.FEW_PRESET_ITEMS = exports.ITEM_WEIGHTS = exports.HARD_BLOCK_ITEM = exports.ITEM_COUNT = exports.ITEM_NAMES = void 0;
exports.totalItemWeight = totalItemWeight;
exports.drawWeightedItem = drawWeightedItem;
exports.createItemHistory = createItemHistory;
exports.drawItem = drawItem;
exports.isSelfTargetItem = isSelfTargetItem;
exports.mirrorBoard = mirrorBoard;
exports.topDeleteRows = topDeleteRows;
exports.bottomDeleteRows = bottomDeleteRows;
exports.everyOtherDeleteRows = everyOtherDeleteRows;
exports.laserColumn = laserColumn;
exports.negateBoard = negateBoard;
exports.shotgunBoard = shotgunBoard;
exports.swapBoards = swapBoards;
exports.freefallCompact = freefallCompact;
exports.movCompact = movCompact;
exports.flipVertical = flipVertical;
exports.applySelfItem = applySelfItem;
exports.applyEnemyItem = applyEnemyItem;
// ============================================================================
// Item identity
// ============================================================================
/**
 * Item id -> display name, gamestart.c:3292-3296 (comment table matching
 * item_num = 39 at gamestart.c:3289).
 */
exports.ITEM_NAMES = {
    1: 'MIRROR', 2: 'ROLLROLL', 3: 'DEATH', 4: 'X-RAY', 5: 'COLOR',
    6: 'ROTATE LOCK', 7: 'HIDE NEXT', 8: 'MAGNET', 9: 'TIME STOP', 10: 'HOLD LOCK',
    11: '<->REV', 12: 'BOOST', 13: 'FEVER', 14: '^vREV', 15: 'REMOTE CON',
    16: 'DARK', 17: '^DEL', 18: 'vDEL', 19: 'DELEVEN', 20: 'TRANSFORM',
    21: 'LASER', 22: 'NEGA', 23: 'SHOTGUN', 24: 'EXCHG', 25: 'HARD',
    26: 'SHUFFLE', 27: 'RANDOM', 28: 'FREEFALL', 29: '<-MOV', 30: '->MOV',
    31: '180DEG', 32: '16T', 33: 'REFLECT', 34: 'DOUBLE', 35: 'ALLCLEAR',
    36: 'MISS', 37: 'COPYFLD', 38: 'FAKENEXT', 39: '[]',
};
exports.ITEM_COUNT = 39; // gamestart.c:3289 item_num = 39
/**
 * Hard block sentinel used in the item plane (gamestart.c:1409
 * `fldihardno = 43`). A cell carrying this "item" is not collectible - it
 * blocks its row from ever being cleared (gamestart.c:10127-10131,10148).
 */
exports.HARD_BLOCK_ITEM = 43;
/**
 * Per-item draw weight, 1-indexed (ITEM_WEIGHTS[0] is item 1's weight).
 * gamestart.c:1353-1358 `item_pro[50]`, first 39 entries (item_num caps the
 * sum loop at gamestart.c:3320-3324: `for(i=0;i<item_num;i++) item_pronum +=
 * item_pro[i];` - the trailing 11 entries for items 40-50 are never summed).
 */
exports.ITEM_WEIGHTS = [
    5, 8, 5, 9, 6, 3, 5, 4, 6, 8,
    4, 7, 5, 6, 5, 3, 6, 6, 5, 4,
    9, 1, 5, 1, 7, 7, 8, 3, 3, 5,
    7, 4, 3, 3, 1, 5, 3, 2, 7,
];
/** gamestart.c:7029-7034 `use_item == item_num+1` - "few 1~5". */
exports.FEW_PRESET_ITEMS = [1, 2, 3, 4, 5];
/** gamestart.c:7035-7043 `use_item == item_num+2` - "DS 6 7 12 13 18 26". */
exports.DS_PRESET_ITEMS = [6, 7, 12, 13, 18, 26];
/**
 * gamestart.c:7044-7061 `use_item == item_num+3` - "TGM 1-5 16-25 28-31"
 * (nineteen items; the reject condition at gamestart.c:7058 excludes
 * `(5<id<16) || (25<id<28) || (id>31)`).
 */
exports.TGM_PRESET_ITEMS = [
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
exports.TGM_NOT_IMPLEMENTED_ITEMS = [2, 3, 4, 5, 16, 20];
/** TGM_PRESET_ITEMS minus TGM_NOT_IMPLEMENTED_ITEMS - what the engine actually draws. */
exports.TGM_RUNTIME_ITEMS = exports.TGM_PRESET_ITEMS.filter((id) => !exports.TGM_NOT_IMPLEMENTED_ITEMS.includes(id));
// ============================================================================
// Selection (gamestart.c:6994-7068)
// ============================================================================
/** Sum of ITEM_WEIGHTS (gamestart.c:3320-3324 item_pronum). */
function totalItemWeight(pool = exports.TGM_PRESET_ITEMS) {
    // The weighted draw always samples over ALL 39 weights (gamestart.c uses
    // item_pronum, the full-table sum) and rejects results outside the pool -
    // it does not renormalize weights to just the pool. See drawWeighted().
    void pool;
    return exports.ITEM_WEIGHTS.reduce((a, b) => a + b, 0);
}
/**
 * One draw from the full weighted table (gamestart.c:6999-7010 / 7046-7057):
 * `tmp2 = gameRand(item_pronum); tmp = 1; do { tmp2 -= item_pro[tmp-1]; if
 * (tmp2 < 0) break; tmp++; } while(...)`. Cumulative-weight sampling.
 */
function drawWeightedItem(rng = Math.random) {
    const total = totalItemWeight();
    let remaining = Math.floor(rng() * total);
    let id = 1;
    for (;;) {
        remaining -= exports.ITEM_WEIGHTS[id - 1];
        if (remaining < 0)
            break;
        id++;
        if (id > exports.ITEM_COUNT) {
            id = exports.ITEM_COUNT;
            break;
        }
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
function createItemHistory() {
    return [0, 0, 0, 0, 0];
}
function shiftHistory(history, id) {
    history.shift();
    history.push(id);
}
/**
 * Draw the next item for a preset, matching gamestart.c:6994-7068. `history`
 * is mutated in place (matches the reference's itemhistory[] side effect).
 */
function drawItem(preset, history, rng = Math.random) {
    switch (preset) {
        case 'FEW': {
            // gamestart.c:7029-7034: uniform 1..39, reject id>=6 or repeat of slot 0.
            let id;
            do {
                id = Math.floor(rng() * exports.ITEM_COUNT) + 1;
            } while (id >= 6 || id === history[0]);
            history[0] = id;
            return id;
        }
        case 'DS': {
            // gamestart.c:7035-7043: uniform 1..39 with an anti-bias reroll on a
            // first draw of 6, reject anything outside {6,7,12,13,18,26} or a
            // repeat of slot 0.
            const DS_SET = new Set(exports.DS_PRESET_ITEMS);
            let id;
            do {
                id = Math.floor(rng() * exports.ITEM_COUNT) + 1;
                if (id === 6)
                    id = Math.floor(rng() * exports.ITEM_COUNT) + 1;
            } while (!DS_SET.has(id) || id === history[0]);
            history[0] = id;
            return id;
        }
        case 'TGM': {
            const inTgmRange = (id) => exports.TGM_PRESET_ITEMS.includes(id);
            let id;
            do {
                id = drawWeightedItem(rng);
            } while (history.includes(id) || !inTgmRange(id));
            shiftHistory(history, id);
            return id;
        }
        case 'ALL':
        default: {
            let id;
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
exports.SELF_TARGET_ITEMS = new Set([17, 18, 19, 28, 29, 30]);
function isSelfTargetItem(itemId) {
    return exports.SELF_TARGET_ITEMS.has(itemId);
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
function emptyCell() {
    return { filled: false, color: null, locked: false, item: null };
}
/** First row of the playable field (gamestart.c checkFieldTop()). */
function visibleTop(board, visibleRows = 20) {
    return Math.max(0, board.height - visibleRows);
}
/**
 * MIRROR (1): flip the field left-right. gamestart.c:9057-9088 fldMirrorProc
 * animates this column-by-column but the end state is a full horizontal
 * mirror of every row (fld[(w-1-j)] = old fld[j]).
 */
function mirrorBoard(board) {
    for (const row of board.grid)
        row.reverse();
}
/**
 * ^DEL FIELD (17): clear the top half of the stack. gamestart.c:8738-8752
 * `j = (22-checkFieldTop)/2; for(i=checkFieldTop; i<=22; i++){ erase[i]=1;
 * j--; if(j<0) break; }` - marks rows starting at the top for roughly half
 * the field height, then runs them through the normal clear-and-collapse
 * pipeline (statErase). We reproduce the "top half, roughly" rule and let
 * the caller run the door's own clearLines() on the returned rows.
 */
function topDeleteRows(board) {
    const top = visibleTop(board);
    const height = board.height - top;
    const count = Math.floor(height / 2);
    const rows = [];
    for (let i = 0; i < count; i++)
        rows.push(top + i);
    return rows;
}
/**
 * vDEL FIELD (18): clear the bottom half of the stack. gamestart.c:8753-8767
 * `j = (22-checkFieldTop)/2; for(i=22; i>checkFieldTop; i--){ erase[i]=1;
 * j--; if(j<0) break; }` - mirror image of topDeleteRows.
 */
function bottomDeleteRows(board) {
    const top = visibleTop(board);
    const height = board.height - top;
    const count = Math.floor(height / 2);
    const rows = [];
    for (let i = 0; i < count; i++)
        rows.push(board.height - 1 - i);
    return rows;
}
/**
 * DELEVEN (19): clear every other row. gamestart.c:8768-8780 `for(i=22;
 * i>=checkFieldTop; i--){ erase[i]=1; i--; }` - marks the bottom row, skips
 * one, marks the next, etc.
 */
function everyOtherDeleteRows(board) {
    const top = visibleTop(board);
    const rows = [];
    for (let y = board.height - 1; y >= top; y -= 2)
        rows.push(y);
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
function laserColumn(board, x) {
    for (let y = 0; y < board.height; y++) {
        if (board.grid[y][x])
            board.grid[y][x] = emptyCell();
    }
}
/**
 * NEGA (22): invert every cell in the stack (filled<->empty).
 * gamestart.c:14224-14267 statNegafield - row by row from checkFieldTop
 * down, `if(fld!=0) fld=0; else if(y>=nega_pos) fld=(y%7)+2` (a generic
 * block, not a specific piece colour).
 */
function negateBoard(board) {
    const top = visibleTop(board);
    for (let y = top; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            const cell = board.grid[y][x];
            if (cell.filled) {
                board.grid[y][x] = emptyCell();
            }
            else {
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
function shotgunBoard(board, rng = Math.random) {
    const top = visibleTop(board);
    for (let y = top; y < board.height; y++) {
        const filledX = [];
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].filled)
                filledX.push(x);
        }
        if (filledX.length === 0)
            continue;
        const x = filledX[Math.floor(rng() * filledX.length)];
        board.grid[y][x] = emptyCell();
    }
}
/**
 * EXCHG (24): swap two boards' contents entirely.
 * gamestart.c:14358-14420 statExchangefield copies fld/fldt/fldi/flds from
 * the opponent's buffered field wholesale.
 */
function swapBoards(a, b) {
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
function freefallCompact(board, top = visibleTop(board)) {
    for (let x = 0; x < board.width; x++) {
        const filled = [];
        for (let y = top; y < board.height; y++) {
            if (board.grid[y][x].filled)
                filled.push(board.grid[y][x]);
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
function movCompact(board, direction, top = visibleTop(board)) {
    for (let y = top; y < board.height; y++) {
        const filled = [];
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].filled)
                filled.push(board.grid[y][x]);
        }
        const row = new Array(board.width);
        if (direction === 'left') {
            for (let x = 0; x < board.width; x++)
                row[x] = x < filled.length ? filled[x] : emptyCell();
        }
        else {
            const start = board.width - filled.length;
            for (let x = 0; x < board.width; x++)
                row[x] = x >= start ? filled[x - start] : emptyCell();
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
function flipVertical(board, top = visibleTop(board)) {
    const rows = board.grid.slice(top).reverse();
    for (let i = 0; i < rows.length; i++)
        board.grid[top + i] = rows[i];
}
/**
 * Apply a self-targeted item directly to the collector's board.
 * Returns rows for the caller to clear via the door's own clearLines(),
 * since row removal/insertion is board.ts's job, not this module's.
 */
function applySelfItem(itemId, board) {
    switch (itemId) {
        case 17: return { clearRows: topDeleteRows(board) };
        case 18: return { clearRows: bottomDeleteRows(board) };
        case 19: return { clearRows: everyOtherDeleteRows(board) };
        case 28:
            freefallCompact(board);
            return {};
        case 29:
            movCompact(board, 'left');
            return {};
        case 30:
            movCompact(board, 'right');
            return {};
        default: return {};
    }
}
/**
 * Apply an enemy-targeted item to the target board. `selfBoard`/`rng` are
 * only used by items that need them (EXCHG, LASER, SHOTGUN).
 */
function applyEnemyItem(itemId, targetBoard, selfBoard, rng = Math.random) {
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
//# sourceMappingURL=items.js.map