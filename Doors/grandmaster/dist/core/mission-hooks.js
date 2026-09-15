"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.afterLock = afterLock;
/**
 * What a MISSION does to the board after a piece locks.
 *
 * Four of the reference's mission types change the board itself once the
 * clears are settled, and they all happen in the same breath: ERASER claims
 * the marked rows the piece sat in, TARGET notices an emptied stage and lays
 * out the next, MIRROR flips the stack, and DEVIL 800's floor comes up. Kept
 * together here, out of `core/game.ts`, because each is a RULE rather than
 * engine machinery - and because the order they run in matters and is easier
 * to see in one place than spread through a 2000-line lock.
 */
const eraser_1 = require("./eraser");
const board_writes_1 = require("./board-writes");
const garbage_1 = require("./garbage");
const square_1 = require("./square");
const stage_1 = require("./stage");
function afterLock(ctx) {
    const result = {
        markedRowsCleared: 0,
        markedRows: ctx.markedRows,
        eraserRemaining: ctx.eraserRemaining,
        stageCleared: false,
        stageIndex: ctx.stageIndex,
        square: 0,
    };
    /*
     * ERASER: a marked row is claimed when the piece that just locked SAT IN it
     * and it was cleared (mission.c:905-947). A fresh pattern appears once every
     * marked row has gone and the norm is not met.
     */
    if (ctx.markedRows.length > 0) {
        const claim = (0, eraser_1.claimMarkedRows)(ctx.markedRows, ctx.occupiedRows, ctx.clearedRows);
        result.markedRowsCleared = claim.claimed.length;
        result.markedRows = claim.remaining;
        result.eraserRemaining = Math.max(0, ctx.eraserRemaining - claim.claimed.length);
        if (result.markedRows.length === 0 && ctx.eraserPattern && result.eraserRemaining > 0) {
            result.markedRows = (0, eraser_1.chooseMarkedRows)(ctx.eraserPattern, result.eraserRemaining, ctx.board.height);
        }
    }
    /*
     * TARGET: the stage is cleared the moment its last platinum block goes, and
     * the next is laid out over a wiped field (mission.c:882-902). Checked after
     * the line clears, because clearing a line is how a platinum block leaves.
     */
    if (ctx.stages.length > 0 && (0, stage_1.platinumLeft)(ctx.board) === 0) {
        result.stageCleared = true;
        result.stageIndex = ctx.stageIndex + 1;
        const next = ctx.stages[result.stageIndex];
        if (next)
            (0, stage_1.applyStage)(ctx.board, next);
    }
    /*
     * SQUARE runs after the clears too, so a square broken up by the line that
     * completed it does not count (gamestart.c:8678-8683).
     */
    if (ctx.squareMode)
        result.square = (0, square_1.makeSquares)(ctx.board);
    // MIRROR flips the stack after EVERY piece in MISSION mode
    // (gamestart.c:9055) - not on a timer, which is what makes it a mode.
    if (ctx.modifiers?.mirror)
        (0, board_writes_1.mirrorBoard)(ctx.board);
    // DEVIL 800's floor: one row every N pieces LOCKED, not every N seconds
    // (mission.c:1394-1399), so a player's only clock is their own placing.
    const rise = ctx.modifiers?.riseEveryPieces ?? 0;
    if (rise > 0 && ctx.piecesPlaced > 0 && ctx.piecesPlaced % rise === 0) {
        (0, garbage_1.riseGarbageRow)(ctx.board);
    }
    return result;
}
//# sourceMappingURL=mission-hooks.js.map