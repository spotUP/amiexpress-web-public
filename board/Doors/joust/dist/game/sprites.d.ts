/**
 * The characters and colours Joust is drawn with.
 *
 * Two things were wrong with the old board.
 *
 * The buzzards were drawn '{' and '}' - which are blessed's own tag
 * delimiters. Every enemy on screen emitted a bare brace into tagged
 * content, where '{' begins a colour tag and '}' ends one. That is not a
 * character the renderer can be relied upon to paint.
 *
 * And colour was decided AFTER the fact, by matching the glyph that had been
 * written into the buffer: the renderer asked "is this character the enemy
 * character?" and, if so, searched the enemy list by position to find out
 * what colour it should have been. The information was thrown away at draw
 * time and reconstructed afterwards. Now the colour is written alongside the
 * glyph, by the code that knows which bird it is drawing.
 *
 * Deliberately ASCII: the board goes down a BBS line where the high-bit
 * glyphs depend on the client's font.
 */
/** A drawn cell: one character, and the colours it is drawn in. */
export interface Cell {
    ch: string;
    fg: string;
    bg?: string;
}
/** The empty sky. */
export declare const EMPTY: Cell;
/** Glyphs. None of them may be a brace - see the note above. */
export declare const GLYPHS: {
    playerRight: string;
    playerLeft: string;
    playerFlap: string;
    enemyRight: string;
    enemyLeft: string;
    egg: string;
    eggHatching: string;
    pterodactyl: string;
    platform: string;
    lava: string;
    lavaHand: string;
};
export declare const COLORS: {
    player: string;
    platform: string;
    platformEdge: string;
    lava: string;
    lavaBg: string;
    egg: string;
    eggHatching: string;
    pterodactyl: string;
    enemyFallback: string;
};
/** The rider, facing the way it is travelling, or flapping. */
export declare function playerCell(direction: string, flapping: boolean): Cell;
/** A buzzard, in the colour of its own kind. */
export declare function enemyCell(direction: string, colour: string | undefined): Cell;
/** An egg, brighter once it is hatching so it reads as a warning. */
export declare function eggCell(hatching: boolean): Cell;
export declare function pterodactylCell(): Cell;
export declare function platformCell(): Cell;
/** Lava, which churns between two glyphs and sits on a hot background. */
export declare function lavaCell(frame: number): Cell;
/**
 * Paint one cell.
 *
 * Blank sky is emitted as a plain space rather than a tagged one: a board is
 * mostly empty, and wrapping every space in colour tags multiplies the bytes
 * on the wire by about eight for no visible difference.
 */
export declare function paint(cell: Cell): string;
