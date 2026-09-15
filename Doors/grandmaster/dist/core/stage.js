"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPlatinum = isPlatinum;
exports.stageCell = stageCell;
exports.applyStage = applyStage;
exports.platinumLeft = platinumLeft;
exports.stageOrder = stageOrder;
exports.loadStages = loadStages;
/**
 * The colour an ordinary stage block is drawn in.
 *
 * The reference's block ids are its own palette; a door that has seven piece
 * colours spends them in order, so a stage keeps the SHAPE of its colouring -
 * two blocks that matched in the reference still match here.
 */
const STAGE_COLOURS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
/** Is this cell character a platinum block - the thing TARGET is about? */
function isPlatinum(char) {
    return char >= 'A' && char <= 'Z';
}
/** Turn one stage character into a cell. */
function stageCell(char) {
    if (char === '.') {
        return { filled: false, color: null, locked: false };
    }
    const platinum = isPlatinum(char);
    const index = platinum
        ? char.charCodeAt(0) - 'A'.charCodeAt(0)
        : char.charCodeAt(0) - '1'.charCodeAt(0);
    return {
        filled: true,
        color: STAGE_COLOURS[((index % STAGE_COLOURS.length) + STAGE_COLOURS.length) % STAGE_COLOURS.length],
        locked: true,
        platinum: platinum || undefined,
    };
}
/**
 * Lay a stage out on the board.
 *
 * The stage's 21 rows sit at the BOTTOM of the field: the reference writes
 * them from index 10 of a 220-cell field (`tomoyo.c:1412`), which is one row
 * of spawn space above them, and this board is taller still.
 */
function applyStage(board, stage) {
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            board.grid[y][x] = { filled: false, color: null, locked: false };
        }
    }
    const top = board.height - stage.rows.length;
    for (let row = 0; row < stage.rows.length; row++) {
        const y = top + row;
        if (y < 0)
            continue;
        for (let x = 0; x < board.width && x < stage.rows[row].length; x++) {
            board.grid[y][x] = stageCell(stage.rows[row][x]);
        }
    }
}
/** How many platinum blocks are left - zero means the stage is cleared. */
function platinumLeft(board) {
    let left = 0;
    for (let y = 0; y < board.height; y++) {
        for (const cell of board.grid[y]) {
            if (cell.filled && cell.platinum)
                left++;
        }
    }
    return left;
}
/**
 * Which stages a mission plays, in order.
 *
 * The reference takes a MINSTAGE and a MAXSTAGE and, with RANDTGT set, picks
 * at random inside that band (`mission.c:244-330`); with it off the stages
 * run in order from the minimum.
 */
function stageOrder(stages, min, max, count, random = null) {
    const first = Math.max(0, Math.min(min, stages.length - 1));
    const last = Math.max(first, Math.min(max, stages.length - 1));
    const band = stages.slice(first, last + 1);
    if (band.length === 0)
        return [];
    const order = [];
    for (let i = 0; i < count; i++) {
        order.push(random
            ? band[Math.min(band.length - 1, Math.floor(random() * band.length))]
            : band[i % band.length]);
    }
    return order;
}
/**
 * Read the shipped stages.
 *
 * `assets/`, not `data/`: stages are CONTENT that ships with the door, the
 * way the mission packs are. A board with no stage file simply has no TARGET
 * missions - the loader refuses them by name - rather than a door that will
 * not start.
 */
function loadStages(file) {
    const fs = require('fs');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || !Array.isArray(raw.stages)) {
        throw new Error(`${file}: no stages in it`);
    }
    for (const stage of raw.stages) {
        if (typeof stage.id !== 'string' || !Array.isArray(stage.rows)) {
            throw new Error(`${file}: a stage has no id or no rows`);
        }
    }
    return raw.stages;
}
//# sourceMappingURL=stage.js.map