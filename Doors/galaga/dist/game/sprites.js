"use strict";
/**
 * The characters and colours Galaga is drawn with.
 *
 * Colour was decided AFTER drawing, by matching the glyph in the buffer, and
 * three different things are drawn with '.':
 *
 *   a background star, an ENEMY BULLET, and the last frame of an explosion
 *
 * The matcher painted every '.' gray, so incoming enemy fire was drawn
 * exactly like a background star - the one thing on screen that can kill you,
 * disguised as scenery. '*' and '+' collided the same way between stars and
 * explosions.
 *
 * Cells carry their own colour now, written by the code that knows what it
 * is drawing. Deliberately ASCII: this goes down a BBS line.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cell = exports.COLORS = exports.EMPTY = void 0;
exports.starCell = starCell;
exports.bulletCell = bulletCell;
exports.alienCell = alienCell;
exports.playerCell = playerCell;
exports.explosionCell = explosionCell;
exports.paint = paint;
exports.EMPTY = { ch: ' ', fg: 'white' };
exports.COLORS = {
    player: 'lightcyan',
    bee: 'lightyellow',
    butterfly: 'lightred',
    boss: 'lightgreen',
    captured: 'lightmagenta',
    bullet: 'lightwhite',
    enemyBullet: 'lightred',
    explosion: 'lightyellow',
    star: 'gray',
    starBright: 'lightwhite',
};
const cell = (ch, fg, bg) => ({ ch, fg, bg });
exports.cell = cell;
/**
 * A solid block of colour with a glyph on it.
 *
 * Reported: "i see no bg ansi colors". Everything was a bright character on
 * the terminal's own background, which reads as coloured text rather than as
 * a sprite. The CELL carries the colour now and the glyph sits on it.
 *
 * The STARFIELD deliberately stays a plain dim character: it is scenery
 * behind the game, and painting it as blocks would turn the sky into a wall
 * of colour and bury everything that matters on top of it.
 */
const block = (ch, colour) => ({ ch, fg: 'black', bg: colour });
/** A background star, dim or bright by its own brightness. */
function starCell(brightness) {
    const ch = brightness === 0 ? '.' : brightness === 1 ? '+' : '*';
    return { ch, fg: brightness >= 2 ? exports.COLORS.starBright : exports.COLORS.star };
}
/**
 * A bullet. The enemy's is RED and the player's white - they used to be a
 * gray dot and a white bar, and the gray dot was indistinguishable from the
 * starfield behind it.
 */
function bulletCell(isEnemy) {
    return isEnemy ? block('.', exports.COLORS.enemyBullet) : block('|', exports.COLORS.bullet);
}
/** An alien, in the colour of its own kind. */
function alienCell(ch, type, captured) {
    if (captured)
        return block(ch, exports.COLORS.captured);
    const colour = type === 'bee' ? exports.COLORS.bee :
        type === 'butterfly' ? exports.COLORS.butterfly :
            exports.COLORS.boss;
    return block(ch, colour);
}
function playerCell(ch) {
    return block(ch, exports.COLORS.player);
}
function explosionCell(ch) {
    return block(ch, exports.COLORS.explosion);
}
/** Paint one cell. Blank space stays untagged - the sky is mostly empty. */
function paint(c) {
    if (c.ch === ' ' && !c.bg)
        return ' ';
    const bg = c.bg ? `{${c.bg}-bg}` : '';
    return `${bg}{${c.fg}-fg}${c.ch}{/}`;
}
//# sourceMappingURL=sprites.js.map