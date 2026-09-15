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
const garbage_2 = require("./garbage");
function afterLock(ctx) {
    const result = {
        markedRowsCleared: 0,
        markedRows: ctx.markedRows,
        eraserRemaining: ctx.eraserRemaining,
        stageCleared: false,
        stageIndex: ctx.stageIndex,
        riseIndex: ctx.riseIndex,
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
        result.riseIndex = 0;
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
    /*
     * THE FLOOR COMES UP, and WHAT comes up depends on who asked.
     *
     * A TARGET stage carries the rows its own floor rises with, and spends them
     * in order (`gamestart.c:8348-8360` copies from `tomoyo_rise_fld`, tracking
     * how far it has got): those rows are part of the stage's design, so a
     * random garbage row would be a different puzzle. DEVIL 800 asks for the
     * garbage instead (mission.c:1394-1399).
     *
     * Both are counted in PIECES LOCKED - the reference spends the stage's
     * interval inside `statBlock`, its per-piece handler (gamestart.c:6908) -
     * so a player's only clock is their own placing.
     */
    const stage = ctx.stages[result.stageIndex];
    const stageRise = stage?.riseEveryPieces ?? 0;
    const modifierRise = ctx.modifiers?.riseEveryPieces ?? 0;
    const due = (interval) => interval > 0 && ctx.piecesPlaced > 0 && ctx.piecesPlaced % interval === 0;
    if (stage && stageRise > 0 && due(stageRise)) {
        const row = (0, stage_1.riseRow)(stage, result.riseIndex);
        // A stage whose rows have all been spent stops rising rather than
        // repeating them.
        if (row) {
            (0, garbage_2.riseRowOnto)(ctx.board, row);
            result.riseIndex += 1;
        }
    }
    else if (due(modifierRise)) {
        (0, garbage_1.riseGarbageRow)(ctx.board);
    }
    return result;
}
//# sourceMappingURL=mission-hooks.js.map