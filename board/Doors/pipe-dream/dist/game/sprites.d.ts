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
import { PipeType } from './types';
/** Every cell is three columns, as the grid has always been. */
export declare const CELL_WIDTH = 3;
/** How full a pipe must be before it counts as flooded. */
export declare const FILLED_ABOVE = 50;
/** Backgrounds: what the cell is made of. */
export declare const BG_COLORS: {
    empty: string;
    pipe: string;
    partial: string;
    flooded: string;
    obstacle: string;
    start: string;
    end: string;
};
/** Foregrounds: what is drawn on it. */
export declare const SPRITE_FG: {
    empty: string;
    pipe: string;
    partial: string;
    flooded: string;
    obstacle: string;
    start: string;
    end: string;
    reservoir: string;
};
/**
 * The pipe shapes, three columns each.
 *
 * The corners are drawn so the run of pipe actually meets its neighbours:
 * a north-east corner leaves the cell upwards and to the right, so it is
 * drawn as a bend opening those ways rather than as the letter 'L'.
 */
export declare const PIPE_GLYPHS: Record<PipeType, string>;
export declare const EMPTY_GLYPH = " . ";
export declare const OBSTACLE_GLYPH = "###";
export interface Sprite {
    /** Exactly CELL_WIDTH characters. */
    text: string;
    fg: string;
    bg: string;
}
/** Paint a sprite as a blessed-tagged run. */
export declare function paint(sprite: Sprite): string;
/** Draw a sprite as the cursor: the same shape, inverted. */
export declare function asCursor(sprite: Sprite): string;
/** How far along the flooding this cell is. */
export declare function fillStage(fillLevel: number): 'dry' | 'partial' | 'flooded';
/**
 * The sprite for one cell of the grid.
 *
 * @param pipe        the pipe in this cell, or null for open grid
 * @param fillLevel   0..100, how much water has reached it
 * @param isObstacle  a square that can never take a pipe
 * @param startArrow  which way the source points, drawn in the start cell
 */
export declare function cellSprite(pipe: PipeType | null, fillLevel: number, isObstacle: boolean, startArrow?: string): Sprite;
