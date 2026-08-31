/**
 * Pipe Dream is drawn with sprites, and the water is visible.
 *
 * It drew flat ASCII on the terminal's own background: a pipe was a yellow
 * '|' and a pipe full of water was a cyan '|'. Empty and flooded differed by
 * the colour of one character - and that is the single most important thing
 * on the board, because the whole game is a race against water you can watch
 * coming. The water is the cell's background now, so a flooded run reads as
 * a channel of water with the pipe drawn through it.
 */
/** Every cell is exactly the grid's cell width - the grid depends on it. */
export declare function everyCellIsExactlyThreeColumns(): Promise<void>;
/**
 * A flooded pipe is a different BACKGROUND, not just a different letter
 * colour. This is the regression that matters: the old board showed the
 * water only as a foreground colour change.
 */
export declare function waterFillsTheCellNotJustTheGlyph(): Promise<void>;
/** The fill threshold is honoured exactly as the engine states it. */
export declare function theFillThresholdIsHonoured(): Promise<void>;
/** An obstacle can never be mistaken for open grid. */
export declare function anObstacleIsUnmistakable(): Promise<void>;
/** The source shows which way it will push water. */
export declare function theStartCellShowsItsDirection(): Promise<void>;
/**
 * Every pipe is drawn ASCII.
 *
 * The board goes down a BBS line where a high-bit box-drawing character is a
 * different glyph depending on the client's font. A pipe that renders as an
 * accented letter on somebody's terminal is worse than a plain one.
 */
export declare function everyPipeIsPlainAscii(): Promise<void>;
/** Corners are drawn as bends, not as letters. */
export declare function cornersAreDrawnAsBendsNotLetters(): Promise<void>;
/** The renderer paints sprites rather than hand-built strings. */
export declare function theRendererUsesTheSpriteLayer(): Promise<void>;
