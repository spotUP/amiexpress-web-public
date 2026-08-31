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
/** Every cell is two columns, so a cell is roughly square on a terminal. */
export declare const CELL_WIDTH = 2;
/** What each thing is painted on. */
export declare const BG_COLORS: {
    floor: string;
    ice: string;
    wall: string;
    diamond: string;
    egg: string;
};
/** What each thing is drawn in. */
export declare const SPRITE_FG: {
    pengo: string;
    enemy: string;
    enemyStunned: string;
    ice: string;
    wall: string;
    diamond: string;
    egg: string;
};
/**
 * Ice is a pale block with a crack across it, so a pushable block reads as a
 * solid object rather than as texture. The wall is a brick course.
 */
export declare const ICE_GLYPH = "::";
export declare const WALL_GLYPH = "##";
export declare const DIAMOND_GLYPH = "<>";
export declare const EGG_GLYPH = "00";
export declare const PENGO_GLYPH = "()";
export declare const ENEMY_GLYPH = "%%";
export declare const FLOOR_GLYPH = "  ";
/**
 * The opposite of each of the sixteen colours.
 *
 * Pengo walks over floor, and stands beside ice and walls of very different
 * brightness. Frogger hit the same problem and solved it the same way: take
 * the far side of the colour wheel so the sprite cannot vanish into whatever
 * it happens to be standing on.
 */
export declare const COLOR_COMPLEMENT: Record<string, string>;
export interface Sprite {
    /** Exactly CELL_WIDTH characters. */
    text: string;
    fg: string;
    bg: string;
}
/** Paint a sprite as a blessed-tagged run. */
export declare function paint(sprite: Sprite): string;
/** The sprite for a piece of the maze. */
export declare function terrainSprite(cell: string): Sprite;
/**
 * The penguin, drawn against whatever it is standing on.
 *
 * Pengo can only ever stand on floor today, but it takes the complement of
 * the ground anyway - the same rule Frogger's frog uses - so that a level
 * which later lets it stand on anything else cannot make it invisible.
 */
export declare function pengoSprite(groundBg?: string): Sprite;
/** A Sno-Bee. Stunned ones are drawn in the warning colour. */
export declare function enemySprite(stunned: boolean, groundBg?: string): Sprite;
/** An unhatched egg. */
export declare function eggSprite(groundBg?: string): Sprite;
//# sourceMappingURL=sprites.d.ts.map