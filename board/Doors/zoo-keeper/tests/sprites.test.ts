/**
 * Zoo Keeper's board, and the bug its own source admitted to.
 *
 *   zeke: '@',
 *   zekeWithNet: '@',  // Same char, different color
 *
 * Two states drawn with one character, told apart only by a colour the
 * renderer had to reconstruct FROM that character. It could not, so carrying
 * the net - the thing that decides whether you can catch an animal or must
 * run from it - was invisible. The zoo stage even had
 * `d.zeke.hasNet ? '@' : '@'`: a ternary returning the same value either way.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  Cell, EMPTY, COLORS, ANIMAL_COLORS, BONUS_COLORS, TERMINAL_COLORS, CELL_WIDTH, paint,
  zekeCell, animalCell, wallCell, fuseCell, zeldaCell, monkeyCell, coconutCell, bonusCell,
} from '../game/sprites';
import { ANIMAL_STATS } from '../game/constants';
import { AnimalType } from '../game/types';

function visible(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

const ANIMALS = Object.keys(ANIMAL_STATS) as AnimalType[];

/** The regression: carrying the net has to be visible. */
export async function carryingTheNetIsVisible(): Promise<void> {
  const empty = zekeCell(false);
  const netted = zekeCell(true);

  assert.strictEqual(empty.ch, netted.ch, 'same man, same glyph - that is the point');
  // The block colour is what identifies a thing now; the glyph sits on it.
  assert.notStrictEqual(
    empty.bg, netted.bg,
    'whether Zeke can catch anything must be visible at a glance'
  );
}

/**
 * Every animal is a different colour.
 *
 * ANIMAL_STATS gives three of the six the same yellow and two the same gray,
 * so the lion - worth 30,000 and the fastest thing in the zoo - was drawn
 * exactly like a camel worth 1,000.
 */
export async function everyAnimalHasItsOwnColour(): Promise<void> {
  const colours = ANIMALS.map(a => ANIMAL_COLORS[a]);

  assert.strictEqual(
    new Set(colours).size, ANIMALS.length,
    `six animals need six colours, got ${colours.join(', ')}`
  );
}

/** The most valuable animal is not drawn like a cheap one. */
export async function theLionDoesNotLookLikeACamel(): Promise<void> {
  const lion = animalCell(ANIMAL_STATS.lion.char, 'lion');
  const camel = animalCell(ANIMAL_STATS.camel.char, 'camel');

  assert.notStrictEqual(lion.bg, camel.bg);
  assert.ok(ANIMAL_STATS.lion.capturePoints > ANIMAL_STATS.camel.capturePoints);
}

/** A wall about to break is visibly different from a sound one. */
export async function aBreakingWallLooksDifferent(): Promise<void> {
  assert.notStrictEqual(wallCell('#', false).bg, wallCell('#', true).bg);
}

/** The burning head of the fuse stands out from the fuse itself. */
export async function theFuseHeadStandsOut(): Promise<void> {
  const body = fuseCell(false);
  const head = fuseCell(true);

  assert.notStrictEqual(body.ch, head.ch);
  assert.notStrictEqual(body.bg, head.bg);
}

/** Zelda, the monkey and a coconut are all told apart. */
export async function theOtherCharactersAreDistinguishable(): Promise<void> {
  const cells = [zeldaCell(), monkeyCell(), coconutCell()];
  const glyphs = cells.map(c => c.ch);
  assert.strictEqual(new Set(glyphs).size, cells.length, 'each needs its own glyph');
}

/** Cells stay one column when painted. */
export async function paintingKeepsCellsOneColumn(): Promise<void> {
  const cells: Cell[] = [
    EMPTY, zekeCell(true), zekeCell(false), wallCell('|'), fuseCell(true),
    zeldaCell(), monkeyCell(), coconutCell(), bonusCell('E'),
    ...ANIMALS.map(a => animalCell(ANIMAL_STATS[a].char, a)),
  ];
  for (const c of cells) {
    assert.strictEqual(c.ch.length, 1, `${JSON.stringify(c.ch)} should be a single glyph`);
    assert.strictEqual(
      visible(paint(c)).length, CELL_WIDTH,
      'a painted cell must be exactly CELL_WIDTH columns, or the row overflows'
    );
  }
}

