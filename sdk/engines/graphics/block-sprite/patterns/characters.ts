/**
 * Character Sprite Patterns
 *
 * Pre-built sprite frames for common game characters using
 * Unicode block characters.
 */

import { BlockFrame, AnsiColor } from '../types';
import { frameFromBlocks, recolorFrame } from '../sprite-sheet';

/**
 * Generic humanoid character (3x3)
 */
export const HUMANOID: Record<string, BlockFrame[]> = {
  idle: [frameFromBlocks([
    ' ▄ ',
    '███',
    '▀ ▀',
  ])],

  walk: [
    frameFromBlocks([
      ' ▄ ',
      '███',
      '▀ ▀',
    ]),
    frameFromBlocks([
      ' ▄ ',
      '███',
      ' ▀▀',
    ]),
    frameFromBlocks([
      ' ▄ ',
      '███',
      '▀ ▀',
    ]),
    frameFromBlocks([
      ' ▄ ',
      '███',
      '▀▀ ',
    ]),
  ],

  jump: [frameFromBlocks([
    ' ▄ ',
    '▐█▌',
    ' ▀ ',
  ])],
};

/**
 * Frog character for Frogger-style games (3x2)
 */
export const FROG = {
  idle: [frameFromBlocks([
    '▄█▄',
    '█▀█',
  ], 'green')],

  hop: [
    frameFromBlocks([
      '▄█▄',
      '█▀█',
    ], 'green'),
    frameFromBlocks([
      ' █ ',
      '█▀█',
    ], 'green'),
    frameFromBlocks([
      ' ▄ ',
      '█▀█',
    ], 'green'),
  ],
};

/**
 * Spaceship for shooters (3x2)
 */
export const SPACESHIP = {
  idle: [frameFromBlocks([
    ' ▲ ',
    '◄█►',
  ], 'cyan')],

  thrust: [
    frameFromBlocks([
      ' ▲ ',
      '◄█►',
    ], 'cyan'),
    frameFromBlocks([
      ' ▲ ',
      '◄█►',
    ], 'cyan'),
  ],

  bank_left: [frameFromBlocks([
    ' ▲ ',
    '◄█ ',
  ], 'cyan')],

  bank_right: [frameFromBlocks([
    ' ▲ ',
    ' █►',
  ], 'cyan')],
};

/**
 * Ghost enemy (3x3)
 */
export const GHOST = {
  float: [
    frameFromBlocks([
      '▄▄▄',
      '█▀█',
      '▀▄▀',
    ], 'white'),
    frameFromBlocks([
      '▄▄▄',
      '█▀█',
      '▄▀▄',
    ], 'white'),
  ],
};

/**
 * Dragon/Dinosaur character for Bubble Bobble style (4x3)
 */
export const DRAGON = {
  idle: [frameFromBlocks([
    ' ▄▄ ',
    '████',
    '▀  ▀',
  ], 'green')],

  walk: [
    frameFromBlocks([
      ' ▄▄ ',
      '████',
      '▀  ▀',
    ], 'green'),
    frameFromBlocks([
      ' ▄▄ ',
      '████',
      ' ▀▀ ',
    ], 'green'),
  ],

  blow: [frameFromBlocks([
    ' ▄▄○',
    '████',
    '▀  ▀',
  ], 'green')],
};

/**
 * Bird character for Joust-style games (4x2)
 */
export const BIRD = {
  idle: [frameFromBlocks([
    ' ▄▄▄',
    '▀██▀',
  ], 'yellow')],

  flap: [
    frameFromBlocks([
      ' ▄▄▄',
      '▀██▀',
    ], 'yellow'),
    frameFromBlocks([
      '▄▄▄▄',
      ' ██ ',
    ], 'yellow'),
    frameFromBlocks([
      ' ▄▄▄',
      '▀██▀',
    ], 'yellow'),
    frameFromBlocks([
      ' ▄▄ ',
      '▄██▄',
    ], 'yellow'),
  ],
};

/**
 * Penguin character for Pengo-style games (3x3)
 */
