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
export interface Cell {
    ch: string;
    fg: string;
    bg?: string;
}
export declare const EMPTY: Cell;
export declare const COLORS: {
    player: string;
    bee: string;
    butterfly: string;
    boss: string;
    captured: string;
    bullet: string;
    enemyBullet: string;
    explosion: string;
    star: string;
    starBright: string;
};
export declare const cell: (ch: string, fg: string, bg?: string) => Cell;
/** A background star, dim or bright by its own brightness. */
export declare function starCell(brightness: number): Cell;
/**
 * A bullet. The enemy's is RED and the player's white - they used to be a
 * gray dot and a white bar, and the gray dot was indistinguishable from the
 * starfield behind it.
 */
export declare function bulletCell(isEnemy: boolean): Cell;
/** An alien, in the colour of its own kind. */
export declare function alienCell(ch: string, type: string, captured: boolean): Cell;
export declare function playerCell(ch: string): Cell;
export declare function explosionCell(ch: string): Cell;
/** Paint one cell. Blank space stays untagged - the sky is mostly empty. */
export declare function paint(c: Cell): string;
//# sourceMappingURL=sprites.d.ts.map