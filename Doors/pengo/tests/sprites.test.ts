/**
 * Pengo is drawn with sprites, not letters.
 *
 * It used to draw one ASCII letter per cell - 'P' for the penguin, 'S' for a
 * Sno-Bee, '#' for ice - and pad the row by pushing a space between every
 * character. A letter reads as a letter, and the padding put a space through
 * the middle of anything wider than one column.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CELL_WIDTH, terrainSprite, pengoSprite, enemySprite, eggSprite, paint,
  BG_COLORS, SPRITE_FG, COLOR_COMPLEMENT,
} from '../game/sprites';

/** What the terminal actually paints, with the colour tags removed. */
function visible(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

/** Every sprite covers exactly one cell - no more, no less. */
export async function everySpriteIsExactlyOneCellWide(): Promise<void> {
  const sprites = [
    ['floor', terrainSprite('empty')],
    ['ice', terrainSprite('ice')],
    ['wall', terrainSprite('wall')],
    ['diamond', terrainSprite('diamond')],
    ['pengo', pengoSprite()],
    ['enemy', enemySprite(false)],
    ['stunned enemy', enemySprite(true)],
    ['egg', eggSprite()],
  ] as const;

  for (const [name, sprite] of sprites) {
    assert.strictEqual(
      sprite.text.length, CELL_WIDTH,
      `the ${name} sprite is ${sprite.text.length} columns, not ${CELL_WIDTH}`
    );
    assert.strictEqual(
      visible(paint(sprite)).length, CELL_WIDTH,
      `the painted ${name} sprite must still be ${CELL_WIDTH} columns`
    );
  }
}

/** Nothing is drawn as a bare letter any more. */
export async function nothingIsDrawnAsALetter(): Promise<void> {
  const drawn = [
    terrainSprite('ice'), terrainSprite('wall'), terrainSprite('diamond'),
    pengoSprite(), enemySprite(false), eggSprite(),
  ];

  for (const sprite of drawn) {
    assert.ok(
      !/[A-Za-z]/.test(sprite.text),
      `sprites should be shapes, not letters - got ${JSON.stringify(sprite.text)}`
    );
  }
}

/** No two things on the board look the same. */
export async function everythingLooksDifferentFromEverythingElse(): Promise<void> {
  const byName: Array<[string, string]> = [
    ['ice', terrainSprite('ice').text],
    ['wall', terrainSprite('wall').text],
    ['diamond', terrainSprite('diamond').text],
    ['pengo', pengoSprite().text],
    ['enemy', enemySprite(false).text],
    ['egg', eggSprite().text],
  ];

  for (let i = 0; i < byName.length; i++) {
    for (let j = i + 1; j < byName.length; j++) {
      assert.notStrictEqual(
        byName[i][1], byName[j][1],
        `${byName[i][0]} and ${byName[j][0]} are both drawn as ${JSON.stringify(byName[i][1])}`
      );
    }
  }
}

/** Ice, wall and diamond are told apart by colour as well as shape. */
export async function theMazePiecesAreDistinguishable(): Promise<void> {
  const ice = terrainSprite('ice');
  const wall = terrainSprite('wall');
  const floor = terrainSprite('empty');

  assert.notStrictEqual(ice.bg, wall.bg, 'ice and wall must not share a background');
  assert.notStrictEqual(ice.bg, floor.bg, 'a pushable block must stand out from open floor');
  assert.notStrictEqual(ice.text, wall.text, 'and they should not share a glyph either');
}

/** A stunned Sno-Bee is visibly different from a live one. */
export async function aStunnedEnemyLooksDifferent(): Promise<void> {
  assert.notStrictEqual(
    enemySprite(true).fg, enemySprite(false).fg,
    'a stunned Sno-Bee is the moment to act on; it must be obvious'
  );
}

/**
 * Pengo takes the colour of whatever it stands on into account.
 *
 * It can only stand on floor today, but the rule is the one Frogger's frog
 * uses, so a level that later lets it stand on ice cannot make it vanish.
 */
export async function pengoIsDrawnAgainstItsGround(): Promise<void> {
  const onFloor = pengoSprite(BG_COLORS.floor);
  const onIce = pengoSprite(BG_COLORS.ice);

  assert.strictEqual(onFloor.bg, BG_COLORS.floor);
  assert.strictEqual(onIce.bg, BG_COLORS.ice, 'the sprite sits on the ground it is on');
  assert.notStrictEqual(
    onIce.fg, onIce.bg,
    'the penguin must never be the same colour as what it is standing on'
  );
}

/** The complement table covers every colour the board can paint. */
export async function everyBoardColourHasAComplement(): Promise<void> {
  const used = new Set<string>([...Object.values(BG_COLORS), ...Object.values(SPRITE_FG)]);
  for (const colour of used) {
    assert.ok(
      COLOR_COMPLEMENT[colour],
      `${colour} is painted on the board but has no complement`
    );
  }
}

/**
 * The renderer no longer pads rows by hand.
 *
 * `line.split('').join(' ')` inserted a space between every character to
 * fake a wider board - which also inserted one into the middle of every
 * two-character sprite.
 */
export async function theRendererDoesNotPadRowsByHand(): Promise<void> {
  const game = readFileSync(join(__dirname, '..', 'game', 'pengo-game.ts'), 'utf8');

  assert.ok(
    !/split\('''\)\.join\(' '\)/.test(game) && !/split\(''\)\.join\(' '\)/.test(game),
    'the space-padding hack should be gone; cells are already CELL_WIDTH wide'
  );
  assert.ok(/paint\(/.test(game), 'the renderer should paint sprites');
  assert.ok(
    !/line \+= '\{cyan-fg\}P\{\/\}'/.test(game),
    "the penguin should not be drawn as the letter P"
  );
}
