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
/** A drawn cell: one character and the colours it is drawn in. */
export interface Cell {
    ch: string;
    fg: string;
    bg?: string;
}
export declare const EMPTY: Cell;
/**
 * A colour per animal.
 *
 * ANIMAL_STATS gives three of the six the same yellow (camel, moose, lion)
 * and two the same gray (elephant, rhino) - so the lion, worth 30,000 and
 * the fastest thing in the zoo, was drawn exactly like a camel worth 1,000.
 * Six animals, six colours, brightest for the ones that matter most.
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
/** A bonus letter or digit floating on the board. */
export declare function bonusCell(ch: string): Cell;
/**
 * Paint one cell.
 *
 * Blank space is emitted untagged: the board is mostly empty and tagging
 * every space multiplies the bytes going down the line for no difference.
 */
export declare function paint(c: Cell): string;
//# sourceMappingURL=sprites.d.ts.map