/**
 * The shipped sprite sheet is complete and valid.
 *
 * The renderer (game/render.ts) asks for these sprites and animations BY
 * NAME; a missing one throws mid-game. This test walks the exact set the
 * renderer uses, so a renamed animation fails here, not in front of a
 * player.
 */

import assert from 'assert';
import { join } from 'path';
import { loadSpriteSheet } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

const REQUIRED: Record<string, string[]> = {
  'pengo': ['walk-up', 'walk-down', 'walk-left', 'walk-right', 'push', 'death'],
  'sno-bee': ['crawl', 'stunned', 'hatching'],
  'ice': ['idle', 'sliding'],
  'diamond': ['sparkle'],
  'wall': ['idle', 'shake'],
  'egg': ['idle'],
};

export async function everySpriteAndAnimationTheRendererNamesExists(): Promise<void> {
  const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));

  for (const [name, animations] of Object.entries(REQUIRED)) {
    assert.ok(sheet[name], `sprite '${name}' is missing from sprites/`);
    for (const anim of animations) {
      assert.ok(
        sheet[name].animations[anim],
        `sprite '${name}' is missing animation '${anim}'`
      );
    }
  }
}

export async function everySpriteIsOneBoardCell(): Promise<void> {
  const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));
  for (const sprite of Object.values(sheet)) {
    assert.strictEqual(sprite.cellW, 5, `${sprite.name} is not 5 wide`);
    assert.strictEqual(sprite.cellH, 2, `${sprite.name} is not 2 tall`);
  }
}

export async function deathHoldsItsLastFrame(): Promise<void> {
  const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));
  assert.strictEqual(sheet['pengo'].animations['death'].loop, false,
    'a looping death animation resurrects the penguin visually');
}
