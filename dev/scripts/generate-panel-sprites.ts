/**
 * Generate TETRIS ATTACK's panel sprite sheets.
 *
 *   npx tsx dev/scripts/generate-panel-sprites.ts
 *
 * Emits Doors/grandmaster/sprites/*.sprite.json - two variants of every panel,
 * because the two screens this door serves cannot use the same art:
 *
 *   panel-<name>          80 columns and wider. A shape on a coloured ground,
 *                         the way the SNES draws it.
 *   panel-<name>-c64      exactly 40 columns, PETSCII. A block glyph in a pen
 *                         colour on black.
 *
 * The C64 variant is not a downgrade of the first, it is a different encoding.
 * PETSCII has NO per-cell background - the transducer never emits one - so a
 * cell that says "heart on red" arrives as "heart on black", and the heart
 * itself is not in the character set either: the table maps every card suit to
 * '*'. So the C64 sheet says the same thing with the two properties that do
 * survive, a block SHAPE and a pen COLOUR.
 *
 * Colours are ANSI indices into cell-art's PALETTE. For the C64 sheet they are
 * chosen from the bright half on purpose: ANSI blue and dark grey land on VIC-II
 * colours that read as empty against a black screen.
 *
 * A panel is TWO characters wide and ONE row tall. That is forced, not chosen:
 * twelve panel rows have to leave room for a HUD in twenty-five terminal rows,
 * and a character cell is roughly twice as tall as it is wide, so 2x1 is the
 * shape that reads square. The whole board is then 12x12 characters and the
 * same geometry serves 80, wide and 40 columns.
 *
 * This file is the source of truth for the sheets; regenerate rather than
 * hand-editing if the palette changes. Refining the art by hand afterwards in
 * SPRITE STUDIO is expected - that is what it is for - but a regeneration will
 * overwrite it, so land deliberate art changes here.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/** A cell as the sprite format stores it, or null for transparent. */
type RawCell = [string, number, number] | null;
type RawFrame = RawCell[][];

interface RawAnimation {
  ticksPerFrame: number;
  loop: boolean;
  frames: RawFrame[];
}

interface RawSprite {
  name: string;
  cellW: number;
  cellH: number;
  animations: Record<string, RawAnimation>;
}

const CELL_W = 2;
const CELL_H = 1;

/** ANSI palette indices, by the names cell-art uses. */
const C = {
  black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7,
  gray: 8, lightred: 9, lightgreen: 10, lightyellow: 11, lightblue: 12,
  lightmagenta: 13, lightcyan: 14, lightwhite: 15,
} as const;

interface PanelDef {
  /** Sprite name; the colour index the engine uses is the array position + 1. */
  name: string;
  /** The block the 80-column sheet draws this panel with. */
  shape: string;
  /**
   * A different block for the right-hand cell, where the pair is the shape.
   *
   * Only the white panel uses it: a left half block beside a right half block
   * reads as one solid tile with a seam, which is how it stays distinct from
   * the full block in another colour.
   */
  shapeRight?: string;
  /** Ground colour at 80 columns. */
  bg: number;
  /** Ink for the shape at 80 columns. */
  fg: number;
  /** The block glyph that survives to a C64. */
  c64Left: string;
  c64Right: string;
  /** Pen colour on the C64, from the bright half of the palette. */
  c64Fg: number;
}

/**
 * The seven colours plus shock, in the engine's own order: colour 1 is hearts,
 * 2 circles, 3 triangles, 4 stars, 5 diamonds, 6 inverse triangles, 7 squares,
 * 8 shock.
 *
 * THE SHAPES ARE BLOCKS, NOT SYMBOLS, and that is not a style choice.
 *
 * The first version of this table used the SNES set - a heart, a circle, a
 * star - and they are simply not in the character set an Amiga terminal
 * draws: the caller saw substitution glyphs where the board should be
 * (reported live, 2026-09-03). Every other arcade door on this board draws
 * with the CP437 block elements for exactly this reason; pengo and frogger
 * use nothing but the full block and the two half blocks.
 *
 * So each panel is a block, chosen so that no two read alike in a single
 * colour - colour alone is not enough on a screen with sixteen of them, and
 * is no help at all to a colour-blind player.
 */
const PANELS: PanelDef[] = [
  { name: 'heart',    shape: '█', bg: C.red,       fg: C.lightwhite, c64Left: '█', c64Right: '█', c64Fg: C.lightred },
  { name: 'circle',   shape: '▒', bg: C.green,     fg: C.lightwhite, c64Left: '▒', c64Right: '▒', c64Fg: C.lightgreen },
  { name: 'triangle', shape: '▄', bg: C.cyan,      fg: C.black,      c64Left: '▄', c64Right: '▄', c64Fg: C.lightcyan },
  { name: 'star',     shape: '▀', bg: C.yellow,    fg: C.black,      c64Left: '▀', c64Right: '▀', c64Fg: C.lightyellow },
  { name: 'diamond',  shape: '▓', bg: C.magenta,   fg: C.lightwhite, c64Left: '▚', c64Right: '▚', c64Fg: C.lightmagenta },
  { name: 'inverse',  shape: '░', bg: C.lightblue, fg: C.black,      c64Left: '▞', c64Right: '▞', c64Fg: C.lightblue },
  { name: 'square',   shape: '▌', shapeRight: '▐', bg: C.white, fg: C.black,      c64Left: '▌', c64Right: '▐', c64Fg: C.lightwhite },
  { name: 'shock',    shape: '!',      bg: C.gray,      fg: C.lightwhite, c64Left: '!',      c64Right: '!',      c64Fg: C.white },
];