export const PENGUIN = {
  idle: [frameFromBlocks([
    ' ▄ ',
    '▐█▌',
    '▀█▀',
  ], 'cyan')],

  walk: [
    frameFromBlocks([
      ' ▄ ',
      '▐█▌',
      '▀█▀',
    ], 'cyan'),
    frameFromBlocks([
      ' ▄ ',
      '▐█▌',
      '█▀▀',
    ], 'cyan'),
    frameFromBlocks([
      ' ▄ ',
      '▐█▌',
      '▀█▀',
    ], 'cyan'),
    frameFromBlocks([
      ' ▄ ',
      '▐█▌',
      '▀▀█',
    ], 'cyan'),
  ],

  push: [frameFromBlocks([
    ' ▄ ',
    '▐██',
    '▀█▀',
  ], 'cyan')],
};

/**
 * Enemy bee/insect (2x2)
 */
export const BEE = {
  fly: [
    frameFromBlocks([
      '▄▄',
      '▀▀',
    ], 'yellow'),
    frameFromBlocks([
      '▀▀',
      '▄▄',
    ], 'yellow'),
  ],
};

/**
 * Car for racing/traffic games (4x2)
 */
export const CAR = {
  right: [frameFromBlocks([
    '▄██▄',
    '█▀▀█',
  ])],

  left: [frameFromBlocks([
    '▄██▄',
    '█▀▀█',
  ])],

  up: [frameFromBlocks([
    '▐██▌',
    '▐▀▀▌',
  ])],

  down: [frameFromBlocks([
    '▐▄▄▌',
    '▐██▌',
  ])],
};

/**
 * Truck for traffic games (5x2)
 */
export const TRUCK = {
  right: [frameFromBlocks([
    '▄████',
    '█▀▀▀█',
  ])],

  left: [frameFromBlocks([
    '████▄',
    '█▀▀▀█',
  ])],
};

/**
 * Log for river crossing games (4x1)
 */
export const LOG = {
  default: [frameFromBlocks([
    '████',
  ], 'yellow')],
};

/**
 * Turtle for river crossing games (2x1)
 */
export const TURTLE = {
  swim: [
    frameFromBlocks([
      '▄▄',
    ], 'green'),
    frameFromBlocks([
      '▀▀',
    ], 'green'),
  ],

  dive: [
    frameFromBlocks([
      '▄▄',
    ], 'green'),
    frameFromBlocks([
      '░░',
    ], 'green'),
    frameFromBlocks([
      '  ',
    ], 'green'),
  ],
};

/**
 * Ice block for Pengo-style games (2x2)
 */
export const ICE_BLOCK = {
  solid: [frameFromBlocks([
    '██',
    '██',
  ], 'cyan')],

  cracking: [
    frameFromBlocks([
      '██',
      '██',
    ], 'cyan'),
    frameFromBlocks([
      '▓▓',
      '▓▓',
    ], 'cyan'),
    frameFromBlocks([
      '▒▒',
      '▒▒',
    ], 'cyan'),
    frameFromBlocks([
      '░░',
      '░░',
    ], 'cyan'),
  ],
};

/**
 * Bubble for Bubble Bobble style (2x2)
 */
export const BUBBLE = {
  float: [
    frameFromBlocks([
      '▄▄',
      '▀▀',
    ], 'cyan'),
    frameFromBlocks([
      '▄▄',
      '▀▀',
    ], 'brightCyan'),
  ],

  pop: [
    frameFromBlocks([
      '▄▄',
      '▀▀',
    ], 'cyan'),
    frameFromBlocks([
      '░░',
      '░░',
    ], 'cyan'),
    frameFromBlocks([
      '  ',
      '  ',
    ]),
  ],
};

/**
 * Helper to create a colored variant of a character sprite
 */
export function recolorCharacter(
  sprites: Record<string, BlockFrame[]>,
  fg?: AnsiColor,
  bg?: AnsiColor
): Record<string, BlockFrame[]> {
  const result: Record<string, BlockFrame[]> = {};

  for (const [name, frames] of Object.entries(sprites)) {
    result[name] = frames.map(frame => recolorFrame(frame, fg, bg));
  }

  return result;
}

/**
 * All character patterns indexed by name
 */
export const CHARACTER_PATTERNS = {
  humanoid: HUMANOID,
  frog: FROG,
  spaceship: SPACESHIP,
  ghost: GHOST,
  dragon: DRAGON,
  bird: BIRD,
  penguin: PENGUIN,
  bee: BEE,
  car: CAR,
  truck: TRUCK,
  log: LOG,
  turtle: TURTLE,
  iceBlock: ICE_BLOCK,
  bubble: BUBBLE,
} as const;
