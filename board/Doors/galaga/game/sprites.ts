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

export const EMPTY: Cell = { ch: ' ', fg: 'white' };

export const COLORS = {
  player: 'lightcyan',
  bee: 'lightyellow',
  butterfly: 'lightred',
  boss: 'lightgreen',
  captured: 'lightmagenta',
  bullet: 'lightwhite',
  enemyBullet: 'lightred',
  explosion: 'lightyellow',
  star: 'gray',
  starBright: 'lightwhite',
};

export const cell = (ch: string, fg: string, bg?: string): Cell => ({ ch, fg, bg });

/**
 * A solid block of colour with a glyph on it.
 *
 * Reported: "i see no bg ansi colors". Everything was a bright character on
 * the terminal's own background, which reads as coloured text rather than as
 * a sprite. The CELL carries the colour now and the glyph sits on it.
 *
 * The STARFIELD deliberately stays a plain dim character: it is scenery
 * behind the game, and painting it as blocks would turn the sky into a wall
 * of colour and bury everything that matters on top of it.
 */
const block = (ch: string, colour: string): Cell => ({ ch, fg: 'black', bg: colour });

/** A background star, dim or bright by its own brightness. */
export function starCell(brightness: number): Cell {
  const ch = brightness === 0 ? '.' : brightness === 1 ? '+' : '*';
  return { ch, fg: brightness >= 2 ? COLORS.starBright : COLORS.star };
}

/**
 * A bullet. The enemy's is RED and the player's white - they used to be a
 * gray dot and a white bar, and the gray dot was indistinguishable from the
 * starfield behind it.
 */
export function bulletCell(isEnemy: boolean): Cell {
  return isEnemy ? block('.', COLORS.enemyBullet) : block('|', COLORS.bullet);
}

/** An alien, in the colour of its own kind. */
export function alienCell(ch: string, type: string, captured: boolean): Cell {
  if (captured) return block(ch, COLORS.captured);
  const colour =
    type === 'bee' ? COLORS.bee :
    type === 'butterfly' ? COLORS.butterfly :
    COLORS.boss;
  return block(ch, colour);
}

export function playerCell(ch: string): Cell {
  return block(ch, COLORS.player);
}

export function explosionCell(ch: string): Cell {
  return block(ch, COLORS.explosion);
}

/** Paint one cell. Blank space stays untagged - the sky is mostly empty. */
export function paint(c: Cell): string {
  if (c.ch === ' ' && !c.bg) return ' ';
  const bg = c.bg ? `{${c.bg}-bg}` : '';
  return `${bg}{${c.fg}-fg}${c.ch}{/}`;
}
