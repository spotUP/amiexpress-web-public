"use strict";
/**
 * The characters and colours the board is drawn with.
 *
 * Pengo drew one ASCII letter per cell - 'P' for the penguin, 'S' for a
 * Sno-Bee, '#' for a block of ice - and then padded the row out by pushing a
 * space between every character. A letter reads as a letter: '#' is not ice
 * and 'S' is not a bee, and a board of letters reads as text rather than as
 * an arcade screen.
 *
 * Same approach Frogger took: solid coloured cells with a character sprite
 * laid over them. Every cell is exactly CELL_WIDTH characters wide, so a row
 * is the width it claims to be and nothing has to be padded afterwards.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLOR_COMPLEMENT = exports.FLOOR_GLYPH = exports.ENEMY_GLYPH = exports.PENGO_GLYPH = exports.EGG_GLYPH = exports.DIAMOND_GLYPH = exports.WALL_GLYPH = exports.ICE_GLYPH = exports.SPRITE_FG = exports.BG_COLORS = exports.CELL_WIDTH = void 0;
exports.paint = paint;
exports.terrainSprite = terrainSprite;
exports.pengoSprite = pengoSprite;
exports.enemySprite = enemySprite;
exports.eggSprite = eggSprite;
/** Every cell is two columns, so a cell is roughly square on a terminal. */
exports.CELL_WIDTH = 2;
/** What each thing is painted on. */
exports.BG_COLORS = {
    floor: 'black',
    ice: 'lightcyan',
    wall: 'blue',
    diamond: 'black',
    egg: 'black',
};
/** What each thing is drawn in. */
exports.SPRITE_FG = {
    pengo: 'lightyellow',
    enemy: 'lightred',
    enemyStunned: 'yellow',
    ice: 'white',
    wall: 'lightblue',
    diamond: 'lightyellow',
    egg: 'lightmagenta',
};
/**
 * Ice is a pale block with a crack across it, so a pushable block reads as a
 * solid object rather than as texture. The wall is a brick course.
 */
exports.ICE_GLYPH = '::';
exports.WALL_GLYPH = '##';
exports.DIAMOND_GLYPH = '<>';
exports.EGG_GLYPH = '00';
exports.PENGO_GLYPH = '()';
exports.ENEMY_GLYPH = '%%';
exports.FLOOR_GLYPH = '  ';
/**
 * The opposite of each of the sixteen colours.
 *
 * Pengo walks over floor, and stands beside ice and walls of very different
 * brightness. Frogger hit the same problem and solved it the same way: take
 * the far side of the colour wheel so the sprite cannot vanish into whatever
 * it happens to be standing on.
 */
exports.COLOR_COMPLEMENT = {
    black: 'lightwhite',
    red: 'lightcyan',
    green: 'lightmagenta',
    yellow: 'lightblue',
    blue: 'lightyellow',
    magenta: 'lightgreen',
    cyan: 'lightred',
    white: 'black',
    gray: 'lightwhite',
    lightred: 'cyan',
    lightgreen: 'magenta',
    lightyellow: 'blue',
    lightblue: 'yellow',
    lightmagenta: 'green',
    lightcyan: 'red',
    lightwhite: 'black',
};
/** Paint a sprite as a blessed-tagged run. */
function paint(sprite) {
    return `{${sprite.bg}-bg}{${sprite.fg}-fg}${sprite.text}{/}`;
}
/** The sprite for a piece of the maze. */
function terrainSprite(cell) {
    switch (cell) {
        case 'wall':
            return { text: exports.WALL_GLYPH, fg: exports.SPRITE_FG.wall, bg: exports.BG_COLORS.wall };
        case 'ice':
            return { text: exports.ICE_GLYPH, fg: exports.SPRITE_FG.ice, bg: exports.BG_COLORS.ice };
        case 'diamond':
            return { text: exports.DIAMOND_GLYPH, fg: exports.SPRITE_FG.diamond, bg: exports.BG_COLORS.diamond };
        default:
            return { text: exports.FLOOR_GLYPH, fg: 'white', bg: exports.BG_COLORS.floor };
    }
}
/**
 * The penguin, drawn against whatever it is standing on.
 *
 * Pengo can only ever stand on floor today, but it takes the complement of
 * the ground anyway - the same rule Frogger's frog uses - so that a level
 * which later lets it stand on anything else cannot make it invisible.
 */
function pengoSprite(groundBg = exports.BG_COLORS.floor) {
    return {
        text: exports.PENGO_GLYPH,
        fg: exports.SPRITE_FG.pengo,
        bg: groundBg,
    };
}
/** A Sno-Bee. Stunned ones are drawn in the warning colour. */
function enemySprite(stunned, groundBg = exports.BG_COLORS.floor) {
    return {
        text: exports.ENEMY_GLYPH,
        fg: stunned ? exports.SPRITE_FG.enemyStunned : exports.SPRITE_FG.enemy,
        bg: groundBg,
    };
}
/** An unhatched egg. */
function eggSprite(groundBg = exports.BG_COLORS.egg) {
    return { text: exports.EGG_GLYPH, fg: exports.SPRITE_FG.egg, bg: groundBg };
}
//# sourceMappingURL=sprites.js.map