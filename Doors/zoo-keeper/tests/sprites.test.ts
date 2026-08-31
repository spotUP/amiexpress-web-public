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
  Cell, EMPTY, COLORS, ANIMAL_COLORS, paint,
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
  assert.notStrictEqual(
    empty.fg, netted.fg,
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

  assert.notStrictEqual(lion.fg, camel.fg);
  assert.ok(ANIMAL_STATS.lion.capturePoints > ANIMAL_STATS.camel.capturePoints);
}

/** A wall about to break is visibly different from a sound one. */
export async function aBreakingWallLooksDifferent(): Promise<void> {
  assert.notStrictEqual(wallCell('#', false).fg, wallCell('#', true).fg);
}

/** The burning head of the fuse stands out from the fuse itself. */
export async function theFuseHeadStandsOut(): Promise<void> {
  const body = fuseCell(false);
  const head = fuseCell(true);

  assert.notStrictEqual(body.ch, head.ch);
  assert.notStrictEqual(body.fg, head.fg);
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
    assert.strictEqual(c.ch.length, 1, `${JSON.stringify(c.ch)} is not one column`);
    assert.strictEqual(visible(paint(c)).length, 1);
  }
}

/** Blank space is untagged. */
export async function blankSpaceIsNotTagged(): Promise<void> {
  assert.strictEqual(paint(EMPTY), ' ');
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
