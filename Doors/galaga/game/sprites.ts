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
  return isEnemy
    ? { ch: '.', fg: COLORS.enemyBullet }
    : { ch: '|', fg: COLORS.bullet };
}

/** An alien, in the colour of its own kind. */
export function alienCell(ch: string, type: string, captured: boolean): Cell {
  if (captured) return { ch, fg: COLORS.captured };
  const fg =
    type === 'bee' ? COLORS.bee :
    type === 'butterfly' ? COLORS.butterfly :
    COLORS.boss;
  return { ch, fg };
}

export function playerCell(ch: string): Cell {
  return { ch, fg: COLORS.player };
}

export function explosionCell(ch: string): Cell {
  return { ch, fg: COLORS.explosion };
}

/** Paint one cell. Blank space stays untagged - the sky is mostly empty. */
export function paint(c: Cell): string {
  if (c.ch === ' ' && !c.bg) return ' ';
  const bg = c.bg ? `{${c.bg}-bg}` : '';
  return `${bg}{${c.fg}-fg}${c.ch}{/}`;
}
