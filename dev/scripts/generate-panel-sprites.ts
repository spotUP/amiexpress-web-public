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
/** A PETSCII cell is square, so one of them IS the square tile. */
const C64_CELL_W = 1;
const CELL_H = 1;

/**
 * The square-pixel character: an upper half block, foreground on top.
 *
 * The same one pengo and frogger draw with, for the same reason - it is the
 * only way a character cell becomes two pixels that are each about square.
 */
const PIXEL_CHAR = '▀';

/** ANSI palette indices, by the names cell-art uses. */
const C = {
  black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7,
  gray: 8, lightred: 9, lightgreen: 10, lightyellow: 11, lightblue: 12,
  lightmagenta: 13, lightcyan: 14, lightwhite: 15,
} as const;

/** The four square pixels of a tile: top-left, top-right, bottom-left, bottom-right. */
type PixelPattern = readonly [number, number, number, number];

interface PanelDef {
  /** Sprite name; the colour index the engine uses is the array position + 1. */
  name: string;
  /** The panel's own colour, and a brighter shade of it. */
  dark: number;
  light: number;
  /** Which of the four pixels take the light shade. */
  pixels: PixelPattern;
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
 * A PANEL IS FOUR SQUARE PIXELS. Three attempts got here, and the third is
 * the one the rest of this board already used.
 *
 * The SNES shapes went first: a heart, a circle, a star are not in the
 * character set an Amiga terminal draws, and the caller saw substitution
 * glyphs where the board should be.
 *
 * CP437 blocks replaced them and were worse in a way that only shows on a
 * screen: a half block paints the FOREGROUND over the ground, so half of
 * every tile kept the ground colour, and with a dark ink that is black. The
 * board looked eaten into.
 *
 * The answer was already in the door. Every arcade game here - pengo,
 * frogger - draws in SQUARE PIXELS: one character is an upper half block
 * whose FOREGROUND is the top pixel and whose BACKGROUND is the bottom one,
 * so a character cell, which is about twice as tall as it is wide, becomes
 * two pixels that are each about square. A panel is two characters, so it is
 * a 2x2 pixel tile.
 *
 * Each panel is drawn in two shades of its own colour, and the PATTERN of
 * those four pixels is what tells two panels apart when the colours cannot -
 * which matters, because colour alone is no help at all to a colour-blind
 * player. Nothing in a tile is black.
 */
const PANELS: PanelDef[] = [
  // pixels are [topLeft, topRight, bottomLeft, bottomRight]; true is the light
  // shade. Eight patterns, all distinct, none of them flat in both rows.
  { name: 'heart',    dark: C.red,       light: C.lightred,     pixels: [1, 1, 0, 0],
    c64Left: '█', c64Right: '█', c64Fg: C.lightred },
  { name: 'circle',   dark: C.green,     light: C.lightgreen,   pixels: [0, 0, 1, 1],
    c64Left: '▒', c64Right: '▒', c64Fg: C.lightgreen },
  { name: 'triangle', dark: C.cyan,      light: C.lightcyan,    pixels: [1, 0, 0, 1],
    c64Left: '▄', c64Right: '▄', c64Fg: C.lightcyan },
  { name: 'star',     dark: C.yellow,    light: C.lightyellow,  pixels: [0, 1, 1, 0],
    c64Left: '▀', c64Right: '▀', c64Fg: C.lightyellow },
  { name: 'diamond',  dark: C.magenta,   light: C.lightmagenta, pixels: [1, 0, 1, 0],
    c64Left: '▚', c64Right: '▚', c64Fg: C.lightmagenta },
  { name: 'inverse',  dark: C.blue,      light: C.lightblue,    pixels: [0, 1, 0, 1],
    c64Left: '▞', c64Right: '▞', c64Fg: C.lightblue },
  { name: 'square',   dark: C.white,     light: C.lightwhite,   pixels: [1, 1, 1, 0],
    c64Left: '▌', c64Right: '▐', c64Fg: C.lightwhite },
  { name: 'shock',    dark: C.gray,      light: C.lightwhite,   pixels: [0, 1, 1, 1],
    c64Left: '!', c64Right: '!', c64Fg: C.white },
];

/** One 2x1 frame from its two cells. */
/**
 * One frame: a row of cells, however many characters this variant's panel is.
 *
 * A panel has to look SQUARE, and how many characters that takes depends on
 * the shape of a character. An xterm cell is about half as wide as it is tall,
 * so two make a square; a PETSCII cell is square already, so two make a 2:1
 * smear - which is what a C64 caller saw.
 */
type PanelRow = ReadonlyArray<RawCell | null>;

function frame(cells: PanelRow): RawFrame {
  return [[...cells]];
}

function still(cells: PanelRow): RawAnimation {
  return { ticksPerFrame: 1, loop: false, frames: [frame(cells)] };
}

/** The same row with every cell blank - what popping ends on. */
function blankLike(cells: PanelRow): PanelRow {
  return cells.map(() => null);
}

/**
 * Build one panel's animations.
 *
 * The animation NAMES are the engine's panel states, so the renderer can ask
 * for `panel.state` directly, plus `danger` which is a display concern. They
 * match the names panel-attack's own sprite-sheet manifests use.
 */
function animationsFor(
  body: PanelRow,
  flash: PanelRow,
  face: PanelRow,
  dim: PanelRow,
): Record<string, RawAnimation> {
  return {
    // Sitting there.
    normal: still(body),
    // Mid-swap and falling look like a normal panel; the renderer moves them.
    swapping: still(body),
    falling: still(body),
    hovering: still(body),
    // Matched: flashing, then holding the face until the pop timers start.
    flash: { ticksPerFrame: 2, loop: true, frames: [frame(body), frame(flash)] },
    face: still(face),
    // Popping brightens out. The engine decides WHEN; this is only the look.
    popping: {
      ticksPerFrame: 1,
      loop: false,
      frames: [frame(face), frame(flash), frame(blankLike(body))],
    },
    // The row below the floor, waiting to come into play.
    dimmed: still(dim),
    // A short squash as it settles.
    landing: { ticksPerFrame: 1, loop: false, frames: [frame(flash), frame(body)] },
    // Near the top: pulses so the danger is visible without colour alone.
    danger: { ticksPerFrame: 2, loop: true, frames: [frame(body), frame(face)] },
  };
}

/** The 80-column variant: a shape on a coloured ground. */
function wideSprite(def: PanelDef): RawSprite {
  // An upper half block whose FOREGROUND is the top pixel and whose BACKGROUND
  // is the bottom one. One character, two square pixels; a panel is two
  // characters, so it is a 2x2 tile.
  const [topLeft, topRight, bottomLeft, bottomRight] = def.pixels;
  const shade = (lit: number) => (lit ? def.light : def.dark);

  const pixelCell = (top: number, bottom: number): RawCell =>
    [PIXEL_CHAR, shade(top), shade(bottom)];

  const body = pixelCell(topLeft, bottomLeft);
  const filler = pixelCell(topRight, bottomRight);
  // Flash: the whole tile goes white, which every colour contrasts with.
  const flash: RawCell = [PIXEL_CHAR, C.lightwhite, C.lightwhite];
  const flashFill: RawCell = [PIXEL_CHAR, C.lightwhite, C.lightwhite];
  // The matched face, before the pop: the pattern goes, the colour stays.
  const face: RawCell = [PIXEL_CHAR, def.light, def.light];
  const faceFill: RawCell = [PIXEL_CHAR, def.light, def.light];
  // Dimmed is the row below the floor, which is not in play.
  const dim: RawCell = [PIXEL_CHAR, C.gray, C.gray];
  const dimFill: RawCell = [PIXEL_CHAR, C.gray, C.gray];

  return {
    name: `panel-${def.name}`,
    cellW: CELL_W,
    cellH: CELL_H,
    animations: animationsFor(
      [body, filler], [flash, flashFill], [face, faceFill], [dim, dimFill],
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
  // ONE character, because a PETSCII cell is already square (a real C64
  // stretches it slightly taller than wide, which is nearer square than a
  // doubled one). Two characters made every panel a 2:1 smear on the C64
  // while looking right on a terminal, where a cell is half as wide as tall:
  // "its just the tetris games that have stretched blocks" (2026-09-06).
  //
  // The two-glyph pairs the sheet used to carry (c64Left/c64Right) collapse to
  // the left one; each is a whole-cell pattern in its own right, so a panel
  // keeps its shape and only loses the repeat.
  const body: RawCell = [def.c64Left, def.c64Fg, C.black];
  // Flashing swaps to white, which every VIC-II colour contrasts with.
  const flash: RawCell = [def.c64Left, C.lightwhite, C.black];
  // The face is a lighter shade of the same shape, so it reads as the same panel.
  const face: RawCell = ['\u2592', def.c64Fg, C.black];
  const dim: RawCell = [def.c64Left, C.gray, C.black];

  return {
    name: `panel-${def.name}-c64`,
    cellW: C64_CELL_W,
    cellH: CELL_H,
    animations: animationsFor([body], [flash], [face], [dim]),
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
