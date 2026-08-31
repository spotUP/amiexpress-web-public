/**
 * The characters and colours Donkey Kong is drawn with.
 *
 * The board was a plain character buffer, and colour was worked out
 * AFTERWARDS by matching the glyph that had been written into it. That is
 * not merely indirect - it was wrong, because two different things are drawn
 * with the same character:
 *
 *   playerClimb: 'H'   and   ladder: 'H'
 *
 * The matcher tested the ladder first, so a climbing Mario was painted in
 * the ladder's colour and disappeared into it for the whole climb - which is
 * most of the game.
 *
 * Cells carry their own colour now, written by the code that knows what it
 * is drawing. Deliberately ASCII: this goes down a BBS line where high-bit
 * glyphs depend on the client's font.
 */
/** A drawn cell: one character and the colours it is drawn in. */
export interface Cell {
    ch: string;
    fg: string;
    bg?: string;
}
export declare const EMPTY: Cell;
export declare const COLORS: {
    girder: string;
    conveyor: string;
    ladder: string;
    ladderBroken: string;
    player: string;
    playerHammer: string;
    barrel: string;
    blueBarrel: string;
    fireball: string;
    dk: string;
    pauline: string;
    rivet: string;
    hammer: string;
    elevator: string;
    spring: string;
};
export declare const cell: (ch: string, fg: string, bg?: string) => Cell;
/**
 * A solid block of colour with a glyph on it.
 *
 * Reported: "i see no bg ansi colors". Everything was a bright character on
 * the terminal's own background, which reads as coloured text rather than as
 * a sprite. The CELL carries the colour now and the glyph sits on it.
 *
 * Empty space stays untagged - the screen is mostly air, and tagging every
 * space multiplies the bytes on a BBS line for no visible difference.
 */
export declare const block: (ch: string, colour: string) => Cell;
/**
 * Paint one cell.
 *
 * Blank space is emitted untagged: the board is mostly empty and tagging
 * every space multiplies the bytes on the wire for no visible difference.
 */
export declare function paint(c: Cell): string;
