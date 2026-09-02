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
import type { Board, PieceType } from './types';
/**
 * Item id -> display name, gamestart.c:3292-3296 (comment table matching
 * item_num = 39 at gamestart.c:3289).
 */
export declare const ITEM_NAMES: Readonly<Record<number, string>>;
export declare const ITEM_COUNT = 39;
/**
 * Hard block sentinel used in the item plane (gamestart.c:1409
 * `fldihardno = 43`). A cell carrying this "item" is not collectible - it
 * blocks its row from ever being cleared (gamestart.c:10127-10131,10148).
 */
export declare const HARD_BLOCK_ITEM = 43;
/**
 * Per-item draw weight, 1-indexed (ITEM_WEIGHTS[0] is item 1's weight).
 * gamestart.c:1353-1358 `item_pro[50]`, first 39 entries (item_num caps the
 * sum loop at gamestart.c:3320-3324: `for(i=0;i<item_num;i++) item_pronum +=
 * item_pro[i];` - the trailing 11 entries for items 40-50 are never summed).
 */
export declare const ITEM_WEIGHTS: readonly number[];
export type ItemPresetName = 'ALL' | 'FEW' | 'DS' | 'TGM';
/** gamestart.c:7029-7034 `use_item == item_num+1` - "few 1~5". */
export declare const FEW_PRESET_ITEMS: readonly number[];
/** gamestart.c:7035-7043 `use_item == item_num+2` - "DS 6 7 12 13 18 26". */
export declare const DS_PRESET_ITEMS: readonly number[];
/**
 * gamestart.c:7044-7061 `use_item == item_num+3` - "TGM 1-5 16-25 28-31"
 * (nineteen items; the reject condition at gamestart.c:7058 excludes
 * `(5<id<16) || (25<id<28) || (id>31)`).
 */
export declare const TGM_PRESET_ITEMS: readonly number[];
/**
 * Of TGM_PRESET_ITEMS, the four whose reference behaviour has NO live
 * (reachable) code path to copy. ROLLROLL (2) and DEATH (3) used to be on
 * this list; both turned out to be live and are implemented now:
 *
 *  - ROLLROLL (2): the effect is not the "roll" scroll subsystem at all -
 *    isrollroll feeds `move = (BTN_B || rolling) - ...` in every rotation
 *    module (ars.c:52-78, world.c:182-208, classic.c:72, classic_D.c:113),
 *    i.e. the piece rotates BY ITSELF. In versus and item mode the timing is
 *    `gametime % p_rollroll_timer == 0` (ars.c:66-70), 30 frames
 *    (init.c:729). The hold-swap colour line (gamestart.c:7687-7690) is a
 *    cosmetic side effect of it, not the mechanic.
 *  - DEATH (3): eraseItem sets IsBig (gamestart.c:13502), and judgeBlock /
 *    setBlock hand the whole piece to judgeBigBlock / setBigBlock
 *    (gamestart.c:16156, 16192), which double each block offset and fill
 *    2x2. Doubling the SHAPE gives collision, ghost, lock and rendering the
 *    same behaviour with no second code path.
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
export declare const TGM_NOT_IMPLEMENTED_ITEMS: readonly number[];
/** DEATH BLOCK's duration in pieces (gamestart.c:7097 `item_t > 1`). */
export declare const DEATH_BLOCK_PIECES = 2;
/** ROLL ROLL's duration in pieces (gamestart.c:7092 `item_t > 3`). */
export declare const ROLL_ROLL_PIECES = 4;
/** ROLL ROLL's rotation period in frames (init.c:729 p_rollroll_timer = 30). */
export declare const ROLL_ROLL_PERIOD_FRAMES = 30;
/**
 * Frame durations for the timed attack items, from eraseItem
 * (gamestart.c:13527, 13537, 13558, 13563). The reference shortens several of
 * them at high gravity; this door uses the base value, which is the one a
 * player meets at any ordinary speed.
 */
