/**
 * Joust's board, and the two things that were wrong with it.
 *
 * The buzzards were drawn '{' and '}' - blessed's own tag delimiters - so
 * every enemy on screen emitted a bare brace into tagged content, where '{'
 * opens a colour tag and '}' closes one.
 *
 * And colour was decided AFTER drawing, by matching the character that had
 * been written into the buffer: the renderer asked "is this the enemy
 * character?" and then searched the enemy list BY POSITION to recover what
 * colour it should have been. Two things drawn with the same glyph could not
 * be told apart at all.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  GLYPHS, COLORS, EMPTY, paint,
  playerCell, enemyCell, eggCell, pterodactylCell, platformCell, lavaCell,
} from '../game/sprites';

function visible(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

/**
 * No glyph may be a brace.
 *
 * This is the regression that matters: '{' and '}' are markup here, not
 * characters, and the board is emitted as tagged content.
 */
export async function noGlyphIsABlessedTagDelimiter(): Promise<void> {
  for (const [name, glyph] of Object.entries(GLYPHS)) {
    assert.ok(
      !glyph.includes('{') && !glyph.includes('}'),
      `${name} is drawn as ${JSON.stringify(glyph)} - a brace is blessed markup, not a sprite`
    );
  }
}

/** Every sprite is one column, because the buffer is one char per cell. */
export async function everySpriteIsOneColumn(): Promise<void> {
  const cells = [
    playerCell('right', false), playerCell('left', false), playerCell('right', true),
    enemyCell('right', 'red'), enemyCell('left', undefined),
    eggCell(false), eggCell(true),
    pterodactylCell(), platformCell(), lavaCell(0), lavaCell(7), EMPTY,
  ];

  for (const cell of cells) {
    assert.strictEqual(cell.ch.length, 1, `${JSON.stringify(cell.ch)} is not one column`);
    assert.strictEqual(visible(paint(cell)).length, 1, 'painted width must stay one column');
  }
}

/**
 * A buzzard is drawn in ITS OWN colour, given at draw time.
 *
 * The colour used to be recovered afterwards by searching the enemy list for
 * whatever happened to be at that position.
 */
export async function eachBuzzardCarriesItsOwnColour(): Promise<void> {
  const bounder = enemyCell('right', 'lightred');
  const hunter = enemyCell('right', 'lightyellow');

  assert.strictEqual(bounder.fg, 'lightred');
  assert.strictEqual(hunter.fg, 'lightyellow');
  assert.notStrictEqual(bounder.fg, hunter.fg, 'two kinds of buzzard must not share a colour');
}

/** An enemy with no colour still gets drawn rather than vanishing. */
export async function anUnknownBuzzardStillHasAColour(): Promise<void> {
  const cell = enemyCell('left', undefined);
  assert.ok(cell.fg, 'a buzzard of unknown type must still be visible');
  assert.strictEqual(cell.fg, COLORS.enemyFallback);
}

/** The rider faces where it is going, and flapping overrides facing. */
export async function theRiderFacesItsDirection(): Promise<void> {
  assert.strictEqual(playerCell('right', false).ch, GLYPHS.playerRight);
  assert.strictEqual(playerCell('left', false).ch, GLYPHS.playerLeft);
  assert.strictEqual(playerCell('right', true).ch, GLYPHS.playerFlap, 'flapping is its own sprite');
  assert.strictEqual(playerCell('left', true).ch, GLYPHS.playerFlap);
}

/** A hatching egg is visibly different from a settled one. */
export async function aHatchingEggLooksDifferent(): Promise<void> {
  assert.notStrictEqual(eggCell(true).ch, eggCell(false).ch);
  assert.notStrictEqual(eggCell(true).fg, eggCell(false).fg);
}

/** Lava churns, and sits on a hot background rather than bare sky. */
export async function lavaChurnsAndIsHot(): Promise<void> {
  const a = lavaCell(0);
  const b = lavaCell(7);

  assert.notStrictEqual(a.ch, b.ch, 'lava should animate');
  assert.strictEqual(a.bg, COLORS.lavaBg, 'lava sits on a hot background');
  assert.strictEqual(b.bg, COLORS.lavaBg);
}

/**
 * Empty sky is a plain space.
 *
 * A board is mostly empty, and wrapping every space in colour tags multiplies
 * the bytes going down the line by about eight for no visible difference.
 */
export async function emptySkyCostsNothing(): Promise<void> {
  assert.strictEqual(paint(EMPTY), ' ', 'blank sky should not be tagged');
}

/** The renderer paints cells rather than matching characters afterwards. */
export async function theRendererDoesNotRecoverColourFromGlyphs(): Promise<void> {
  const game = readFileSync(join(__dirname, '..', 'game', 'joust-game.ts'), 'utf8');

  assert.ok(/put\(/.test(game), 'the renderer should place cells that carry their colour');
  assert.ok(
    !/char === SPRITES\.platform/.test(game),
    'colour must not be recovered by comparing the glyph after the fact'
  );
  assert.ok(
    !/this\.data\.enemies\.find\(e =>\s*\n?\s*Math\.floor\(e\.x\) === x/.test(game),
    'an enemy should not have to be looked up by position to find its colour'
  );
}
