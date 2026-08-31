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
export const CELL_WIDTH = 2;

/** What each thing is painted on. */
export const BG_COLORS = {
  floor: 'black',
  ice: 'lightcyan',
  wall: 'blue',
  diamond: 'black',
  egg: 'black',
};

/** What each thing is drawn in. */
export const SPRITE_FG = {
  pengo: 'lightyellow',
  enemy: 'lightred',
  enemyStunned: 'yellow',
  ice: 'white',
  wall: 'lightblue',
  diamond: 'lightyellow',
  egg: 'lightmagenta',
};

/**
 * Ice is a pale block with a crack across it, so a pushable block reads as a
 * solid object rather than as texture. The wall is a brick course.
 */
export const ICE_GLYPH = '::';
export const WALL_GLYPH = '##';
export const DIAMOND_GLYPH = '<>';
export const EGG_GLYPH = '00';
export const PENGO_GLYPH = '()';
export const ENEMY_GLYPH = '%%';
export const FLOOR_GLYPH = '  ';

/**
 * The opposite of each of the sixteen colours.
 *
 * Pengo walks over floor, and stands beside ice and walls of very different
 * brightness. Frogger hit the same problem and solved it the same way: take
 * the far side of the colour wheel so the sprite cannot vanish into whatever
 * it happens to be standing on.
 */
export const COLOR_COMPLEMENT: Record<string, string> = {
  black: 'lightwhite',
  red: 'lightcyan',
  green: 'lightmagenta',
  yellow: 'lightblue',
  blue: 'lightyellow',
  magenta: 'lightgreen',
  cyan: 'lightred',
  white: 'black',
  gray: 'lightwhite',
  lightred: 'cyan',
  lightgreen: 'magenta',
  lightyellow: 'blue',
  lightblue: 'yellow',
  lightmagenta: 'green',
  lightcyan: 'red',
  lightwhite: 'black',
};

export interface Sprite {
  /** Exactly CELL_WIDTH characters. */
  text: string;
  fg: string;
  bg: string;
}

/** Paint a sprite as a blessed-tagged run. */
export function paint(sprite: Sprite): string {
  return `{${sprite.bg}-bg}{${sprite.fg}-fg}${sprite.text}{/}`;
}

/** The sprite for a piece of the maze. */
export function terrainSprite(cell: string): Sprite {
  switch (cell) {
    case 'wall':
      return { text: WALL_GLYPH, fg: SPRITE_FG.wall, bg: BG_COLORS.wall };
    case 'ice':
      return { text: ICE_GLYPH, fg: SPRITE_FG.ice, bg: BG_COLORS.ice };
    case 'diamond':
      return { text: DIAMOND_GLYPH, fg: SPRITE_FG.diamond, bg: BG_COLORS.diamond };
    default:
      return { text: FLOOR_GLYPH, fg: 'white', bg: BG_COLORS.floor };
  }
}

/**
 * The penguin, drawn against whatever it is standing on.
 *
 * Pengo can only ever stand on floor today, but it takes the complement of
 * the ground anyway - the same rule Frogger's frog uses - so that a level
 * which later lets it stand on anything else cannot make it invisible.
 */
export function pengoSprite(groundBg: string = BG_COLORS.floor): Sprite {
  return {
    text: PENGO_GLYPH,
    fg: SPRITE_FG.pengo,
    bg: groundBg,
  };
}

/** A Sno-Bee. Stunned ones are drawn in the warning colour. */
export function enemySprite(stunned: boolean, groundBg: string = BG_COLORS.floor): Sprite {
  return {
    text: ENEMY_GLYPH,
    fg: stunned ? SPRITE_FG.enemyStunned : SPRITE_FG.enemy,
    bg: groundBg,
  };
}

/** An unhatched egg. */
export function eggSprite(groundBg: string = BG_COLORS.egg): Sprite {
  return { text: EGG_GLYPH, fg: SPRITE_FG.egg, bg: groundBg };
}