export declare const ROTATE_LOCK_FRAMES = 600;
export declare const HIDE_NEXT_FRAMES = 900;
export declare const LR_REVERSE_FRAMES = 600;
export declare const BOOST_FRAMES = 600;
/**
 * Every item id this engine can actually carry out.
 *
 * The TGM preset was already filtered to these (TGM_RUNTIME_ITEMS); ALL, FEW
 * and DS were not, so with those presets most pickups did nothing at all -
 * the DS pool in particular is {6,7,12,13,18,26} and only one of those six
 * had an effect. drawItem() rejects the rest now, exactly as the TGM draw
 * already rejected its own.
 */
export declare const IMPLEMENTED_ITEMS: readonly number[];
/** TGM_PRESET_ITEMS minus TGM_NOT_IMPLEMENTED_ITEMS - what the engine actually draws. */
export declare const TGM_RUNTIME_ITEMS: readonly number[];
/** Sum of ITEM_WEIGHTS (gamestart.c:3320-3324 item_pronum). */
export declare function totalItemWeight(pool?: readonly number[]): number;
/**
 * One draw from the full weighted table (gamestart.c:6999-7010 / 7046-7057):
 * `tmp2 = gameRand(item_pronum); tmp = 1; do { tmp2 -= item_pro[tmp-1]; if
 * (tmp2 < 0) break; tmp++; } while(...)`. Cumulative-weight sampling.
 */
export declare function drawWeightedItem(rng?: () => number): number;
/**
 * Five-slot rolling history (gamestart.c `itemhistory[2*5]`, one player's
 * slice is itemhistory[0..4]). ALL/TGM check and shift all five slots
 * (gamestart.c:7011-7024, 7059-7066); FEW/DS only ever touch slot 0
 * (gamestart.c:7030-7034, 7042-7043) - passing a length-5 array to those
 * presets still works since they only read/write index 0.
 */
export declare function createItemHistory(): number[];
/**
 * Draw the next item for a preset, matching gamestart.c:6994-7068. `history`
 * is mutated in place (matches the reference's itemhistory[] side effect).
 */
export declare function drawItem(preset: ItemPresetName, history: number[], rng?: () => number): number;
/**
 * Items applied to the collector (gamestart.c's "support items" - set on
 * `player`, not `enemy`, in eraseItem): ^DEL(17), vDEL(18), DELEVEN(19),
 * FREEFALL(28), <-MOV(29), ->MOV(30). Everything else in TGM_RUNTIME_ITEMS
 * is an attack (set on `enemy`), matching eraseItem's exclusion list at
 * gamestart.c:13451-13454 (17,18,19,28,29,30 are excluded from `attack=1`).
 */
export declare const SELF_TARGET_ITEMS: ReadonlySet<number>;
export declare function isSelfTargetItem(itemId: number): boolean;
/**
 * MIRROR (1): flip the field left-right. gamestart.c:9057-9088 fldMirrorProc
 * animates this column-by-column but the end state is a full horizontal
 * mirror of every row (fld[(w-1-j)] = old fld[j]).
 */
export declare function mirrorBoard(board: Board): void;
/**
 * ^DEL FIELD (17): clear the top half of the stack. gamestart.c:8738-8752
 * `j = (22-checkFieldTop)/2; for(i=checkFieldTop; i<=22; i++){ erase[i]=1;
 * j--; if(j<0) break; }` - marks rows starting at the top for roughly half
 * the field height, then runs them through the normal clear-and-collapse
 * pipeline (statErase). We reproduce the "top half, roughly" rule and let
 * the caller run the door's own clearLines() on the returned rows.
 */
export declare function topDeleteRows(board: Board): number[];
/**
 * vDEL FIELD (18): clear the bottom half of the stack. gamestart.c:8753-8767
 * `j = (22-checkFieldTop)/2; for(i=22; i>checkFieldTop; i--){ erase[i]=1;
 * j--; if(j<0) break; }` - mirror image of topDeleteRows.
 */
export declare function bottomDeleteRows(board: Board): number[];
/**
 * DELEVEN (19): clear every other row. gamestart.c:8768-8780 `for(i=22;
 * i>=checkFieldTop; i--){ erase[i]=1; i--; }` - marks the bottom row, skips
 * one, marks the next, etc.
 */
