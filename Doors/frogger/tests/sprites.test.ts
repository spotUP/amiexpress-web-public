/**
 * The sprite sheet: valid to the engine, and editable in SPRITED.
 *
 * Two different bars, and the second is the strict one. A sprite only has
 * to parse to be DRAWN, but the studio's pixel mode refuses any frame whose
 * cells are not pure half-blocks - so a sprite authored with arbitrary
 * characters would render fine and then be uneditable, which is the sort of
 * thing nobody notices until they try to fix a sprite and cannot.
 *
 * The colours come from Doors/frogger/reference/frogger-sprites.png, the
 * arcade rip, sampled rather than eyeballed.
 */

import assert from 'assert';
import * as fs from 'fs';
import { join } from 'path';
import {
  parseSprite, decompilePixels, Sprite,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { CELL_WIDTH, CELL_HEIGHT, OBJECT_WIDTHS } from '../game/constants';

const SPRITE_DIR = join(__dirname, '..', 'sprites');

function load(): Array<{ file: string; sprite: Sprite }> {
  return fs.readdirSync(SPRITE_DIR)
    .filter((f) => f.endsWith('.sprite.json'))
    .sort()
    .map((file) => ({
      file,
      sprite: parseSprite(JSON.parse(fs.readFileSync(join(SPRITE_DIR, file), 'utf8')), file),
    }));
}

/** Every file in sprites/ is a sprite the engine accepts. */
export async function everySpriteFileParses(): Promise<void> {
  const all = load();
  assert.ok(all.length > 0, 'there are sprites to load');
  for (const { file, sprite } of all) {
    assert.ok(sprite.name, `${file} has a name`);
    assert.ok(Object.keys(sprite.animations).length > 0, `${file} has an animation`);
  }
}

/**
 * Every sprite is a whole number of grid cells wide and exactly one tall.
 *
 * A sprite half a cell wide would sit between columns and no amount of
 * careful drawing would make it land right.
 */
export async function everySpriteIsAWholeNumberOfCells(): Promise<void> {
  for (const { file, sprite } of load()) {
    assert.strictEqual(sprite.cellW % CELL_WIDTH, 0,
      `${file} is ${sprite.cellW} chars wide, not a multiple of ${CELL_WIDTH}`);
  }
}

/**
 * A sprite is as tall as the lane it lives in.
 *
 * The moving lanes are two rows and the standing ground - the start bank,
 * the median, the home row - is one. A two-row sprite in a one-row lane
 * does not get clipped, it BLEEDS: the home row's frames were drawing their
 * bottom halves into the top water lane, which looked like debris floating
 * in the river. Caught by rendering a board and reading it, which is the
 * only way this kind of fault shows itself.
 */
export async function sceneryIsOneRowTallAndEverythingElseIsTwo(): Promise<void> {
  const oneRow = new Set(['home', 'bank', 'frog-sit']);
  for (const { file, sprite } of load()) {
    const expected = oneRow.has(sprite.name) ? 1 : CELL_HEIGHT;
    assert.strictEqual(sprite.cellH, expected,
      `${file} is ${sprite.cellH} rows tall; it lives in a ${expected}-row lane`);
  }
}

/**
 * Every frame opens in SPRITED's pixel mode.
 *
 * `decompilePixels` returning null is exactly the check the studio's editor
 * makes before it will let you paint pixels, so this is the same gate the
 * user meets, not an approximation of it.
 */
export async function everyFrameIsEditableInTheStudio(): Promise<void> {
  for (const { file, sprite } of load()) {
    for (const [anim, animation] of Object.entries(sprite.animations)) {
      animation.frames.forEach((frame, i) => {
        assert.ok(decompilePixels(frame) !== null,
          `${file} ${anim} frame ${i} is not pure half-blocks, so SPRITED cannot edit it`);
      });
    }
  }
}

/** The sprites the game needs, with the animations it asks them for. */
export async function theGameplaySpritesExist(): Promise<void> {
  const byName = new Map(load().map(({ sprite }) => [sprite.name, sprite]));

  const frog = byName.get('frog');
  assert.ok(frog, 'there is a frog');
  for (const anim of ['idle', 'hop-up', 'hop-down', 'hop-left', 'hop-right',
                      'death-splat', 'death-drown', 'home']) {
    assert.ok(frog!.animations[anim], `the frog can ${anim}`);
  }

  const turtle = byName.get('turtle');
  assert.ok(turtle, 'there are turtles');
  for (const anim of ['up', 'sinking', 'under']) {
    assert.ok(turtle!.animations[anim], `a turtle can be ${anim}`);
  }

  for (const name of ['car', 'truck', 'log-short', 'log-medium', 'log-long',
                      'crocodile', 'snake', 'home', 'bank']) {
    assert.ok(byName.get(name), `there is a ${name} sprite`);
  }
}

/**
 * A sprite is as wide as the object the rules move.
 *
 * The widths in OBJECT_WIDTHS are what collision and lane packing use; a
 * sprite drawn wider than its object would let the frog stand on painted
 * water, which is the worst class of bug this door can have.
 */
export async function spriteWidthsMatchTheObjectsTheyDraw(): Promise<void> {
  const byName = new Map(load().map(({ sprite }) => [sprite.name, sprite]));
  const expect: Array<[string, number]> = [
    ['truck', OBJECT_WIDTHS.truck],
    ['log-short', OBJECT_WIDTHS.shortLog],
    ['log-medium', OBJECT_WIDTHS.mediumLog],
    ['log-long', OBJECT_WIDTHS.longLog],
    ['turtle', OBJECT_WIDTHS.turtle],
    ['crocodile', OBJECT_WIDTHS.crocodile],
    ['car', OBJECT_WIDTHS.car],
    ['snake', OBJECT_WIDTHS.snake],
  ];
  for (const [name, cells] of expect) {
    const sprite = byName.get(name);
    assert.ok(sprite, `there is a ${name} sprite`);
    assert.strictEqual(sprite!.cellW, cells * CELL_WIDTH,
      `${name} is ${sprite!.cellW} chars for an object ${cells} cells wide`);
  }
}
