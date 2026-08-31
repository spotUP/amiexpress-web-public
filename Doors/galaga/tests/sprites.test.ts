/**
 * Galaga's board, and the bug the old renderer caused.
 *
 * Colour was decided AFTER drawing, by matching the glyph in the buffer, and
 * three different things are drawn with '.': a background star, an ENEMY
 * BULLET, and the last frame of an explosion. Every '.' was painted gray, so
 * incoming enemy fire looked exactly like a background star - the one thing
 * on screen that can kill you, disguised as scenery.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  Cell, EMPTY, COLORS, paint, starCell, bulletCell, alienCell, playerCell, explosionCell,
} from '../game/sprites';

function visible(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

/**
 * The regression that matters: an enemy bullet must not look like a star.
 *
 * They still share the glyph - the fix is that colour no longer comes from
 * the glyph.
 */
export async function anEnemyBulletDoesNotLookLikeAStar(): Promise<void> {
  const bullet = bulletCell(true);
  const dimStar = starCell(0);

  assert.strictEqual(bullet.ch, dimStar.ch, 'they share a glyph - that is the problem');
  assert.notStrictEqual(
    bullet.bg, dimStar.fg,
    'the thing that kills you must not be painted like scenery'
  );
  assert.strictEqual(bullet.bg, COLORS.enemyBullet);
}

/** An explosion's last frame is also a dot, and also must not be a star. */
export async function anExplosionIsNotAStarEither(): Promise<void> {
  const ember = explosionCell('.');
  assert.strictEqual(ember.ch, starCell(0).ch);
  assert.notStrictEqual(ember.bg, starCell(0).fg);
}

/** The player's shot and the enemy's are told apart at a glance. */
export async function theTwoBulletsAreDistinguishable(): Promise<void> {
  const mine = bulletCell(false);
  const theirs = bulletCell(true);

  assert.notStrictEqual(mine.ch, theirs.ch);
  assert.notStrictEqual(mine.bg, theirs.bg);
}

/** Each kind of alien has its own colour. */
export async function eachAlienKindHasItsOwnColour(): Promise<void> {
  const bee = alienCell('w', 'bee', false);
  const butterfly = alienCell('M', 'butterfly', false);
  const boss = alienCell('@', 'boss', false);

  const colours = new Set([bee.bg, butterfly.bg, boss.bg]);
  assert.strictEqual(colours.size, 3, 'three kinds of alien, three colours');
}

/** A boss holding your captured fighter is marked out. */
export async function aBossWithACapturedFighterIsMarked(): Promise<void> {
  const plain = alienCell('@', 'boss', false);
  const holding = alienCell('@', 'boss', true);

  assert.notStrictEqual(
    plain.bg, holding.bg,
    'the boss worth shooting for your fighter back must be visibly different'
  );
  assert.strictEqual(holding.bg, COLORS.captured);
}

/** Bright stars read as bright. */
export async function starsHaveDepth(): Promise<void> {
  assert.notStrictEqual(starCell(0).fg, starCell(2).fg, 'a starfield needs depth');
  assert.notStrictEqual(starCell(0).ch, starCell(2).ch);
}

/** Cells stay one column when painted. */
export async function paintingKeepsCellsOneColumn(): Promise<void> {
  const cells: Cell[] = [
    EMPTY, starCell(0), starCell(2), bulletCell(true), bulletCell(false),
    alienCell('w', 'bee', false), playerCell('A'), explosionCell('*'),
  ];
  for (const c of cells) {
    assert.strictEqual(c.ch.length, 1, `${JSON.stringify(c.ch)} is not one column`);
    assert.strictEqual(visible(paint(c)).length, 1);
  }
}

/** Empty sky is untagged. */
export async function emptySkyIsNotTagged(): Promise<void> {
  assert.strictEqual(paint(EMPTY), ' ');
}

/** The renderer paints cells rather than matching glyphs. */
export async function theRendererPaintsCellsNotGlyphMatches(): Promise<void> {
  const game = readFileSync(join(__dirname, '..', 'game', 'galaga-game.ts'), 'utf8');

  assert.ok(/line \+= paint\(buffer\[y\]\[x\]\)/.test(game));
  assert.ok(
    !/char === '\.'/.test(game),
    'colour must not be recovered by comparing the glyph after the fact'
  );
}

/**
 * The things that matter are blocks of colour; the starfield is not.
 *
 * Reported: "i see no bg ansi colors". Every sprite was a bright character on
 * the terminal's own background. The stars stay plain on purpose - they are
 * scenery, and blocking them would bury the game under a wall of colour.
 */
export async function theGameIsBlocksAndTheSkyIsNot(): Promise<void> {
  for (const c of [playerCell('A'), alienCell('w', 'bee', false), bulletCell(true), explosionCell('*')]) {
    assert.ok(c.bg, `${JSON.stringify(c.ch)} should be a block of colour`);
    assert.ok(/-bg\}/.test(paint(c)), 'the painted cell must carry a background');
  }

  for (const star of [starCell(0), starCell(1), starCell(2)]) {
    assert.ok(!star.bg, 'the starfield must stay scenery, not a block');
  }
}
