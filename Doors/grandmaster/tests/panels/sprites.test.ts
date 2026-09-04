/**
 * The panel sprite sheets.
 *
 * Loading them through the SDK's own loader is most of the test: parseSprite
 * validates every cell up front and rejects a malformed sheet with a message
 * naming the sprite, animation and frame, so a sheet that loads is structurally
 * sound. What is left is the things the format cannot check for us.
 *
 * The important one is the C64 rule. PETSCII has NO per-cell background and the
 * transducer never emits one, so a background in the C64 sheet is not a
 * different colour on a C64 - it is silently dropped, and the two sheets end up
 * disagreeing about what a panel looks like. That has to be a test, because
 * nothing else notices.
 */

import assert from 'assert';
import { join } from 'path';
import { loadSpriteSheet, Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

const SPRITE_DIR = join(__dirname, '..', '..', 'sprites');

/** The engine's colour order: colour N is PANEL_NAMES[N - 1]. */
const PANEL_NAMES = [
  'heart', 'circle', 'triangle', 'star', 'diamond', 'inverse', 'square', 'shock',
];

/** Every state the renderer can ask a panel to draw itself in. */
const REQUIRED_ANIMATIONS = [
  'normal', 'swapping', 'falling', 'hovering',
  'flash', 'face', 'popping', 'dimmed', 'landing', 'danger',
];

function sheet(): Record<string, Sprite> {
  return loadSpriteSheet(SPRITE_DIR);
}

export async function everyPanelColourHasBothVariants(): Promise<void> {
  const sprites = sheet();
  for (const name of PANEL_NAMES) {
    assert.ok(sprites[`panel-${name}`], `missing 80-column sprite for ${name}`);
    assert.ok(sprites[`panel-${name}-c64`], `missing C64 sprite for ${name}`);
  }
  assert.strictEqual(
    Object.keys(sprites).length, PANEL_NAMES.length * 2,
    'eight colours, two variants each, and nothing else',
  );
}

/**
 * A panel is two characters wide and one row tall, and that is forced: twelve
 * panel rows must leave room for a HUD in twenty-five terminal rows, and a
 * character cell is about twice as tall as it is wide, so 2x1 reads square.
 */
export async function everyPanelIsTwoByOne(): Promise<void> {
  for (const [name, sprite] of Object.entries(sheet())) {
    assert.strictEqual(sprite.cellW, 2, `${name} is not two columns wide`);
    assert.strictEqual(sprite.cellH, 1, `${name} is not one row tall`);
  }
}

export async function everyPanelCanDrawEveryStateTheEngineHas(): Promise<void> {
  for (const [name, sprite] of Object.entries(sheet())) {
    for (const animation of REQUIRED_ANIMATIONS) {
      assert.ok(
        sprite.animations[animation],
        `${name} cannot draw itself in state '${animation}'`,
      );
      assert.ok(
        sprite.animations[animation].frames.length > 0,
        `${name}.${animation} has no frames`,
      );
    }
  }
}

/**
 * THE C64 RULE. Nothing else catches a background here: it is not an error, it
 * is simply dropped on the way to the glass, and the panel silently becomes a
 * different thing than the 80-column sheet says it is.
 */
export async function theC64SheetNeverSetsABackground(): Promise<void> {
  for (const [name, sprite] of Object.entries(sheet())) {
    if (!name.endsWith('-c64')) continue;
    for (const [animation, anim] of Object.entries(sprite.animations)) {
      anim.frames.forEach((frame, frameIndex) => {
        for (const row of frame) {
          for (const cell of row) {
            if (!cell) continue;
            assert.strictEqual(
              cell.bg, 0,
              `${name}.${animation} frame ${frameIndex} sets background ${cell.bg}; `
              + 'PETSCII has no per-cell background and it would be dropped',
            );
          }
        }
      });
    }
  }
}

/**
 * On a C64 the panels have to be told apart by SHAPE as well as colour - the
 * screen is 16 fixed colours, several of which read alike, and colour-blind
 * players have only the shape. So no two C64 panels may use the same glyph pair.
 */
export async function noTwoC64PanelsShareAGlyphPair(): Promise<void> {
  const sprites = sheet();
  const seen = new Map<string, string>();

  for (const name of PANEL_NAMES) {
    const sprite = sprites[`panel-${name}-c64`];
    const [row] = sprite.animations.normal.frames[0];
    const glyphs = row.map((cell) => (cell ? cell.char : ' ')).join('');
    const previous = seen.get(glyphs);
    assert.ok(
      previous === undefined,
      `panel-${name}-c64 draws '${glyphs}', which panel-${previous}-c64 already uses`,
    );
    seen.set(glyphs, name);
  }
}

/**
 * The 80-column sheet is allowed backgrounds, and uses them - that is the whole
 * reason there are two sheets rather than one.
 */
export async function theWideSheetDoesUseBackgrounds(): Promise<void> {
  const sprites = sheet();
  const [row] = sprites['panel-heart'].animations.normal.frames[0];
  const coloured = row.some((cell) => cell && cell.bg !== 0);
  assert.ok(coloured, 'the 80-column sheet should paint a coloured ground');
}
