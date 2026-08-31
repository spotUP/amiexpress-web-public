"use strict";
/**
 * The board as cells: pure in (data, sheet, tick).
 *
 * Layer order is meaning: terrain first, then eggs, then Sno-Bees, then
 * the penguin - the player is never hidden by scenery. Everything the
 * previous glyph renderer decided by matching characters in a string is
 * decided here by which sprite was blitted, which is why the "colour
 * chosen after drawing" class of bug cannot recur.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBoard = buildBoard;
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const constants_1 = require("./constants");
/** How long a pushed block keeps its slide flash, in ticks. */
const SLIDE_FLASH_TICKS = 5;
/** How long the walls rattle after a shake. */
const WALL_SHAKE_TICKS = 6;
/** An egg this close to hatching cracks visibly. */
const HATCH_WARNING = 30;
function buildBoard(data, sheet, tick) {
    const board = (0, cell_art_1.createBuffer)(constants_1.BOARD_COLS, constants_1.BOARD_ROWS);
    const sliding = (x, y) => !!data.lastSlide && data.lastSlide.x === x && data.lastSlide.y === y &&
        tick - data.lastSlide.tick <= SLIDE_FLASH_TICKS;
    const wallsShaking = !!data.wallShake && tick - data.wallShake.tick <= WALL_SHAKE_TICKS;
    // Terrain
    for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
        for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
            switch (data.grid[y]?.[x]) {
                case 'wall':
                    (0, cell_art_1.blitSprite)(board, sheet['wall'], wallsShaking ? 'shake' : 'idle', tick, x, y);
                    break;
                case 'ice':
                    (0, cell_art_1.blitSprite)(board, sheet['ice'], sliding(x, y) ? 'sliding' : 'idle', tick, x, y);
                    break;
                case 'diamond':
                    (0, cell_art_1.blitSprite)(board, sheet['diamond'], 'sparkle', tick, x, y);
                    break;
                // 'empty': transparent floor; the fallback paints it black.
            }
        }
    }
    // Eggs
    for (const egg of data.eggs) {
        const anim = egg.hatchTimer <= HATCH_WARNING ? 'hatching' : 'idle';
        const sprite = anim === 'hatching' ? sheet['sno-bee'] : sheet['egg'];
        (0, cell_art_1.blitSprite)(board, sprite, anim === 'hatching' ? 'hatching' : 'idle', tick, egg.x, egg.y);
    }
    // Sno-Bees
    for (const enemy of data.enemies) {
        if (enemy.state === 'dead')
            continue;
        (0, cell_art_1.blitSprite)(board, sheet['sno-bee'], enemy.state === 'stunned' ? 'stunned' : 'crawl', tick, enemy.x, enemy.y);
    }
    // The penguin, last and on top.
    const p = data.pengo;
    if (p.isDead) {
        (0, cell_art_1.blitSprite)(board, sheet['pengo'], 'death', p.deathFrame, p.x, p.y);
    }
    else if (p.isPushing) {
        (0, cell_art_1.blitSprite)(board, sheet['pengo'], 'push', p.pushFrame, p.x, p.y);
    }
    else {
        (0, cell_art_1.blitSprite)(board, sheet['pengo'], `walk-${p.direction}`, tick, p.x, p.y);
    }
    return board;
}
//# sourceMappingURL=render.js.map