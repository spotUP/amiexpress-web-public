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

export const EMPTY: Cell = { ch: ' ', fg: 'white' };

/**
 * A colour per animal.
 *
 * ANIMAL_STATS gives three of the six the same yellow (camel, moose, lion)
 * and two the same gray (elephant, rhino) - so the lion, worth 30,000 and
 * the fastest thing in the zoo, was drawn exactly like a camel worth 1,000.
 * Six animals, six colours, brightest for the ones that matter most.
 */
export const ANIMAL_COLORS: Record<AnimalType, string> = {
  elephant: 'white',
  snake: 'lightgreen',
  camel: 'yellow',
  rhino: 'lightblue',
  moose: 'lightred',
  lion: 'lightyellow',
};

export const COLORS = {
  zeke: 'lightcyan',
  zekeWithNet: 'lightgreen',
  zelda: 'lightmagenta',
  monkey: 'yellow',
  coconut: 'lightyellow',
  fuse: 'lightred',
  fuseEnd: 'lightyellow',
  wall: 'gray',
  wallDamaged: 'lightred',
  cage: 'lightblue',
  bonus: 'lightyellow',
};

export const cell = (ch: string, fg: string, bg?: string): Cell => ({ ch, fg, bg });

/**
 * Zeke, and whether he is holding the net.
 *
 * Same glyph, deliberately - it is the same man - but a colour that says at
 * a glance whether he can catch anything right now.
 */
export function zekeCell(hasNet: boolean): Cell {
  return { ch: '@', fg: hasNet ? COLORS.zekeWithNet : COLORS.zeke };
}

/** An animal, in the colour of its own kind. */
export function animalCell(ch: string, type: AnimalType): Cell {
  return { ch, fg: ANIMAL_COLORS[type] || 'white' };
}

/** A section of cage wall, redder as it takes damage. */
export function wallCell(ch: string, damaged: boolean = false): Cell {
  return { ch, fg: damaged ? COLORS.wallDamaged : COLORS.wall };
}

export function zeldaCell(): Cell {
  return { ch: 'Z', fg: COLORS.zelda };
}

export function monkeyCell(): Cell {
  return { ch: 'm', fg: COLORS.monkey };
}

export function coconutCell(): Cell {
  return { ch: 'o', fg: COLORS.coconut };
}

/** The burning fuse, and its lit head. */
export function fuseCell(isEnd: boolean): Cell {
  return isEnd
    ? { ch: '*', fg: COLORS.fuseEnd }
    : { ch: '=', fg: COLORS.fuse };
}

/** A bonus letter or digit floating on the board. */
export function bonusCell(ch: string): Cell {
  return { ch, fg: COLORS.bonus };
}

/**
 * Paint one cell.
 *
 * Blank space is emitted untagged: the board is mostly empty and tagging
 * every space multiplies the bytes going down the line for no difference.
 */
export function paint(c: Cell): string {
  if (c.ch === ' ' && !c.bg) return ' ';
  const bg = c.bg ? `{${c.bg}-bg}` : '';
  return `${bg}{${c.fg}-fg}${c.ch}{/}`;
}