export declare function everyOtherDeleteRows(board: Board): number[];
/**
 * LASER (21): destroy every block in one column. gamestart.c:14065-14150
 * statLaser - after an interactive aim phase (not reproducible in a
 * non-interactive door), the fired laser empties fld/fldt/fldi/flds for
 * every row at the chosen column (gamestart.c:14128-14140). We keep that
 * discrete effect and simplify the delivery: fire immediately at a supplied
 * column instead of the aim-then-fire minigame.
 */
export declare function laserColumn(board: Board, x: number): void;
/**
 * NEGA (22): invert every cell in the stack (filled<->empty).
 * gamestart.c:14224-14267 statNegafield - row by row from checkFieldTop
 * down, `if(fld!=0) fld=0; else if(y>=nega_pos) fld=(y%7)+2` (a generic
 * block, not a specific piece colour).
 */
export declare function negateBoard(board: Board): void;
/**
 * SHOTGUN (23): destroy one random filled block per row.
 * gamestart.c:14287-14318 statShotgun - `for(i=checkFieldTop;i<22;i++){
 * pick random x where fld[x,i]!=0; clear it; }`.
 */
export declare function shotgunBoard(board: Board, rng?: () => number): void;
/**
 * EXCHG (24): swap two boards' contents entirely.
 * gamestart.c:14358-14420 statExchangefield copies fld/fldt/fldi/flds from
 * the opponent's buffered field wholesale.
 */
export declare function swapBoards(a: Board, b: Board): void;
/**
 * FREEFALL (28): close every vertical gap - every column's blocks fall to
 * the bottom, keeping relative order. gamestart.c:14864-14903 statFreefall
 * cascades each floating cell down one row at a time per column; the net
 * result is a plain per-column compaction, which is what we compute
 * directly.
 */
export declare function freefallCompact(board: Board, top?: number): void;
/**
 * <-MOV / ->MOV FIELD (29/30): close every horizontal gap in each row,
 * sliding blocks toward the chosen wall. gamestart.c:15040-15113
 * statMovfield cascades each row's cells toward the wall one step at a
 * time; the net result is a plain per-row compaction toward that wall.
 */
export declare function movCompact(board: Board, direction: 'left' | 'right', top?: number): void;
/**
 * 180 FIELD (31): flip the stack upside-down within the playable field
 * (row order reversed; each row keeps its own column contents - this is a
 * vertical flip, not a point rotation). gamestart.c:15132-15175
 * stat180field: `fld[j + (i+top)*w] = fldbuf[j + (h-i)*w]` - column index j
 * is unchanged, only the row is reversed.
 */
export declare function flipVertical(board: Board, top?: number): void;
export interface ItemEffectResult {
    /**
     * Pieces the target spends under BIG (DEATH BLOCK, item 3): eraseItem sets
     * IsBig (gamestart.c:13502-13503) and the per-piece expiry clears it once
     * item_t passes 1 (gamestart.c:7097-7100) - two pieces.
     */
    bigPieces?: number;
    /**
     * Pieces the target spends auto-rotating (ROLL ROLL, item 2): eraseItem
     * sets isrollroll (gamestart.c:13497-13500), expiry clears it once item_t
     * passes 3 (gamestart.c:7092-7095) - four pieces.
     */
    rollRollPieces?: number;
    /**
     * Frame-timed effects (HeborisCE item_timer, gamestart.c:13517-13563) as
     * opposed to the piece-counted ones above:
     *   ROTATE LOCK (6)  600 frames - the piece cannot be turned (ars.c:83)
     *   HIDE NEXT (7)    900 frames - the NEXT queue is not drawn
     *   <->REV (11)      600 frames - left and right swap (ars.c:238)
     *   BOOST (12)       600 frames - the piece falls at 20G (ars.c:34-38)
     */
    rotateLockFrames?: number;
    hideNextFrames?: number;
    lrReverseFrames?: number;
    boostFrames?: number;
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
export declare function applySelfItem(itemId: number, board: Board): ItemEffectResult;
/**
 * Apply an enemy-targeted item to the target board. `selfBoard`/`rng` are
 * only used by items that need them (EXCHG, LASER, SHOTGUN).
 */
export declare function applyEnemyItem(itemId: number, targetBoard: Board, selfBoard: Board, rng?: () => number): ItemEffectResult;
export type { PieceType };
//# sourceMappingURL=items.d.ts.map