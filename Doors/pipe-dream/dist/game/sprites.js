/**
 * The characters and colours the grid is drawn with.
 *
 * Pipe Dream drew flat ASCII on the terminal's own background: a pipe was a
 * yellow '|' and a pipe full of water was a cyan '|'. The only difference
 * between "empty" and "flooded" was the colour of one character, which is
 * the single most important thing on the board to be able to read at a
 * glance - the whole game is a race against water you can see coming.
 *
 * Same approach Frogger and Pengo take: a coloured cell with a shape laid
 * over it. Water is now the cell's BACKGROUND, so a flooded pipe is a block
 * of water with the pipe drawn through it, and a half-filled one is visibly
 * between the two.
 *
 * Deliberately ASCII. The board is drawn over a BBS line where the high-bit
 * box-drawing characters are a different glyph depending on the client's
 * font, and a pipe that renders as an accented letter on somebody's terminal
 * is worse than a plain one that renders everywhere.
 */
/** Every cell is three columns, as the grid has always been. */
export const CELL_WIDTH = 3;
/** How full a pipe must be before it counts as flooded. */
export const FILLED_ABOVE = 50;
/** Backgrounds: what the cell is made of. */
export const BG_COLORS = {
    empty: 'black',
    pipe: 'black',
    partial: 'blue',
    flooded: 'cyan',
    obstacle: 'red',
    start: 'green',
    end: 'magenta',
};
/** Foregrounds: what is drawn on it. */
export const SPRITE_FG = {
    empty: 'gray',
    pipe: 'lightyellow',
    partial: 'lightcyan',
    flooded: 'lightblue',
    obstacle: 'lightwhite',
    start: 'lightwhite',
    end: 'lightwhite',
    reservoir: 'lightcyan',
};
/**
 * The pipe shapes, three columns each.
 *
 * The corners are drawn so the run of pipe actually meets its neighbours:
 * a north-east corner leaves the cell upwards and to the right, so it is
 * drawn as a bend opening those ways rather than as the letter 'L'.
 */
export const PIPE_GLYPHS = {
    vertical: ' | ',
    horizontal: '---',
    cornerNE: " '-",
    cornerNW: "-' ",
    cornerSE: ' .-',
    cornerSW: '-. ',
    cross: '-+-',
    start: '[>]',
    end: '[E]',
    reservoir: '[o]',
    oneWay: ' v ',
};
export const EMPTY_GLYPH = ' . ';
export const OBSTACLE_GLYPH = '###';
/** Paint a sprite as a blessed-tagged run. */
export function paint(sprite) {
    return `{${sprite.bg}-bg}{${sprite.fg}-fg}${sprite.text}{/}`;
}
/** Draw a sprite as the cursor: the same shape, inverted. */
export function asCursor(sprite) {
    return `{lightwhite-bg}{black-fg}${sprite.text}{/}`;
}
/** How far along the flooding this cell is. */
export function fillStage(fillLevel) {
    if (fillLevel > FILLED_ABOVE)
        return 'flooded';
    if (fillLevel > 0)
        return 'partial';
    return 'dry';
}
/**
 * The sprite for one cell of the grid.
 *
 * @param pipe        the pipe in this cell, or null for open grid
 * @param fillLevel   0..100, how much water has reached it
 * @param isObstacle  a square that can never take a pipe
 * @param startArrow  which way the source points, drawn in the start cell
 */
export function cellSprite(pipe, fillLevel, isObstacle, startArrow = '>') {
    if (isObstacle) {
        return { text: OBSTACLE_GLYPH, fg: SPRITE_FG.obstacle, bg: BG_COLORS.obstacle };
    }
    if (!pipe) {
        return { text: EMPTY_GLYPH, fg: SPRITE_FG.empty, bg: BG_COLORS.empty };
    }
    const stage = fillStage(fillLevel);
    if (pipe === 'start') {
        return { text: `[${startArrow}]`, fg: SPRITE_FG.start, bg: BG_COLORS.start };
    }
    if (pipe === 'end') {
        return { text: PIPE_GLYPHS.end, fg: SPRITE_FG.end, bg: BG_COLORS.end };
    }
    // Everything else is pipe, and the water is the background: a flooded run
    // reads as a solid channel of water with the pipe drawn through it.
    const bg = stage === 'flooded' ? BG_COLORS.flooded :
        stage === 'partial' ? BG_COLORS.partial :
            BG_COLORS.pipe;
    const fg = stage === 'flooded' ? SPRITE_FG.flooded :
        stage === 'partial' ? SPRITE_FG.partial :
            pipe === 'reservoir' ? SPRITE_FG.reservoir :
                SPRITE_FG.pipe;
    return { text: PIPE_GLYPHS[pipe], fg, bg };
}