/** Blank space is untagged. */
export async function blankSpaceIsNotTagged(): Promise<void> {
  // Still untagged - the board is mostly empty and tagging every space
  // multiplies the bytes on the wire - but it is now a whole CELL of space.
  assert.strictEqual(paint(EMPTY), ' '.repeat(CELL_WIDTH));
}

/**
 * No stage recovers colour from a glyph any more.
 *
 * The old renderers guessed with regexes - /[ESCRML]/ and
 * /[EXTRALIFE!x0-9]/ - and searched ANIMAL_STATS for whichever animal
 * happened to use that character.
 */
export async function noStageRecoversColourFromGlyphs(): Promise<void> {
  for (const stage of ['stampede-stage.ts', 'platform-stage.ts', 'zoo-stage.ts']) {
    const src = readFileSync(join(__dirname, '..', 'game', stage), 'utf8');

    assert.ok(
      /line \+= paint\(buffer\[y\]\[x\]\)/.test(src),
      `${stage} should paint the cell it stored`
    );
    assert.ok(
      !/char === CHARS\./.test(src),
      `${stage} must not recover colour by comparing glyphs`
    );
    assert.ok(
      !/\[ESCRML\]/.test(src) && !/EXTRALIFE!x0-9/.test(src),
      `${stage} must not guess what a character means with a regex`
    );
  }
}

