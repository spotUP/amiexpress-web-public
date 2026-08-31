/**
 * Donkey Kong's board, and the bug the old renderer caused.
 *
 * Colour was worked out AFTER drawing, by matching the glyph in the buffer.
 * Two different things are drawn with the same character - playerClimb is
 * 'H' and so is ladder - and the matcher tested the ladder first, so a
 * climbing Mario was painted in the ladder's colour and disappeared into it
 * for the whole climb. Which is most of the game.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Cell, EMPTY, COLORS, cell, paint } from '../game/sprites';
import { SPRITES } from '../game/constants';

function visible(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

/**
 * The collision that caused the bug still exists in the glyph table, so the
 * fix has to be that colour no longer comes from the glyph.
 */
export async function marioAndTheLadderStillShareAGlyph(): Promise<void> {
  assert.strictEqual(
    SPRITES.playerClimb, SPRITES.ladder,
    'this test exists because they collide; if they no longer do, it is stale'
  );
}

/** A climbing Mario is NOT drawn in the ladder colour. */
export async function aClimbingMarioIsNotTheColourOfTheLadder(): Promise<void> {
  const climbing = cell(SPRITES.playerClimb, COLORS.player);
  const ladder = cell(SPRITES.ladder, COLORS.ladder);

  assert.strictEqual(climbing.ch, ladder.ch, 'same glyph - that is the whole problem');
  assert.notStrictEqual(
    climbing.fg, ladder.fg,
    'Mario must not be painted the ladder colour, or he vanishes while climbing'
  );
}

/** Every drawn thing has a colour of its own. */
export async function everythingHasItsOwnColour(): Promise<void> {
  const needed = [
    'girder', 'ladder', 'ladderBroken', 'player', 'playerHammer',
    'barrel', 'blueBarrel', 'fireball', 'dk', 'pauline', 'rivet', 'hammer',
  ];
  for (const name of needed) {
    assert.ok((COLORS as any)[name], `${name} has no colour`);
  }
}

/** A blue barrel is not the same as an ordinary one. */
export async function theTwoBarrelsAreDistinguishable(): Promise<void> {
  assert.notStrictEqual(SPRITES.barrel, SPRITES.blueBarrel, 'different glyphs');
  assert.notStrictEqual(COLORS.barrel, COLORS.blueBarrel, 'and different colours');
}

/** A broken ladder reads differently from a whole one. */
export async function aBrokenLadderLooksBroken(): Promise<void> {
  assert.notStrictEqual(SPRITES.ladder, SPRITES.ladderBroken);
  assert.notStrictEqual(COLORS.ladder, COLORS.ladderBroken);
}

/** Cells are one column, and painting keeps them that way. */
export async function paintingKeepsCellsOneColumn(): Promise<void> {
  const cells: Cell[] = [
    EMPTY,
    cell(SPRITES.girder, COLORS.girder),
    cell(SPRITES.player, COLORS.player),
    cell(SPRITES.barrel, COLORS.barrel),
  ];
  for (const c of cells) {
    assert.strictEqual(c.ch.length, 1);
    assert.strictEqual(visible(paint(c)).length, 1);
  }
}

/** Blank space costs nothing on the wire. */
export async function blankSpaceIsNotTagged(): Promise<void> {
  assert.strictEqual(paint(EMPTY), ' ');
}

/** No glyph may be a blessed tag delimiter. */
export async function noGlyphIsABrace(): Promise<void> {
  for (const [name, glyph] of Object.entries(SPRITES)) {
    assert.ok(
      !String(glyph).includes('{') && !String(glyph).includes('}'),
      `${name} is drawn as ${JSON.stringify(glyph)} - a brace is blessed markup`
    );
  }
}

/** The renderer no longer recovers colour by comparing glyphs. */
export async function theRendererPaintsCellsNotGlyphMatches(): Promise<void> {
  const game = readFileSync(join(__dirname, '..', 'game', 'donkey-kong-game.ts'), 'utf8');

  assert.ok(/output \+= paint\(buffer\[y\]\[x\]\)/.test(game), 'it should paint the cell it stored');
  assert.ok(
    !/char === SPRITES\./.test(game),
    'colour must not be recovered by comparing the glyph after the fact'
  );
}
