/**
 * The characters and colours Zoo Keeper is drawn with.
 *
 * The old renderer decided colour AFTER drawing, by inspecting the character
 * that had been written into the buffer - and in places by GUESSING from it
 * with regexes like /[ESCRML]/ and /[EXTRALIFE!x0-9]/, or by searching
 * ANIMAL_STATS for whichever animal happened to use that glyph.
 *
 * That cannot work, and the source says so itself:
 *
 *   zeke: '@',
 *   zekeWithNet: '@',  // Same char, different color
 *
 * Two states drawn with one character, told apart only by a colour the
 * renderer had to reconstruct from the character. Carrying the net - the
 * thing that decides whether you can catch an animal or must run from it -
 * was invisible.
 *
 * Cells carry their own colour now, written by the code that knows what it
 * is drawing. Deliberately ASCII: this goes down a BBS line where high-bit
 * glyphs depend on the client's font.
 */
import { AnimalType } from './types';
/**
 * How many characters wide one logical cell is drawn.
 *
 * A terminal character is about twice as tall as it is wide, so a board
 * measured in single characters is not square: one step up covers roughly
 * twice the visual distance of one step sideways. Super Qix solves this by
 * drawing every logical cell CELL_WIDTH characters wide, and this door now
 * does the same - 40 logical columns rendered as 80 characters.
 */
export declare const CELL_WIDTH = 2;
/** A drawn cell: a glyph, and the colours the whole cell is painted in. */
export interface Cell {
    ch: string;
    fg: string;
    bg: string;
}
export declare const EMPTY: Cell;
/**
 * A colour per animal.
 *
 * ANIMAL_STATS gives three of the six the same yellow (camel, moose, lion)
 * and two the same gray (elephant, rhino) - so the lion, worth 30,000 and
 * the fastest thing in the zoo, was drawn exactly like a camel worth 1,000.
 * Six animals, six colours.
 *
 * The hues were checked against the sprite sheet of the PICO-8 Zoo Keeper
 * cart on the Lexaloffle BBS (zookeeper-0), decoded and looked at rather than
 * guessed: the elephants are light grey, the snakes bright green, the big
 * cats orange and yellow, the rhinos grey-lavender. Colour choices only - no
 * art or code is taken from it, and none could be: an 8x8 sprite does not
 * fit in a one-character cell. Credit to its author.
 */
export declare const ANIMAL_COLORS: Record<AnimalType, string>;
export declare const COLORS: {
    zeke: string;
    zekeWithNet: string;
    zelda: string;
    monkey: string;
    coconut: string;
    fuse: string;
    fuseEnd: string;
    wall: string;
    wallDamaged: string;
    cage: string;
    bonus: string;
};
/**
 * The bonus items, in the colours of the fruit they are.
 *
 * They were all one yellow. The cart draws a banana, cherries, a melon and a
 * clover, each its own colour, and they are worth different amounts - so
 * telling them apart at a glance is worth something.
 */
export declare const BONUS_COLORS: Record<string, string>;
/**
 * Every colour a terminal can actually paint.
 *
 * Named because it is easy to write a colour that reads well in source and
 * means nothing on the wire - 'brown' was in here for exactly one commit.
 */
export declare const TERMINAL_COLORS: ReadonlySet<string>;
export declare const cell: (ch: string, fg: string, bg?: string) => Cell;
/**
 * Zeke, and whether he is holding the net.
 *
 * Same glyph, deliberately - it is the same man - but a colour that says at
 * a glance whether he can catch anything right now.
 */
export declare function zekeCell(hasNet: boolean): Cell;
/** An animal, in the colour of its own kind. */
export declare function animalCell(ch: string, type: AnimalType): Cell;
/** A section of cage wall, redder as it takes damage. */
export declare function wallCell(ch: string, damaged?: boolean): Cell;
export declare function zeldaCell(): Cell;
export declare function monkeyCell(): Cell;
export declare function coconutCell(): Cell;
/** The burning fuse, and its lit head. */
export declare function fuseCell(isEnd: boolean): Cell;
/**
 * A bonus letter or digit floating on the board.
 *
 * `kind` names the fruit when the caller knows it, so a banana and a cherry
 * are not the same yellow.
 */
export declare function bonusCell(ch: string, kind?: string): Cell;
/**
 * Paint one cell.
 *
 * Blank space is emitted untagged: the board is mostly empty and tagging
 * every space multiplies the bytes going down the line for no difference.
 */
export declare function paint(c: Cell): string;
//# sourceMappingURL=sprites.d.ts.map