/** And the self-cancelling ternary is gone. */
export async function theSameCharacterTernaryIsGone(): Promise<void> {
  // Comments stripped first: zoo-stage.ts explains what the line USED to be,
  // and a scan that counted the explanation would fail on the very note
  // warning against it. Same trap as scanning for process.cwd() in a file
  // whose comment says not to use process.cwd().
  const zoo = readFileSync(join(__dirname, '..', 'game', 'zoo-stage.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  assert.ok(
    !/hasNet \? '@' : '@'/.test(zoo),
    "a ternary returning '@' either way cannot show anything"
  );
}

/**
 * ...and every stage actually passes the net state through.
 *
 * carryingTheNetIsVisible proves zekeCell can tell the two apart; it does
 * NOT prove the stages ask it to. Measured: breaking the zoo stage's call to
 * pass a constant left that test green, because it never touches the call
 * site. This is the guard that fails.
 */
export async function everyStageDrawsZekeWithHisRealNetState(): Promise<void> {
  for (const stage of ['stampede-stage.ts', 'platform-stage.ts', 'zoo-stage.ts']) {
    const src = readFileSync(join(__dirname, '..', 'game', stage), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    assert.ok(
      /zekeCell\(Boolean\(d\.zeke\.hasNet\)\)/.test(src),
      `${stage} must draw Zeke from his LIVE net state, not a constant`
    );
  }
}

/**
 * Every colour named here must be one a terminal can paint.
 *
 * 'brown' sat in this file for exactly one commit: it reads perfectly well in
 * source and means nothing on the wire, so the coconut would simply have come
 * out in whatever colour was already set.
 */
export async function everyColourIsOneATerminalCanPaint(): Promise<void> {
  const named: Array<[string, string]> = [
    ...Object.entries(COLORS),
    ...Object.entries(ANIMAL_COLORS),
    ...Object.entries(BONUS_COLORS),
  ];

  for (const [name, colour] of named) {
    assert.ok(
      TERMINAL_COLORS.has(colour),
      `${name} is ${JSON.stringify(colour)}, which no terminal will paint`
    );
  }
}

/** The fruit colours are actually reachable - the kind is passed through. */
export async function theBonusFruitColoursAreActuallyUsed(): Promise<void> {
  const banana = bonusCell('B', 'banana');
  const cherry = bonusCell('C', 'cherry');
  assert.notStrictEqual(banana.bg, cherry.bg, 'different fruit, different colour');

  const zoo = readFileSync(join(__dirname, '..', 'game', 'zoo-stage.ts'), 'utf8');
  assert.ok(
    /bonusCell\(BONUS_ITEMS\[item\.type\]\.char, item\.type\)/.test(zoo),
    'the fruit type must be passed through, or the colours never apply'
  );
}

/**
 * Every cell paints to exactly CELL_WIDTH columns.
 *
 * A board row is GAME_AREA.width cells; at CELL_WIDTH each that is exactly
 * the 80-column screen. One cell painting a column too many overflows the
 * box and wraps, which is the "every second line is black" fault all over
 * again - so this is checked on every sprite the board can draw.
 */
export async function everySpritePaintsToACompleteCell(): Promise<void> {
  const every: Cell[] = [
    EMPTY, zekeCell(true), zekeCell(false),
    wallCell('|'), wallCell('#', true), fuseCell(true), fuseCell(false),
    zeldaCell(), monkeyCell(), coconutCell(), bonusCell('E'), bonusCell('B', 'banana'),
    ...ANIMALS.map(a => animalCell(ANIMAL_STATS[a].char, a)),
  ];

  for (const c of every) {
    assert.strictEqual(
      visible(paint(c)).length, CELL_WIDTH,
      `${JSON.stringify(c.ch)} painted ${visible(paint(c)).length} columns, not ${CELL_WIDTH}`
    );
  }
}

/**
 * A full row of cells fits the screen exactly.
 *
 * This is the arithmetic that makes the board square: forty logical columns
 * at two characters each is the whole 80-column screen, with nothing over.
 */
export async function aFullRowFitsTheScreenExactly(): Promise<void> {
  const { GAME_AREA, SCREEN_WIDTH } = await import('../game/constants');

  assert.strictEqual(
    GAME_AREA.width * CELL_WIDTH, SCREEN_WIDTH,
    `${GAME_AREA.width} cells x ${CELL_WIDTH} = ${GAME_AREA.width * CELL_WIDTH}, ` +
    `which is not the ${SCREEN_WIDTH}-column screen`
  );

  const row = Array.from({ length: GAME_AREA.width }, () => paint(EMPTY)).join('');
  assert.strictEqual(visible(row).length, SCREEN_WIDTH, 'a full row must be exactly one screen wide');
}

/**
 * The board is drawn as blocks of colour, not coloured letters.
 *
 * Reported: "i see no bg ansi colors". Every sprite was a bright glyph on the
 * terminal's own background, which reads as text. The CELL carries the colour
 * now and the glyph sits on it.
 */
export async function theBoardIsMadeOfColouredBlocks(): Promise<void> {
  const drawn: Cell[] = [
    zekeCell(false), wallCell('|'), fuseCell(false), zeldaCell(), monkeyCell(),
    ...ANIMALS.map(a => animalCell(ANIMAL_STATS[a].char, a)),
  ];

  for (const c of drawn) {
    assert.notStrictEqual(
      c.bg, 'black',
      `${JSON.stringify(c.ch)} is drawn on the bare terminal background - it needs a block of colour`
    );
    assert.ok(/-bg\}/.test(paint(c)), 'the painted cell must carry a background');
  }
}

/** Every stage keeps inside the board it is given. */
export async function noStageReachesPastTheBoard(): Promise<void> {
  const { GAME_AREA, ZOO_PERIMETER } = await import('../game/constants');

  for (const [name, value] of Object.entries(ZOO_PERIMETER)) {
    if (name.includes('Left') || name.includes('Right')) {
      assert.ok(
        value < GAME_AREA.width,
        `ZOO_PERIMETER.${name} is ${value}, past the ${GAME_AREA.width}-cell board`
      );
    }
  }

  // The escalator clamp and the escalator rails must agree, or Zeke is held
  // somewhere the rails are not.
  const stampede = readFileSync(join(__dirname, '..', 'game', 'stampede-stage.ts'), 'utf8');
  assert.ok(
    /Math\.max\(ESCALATOR_LEFT \+ 1/.test(stampede) && /Math\.min\(ESCALATOR_RIGHT - 1/.test(stampede),
    'the movement clamp must use the same constants the rails are drawn from'
  );
}