/** One 2x1 frame from its two cells. */
function frame(left: RawCell, right: RawCell): RawFrame {
  return [[left, right]];
}

function still(left: RawCell, right: RawCell): RawAnimation {
  return { ticksPerFrame: 1, loop: false, frames: [frame(left, right)] };
}

/**
 * Build one panel's animations.
 *
 * The animation NAMES are the engine's panel states, so the renderer can ask
 * for `panel.state` directly, plus `danger` which is a display concern. They
 * match the names panel-attack's own sprite-sheet manifests use.
 */
function animationsFor(
  left: RawCell,
  right: RawCell,
  flashLeft: RawCell,
  flashRight: RawCell,
  faceLeft: RawCell,
  faceRight: RawCell,
  dimLeft: RawCell,
  dimRight: RawCell,
): Record<string, RawAnimation> {
  return {
    // Sitting there.
    normal: still(left, right),
    // Mid-swap and falling look like a normal panel; the renderer moves them.
    swapping: still(left, right),
    falling: still(left, right),
    hovering: still(left, right),
    // Matched: flashing, then holding the face until the pop timers start.
    flash: { ticksPerFrame: 2, loop: true, frames: [frame(left, right), frame(flashLeft, flashRight)] },
    face: still(faceLeft, faceRight),
    // Popping brightens out. The engine decides WHEN; this is only the look.
    popping: {
      ticksPerFrame: 1,
      loop: false,
      frames: [frame(faceLeft, faceRight), frame(flashLeft, flashRight), frame(null, null)],
    },
    // The row below the floor, waiting to come into play.
    dimmed: still(dimLeft, dimRight),
    // A short squash as it settles.
    landing: { ticksPerFrame: 1, loop: false, frames: [frame(flashLeft, flashRight), frame(left, right)] },
    // Near the top: pulses so the danger is visible without colour alone.
    danger: { ticksPerFrame: 2, loop: true, frames: [frame(left, right), frame(faceLeft, faceRight)] },
  };
}

/** The 80-column variant: a shape on a coloured ground. */
function wideSprite(def: PanelDef): RawSprite {
  // BOTH cells carry the block. A block on the left and a blank on the right
  // reads as half a panel with a gap; the pair reads as one tile, which is
  // what a panel is.
  const right = def.shapeRight ?? def.shape;
  const body: RawCell = [def.shape, def.fg, def.bg];
  const filler: RawCell = [right, def.fg, def.bg];
  // Flash inverts the ink and the ground, which reads at any size.
  const flash: RawCell = [def.shape, def.bg, def.fg];
  const flashFill: RawCell = [right, def.bg, def.fg];
  // The matched face, before the pop.
  const face: RawCell = ['·', def.fg, def.bg];
  const faceFill: RawCell = ['·', def.fg, def.bg];
  const dim: RawCell = [def.shape, C.gray, C.black];
  const dimFill: RawCell = [right, C.gray, C.black];

  return {
    name: `panel-${def.name}`,
    cellW: CELL_W,
    cellH: CELL_H,
    animations: animationsFor(
      body, filler, flash, flashFill, face, faceFill, dim, dimFill,
    ),
  };
}

/**
 * The C64 variant: a block glyph in a pen colour, on black.
 *
 * Never sets a background other than 0. PETSCII has none, so anything else is
 * silently dropped and the two variants would disagree about what a panel is.
 */
function c64Sprite(def: PanelDef): RawSprite {
  const left: RawCell = [def.c64Left, def.c64Fg, C.black];
  const right: RawCell = [def.c64Right, def.c64Fg, C.black];
  // Flashing swaps to white, which every VIC-II colour contrasts with.
  const flashL: RawCell = [def.c64Left, C.lightwhite, C.black];
  const flashR: RawCell = [def.c64Right, C.lightwhite, C.black];
  // The face is a lighter shade of the same shape, so it reads as the same panel.
  const faceL: RawCell = ['▒', def.c64Fg, C.black];
  const faceR: RawCell = ['▒', def.c64Fg, C.black];
  const dimL: RawCell = [def.c64Left, C.gray, C.black];
  const dimR: RawCell = [def.c64Right, C.gray, C.black];

  return {
    name: `panel-${def.name}-c64`,
    cellW: CELL_W,
    cellH: CELL_H,
    animations: animationsFor(left, right, flashL, flashR, faceL, faceR, dimL, dimR),
  };
}

function main(): void {
  const outDir = join(__dirname, '..', '..', 'Doors', 'grandmaster', 'sprites');
  mkdirSync(outDir, { recursive: true });

  const sprites: RawSprite[] = [];
  for (const def of PANELS) {
    sprites.push(wideSprite(def));
    sprites.push(c64Sprite(def));
  }

  for (const sprite of sprites) {
    const path = join(outDir, `${sprite.name}.sprite.json`);
    writeFileSync(path, `${JSON.stringify(sprite, null, 1)}\n`, 'utf8');
  }

  // eslint-disable-next-line no-console
  console.log(`wrote ${sprites.length} sprites to ${outDir}`);
}

main();
