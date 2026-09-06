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
 * A panel is SQUARE ON THE GLASS, which is a different number of characters on
 * each screen.
 *
 * An xterm cell is about twice as tall as it is wide, so two of them make a
 * square: the 80-column sheet is 2x1. A PETSCII cell is square already (a real
 * C64 stretches it slightly taller than wide, which is nearer square still),
 * so two of them make a 2:1 smear - which is exactly what a C64 caller saw
 * once the door started drawing panels: "its just the tetris games that have
 * stretched blocks" (2026-09-06). The C64 sheet is 1x1.
 *
 * Both are one row tall, because twelve panel rows must leave room for a HUD
 * in twenty-five terminal rows.
 */
export async function everyPanelIsSquareOnItsOwnScreen(): Promise<void> {
  for (const [name, sprite] of Object.entries(sheet())) {
    const c64 = name.endsWith('-c64');
    assert.strictEqual(
      sprite.cellW, c64 ? 1 : 2,
      c64
        ? `${name} must be ONE column - two is a 2:1 smear on a square PETSCII cell`
        : `${name} must be two columns - one is half a tile on a terminal cell`,
    );
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

/**
 * Every glyph the board paints exists on an AMIGA.
 *
 * The first sheet drew the SNES shapes - a heart, a circle, a star, a diamond -
 * and they are simply not in the character set an Amiga terminal has. A caller
 * playing on 2026-09-03 saw substitution glyphs where the board should be.
 *
 * The safe set is CP437's block elements and shades, which is what every other
 * arcade door here draws with (pengo and frogger use nothing but the full
 * block and the two half blocks) and what Amiga ANSI art has always been made
 * of. Latin-1 punctuation is fine too; anything above that is not.
 */
/** CP437's block elements, which the C64 sheet is drawn with. */
const SAFE_BLOCKS = new Set(['█', '▓', '▒', '░', '▀', '▄', '▌', '▐', '▚', '▞']);

/**
 * Anything printable in ASCII, plus those blocks, plus the middle dot.
 *
 * The 80-column sheet is ASCII marks on a coloured ground - see the generator
 * for why it is not blocks - and ASCII is the one thing every terminal that
 * has ever called this board can draw.
 */
function amigaSafe(glyph: string): boolean {
  if (SAFE_BLOCKS.has(glyph) || glyph === '·') return true;
  const code = glyph.codePointAt(0) ?? 0;
  return code >= 0x20 && code <= 0x7e;
}

/** Every glyph in one sprite file. */
function glyphsOf(sprite: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (node.length === 3 && typeof node[0] === 'string' && typeof node[1] === 'number') {
        found.push(node[0] as string);
        return;
      }
      for (const child of node) walk(child);
    } else if (node && typeof node === 'object') {
      for (const child of Object.values(node as Record<string, unknown>)) walk(child);
    }
  };
  walk(sprite);
  return found;
}

export async function everySpriteGlyphExistsOnAnAmiga(): Promise<void> {
  const fs = require('fs');
  const path = require('path');
  const directory = path.join(__dirname, '..', '..', 'sprites');

  const offenders: string[] = [];
  for (const file of fs.readdirSync(directory).filter((n: string) => n.endsWith('.sprite.json'))) {
    const sprite = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    for (const glyph of glyphsOf(sprite)) {
      if (!amigaSafe(glyph)) {
        offenders.push(`${file}: ${glyph} (U+${glyph.codePointAt(0)?.toString(16).toUpperCase()})`);
      }
    }
  }

  assert.deepStrictEqual(
    [...new Set(offenders)], [],
    'these glyphs are not in the character set an Amiga terminal draws',
  );
}

/**
 * No two panels may read alike.
 *
 * The signature is the whole cell - the glyph AND both colours - because the
 * 80-column sheet draws every panel with the same character. It is a square
 * pixel: an upper half block whose foreground is the top pixel and whose
 * background is the bottom one, so what distinguishes two panels is the
 * PATTERN of the four pixels and the two shades they are drawn in, not the
 * glyph. Comparing glyphs alone would call all eight identical.
 */
export async function noTwoPanelsShareTheSameShape(): Promise<void> {
  const fs = require('fs');
  const path = require('path');
  const directory = path.join(__dirname, '..', '..', 'sprites');

  for (const variant of ['wide', 'c64']) {
    const shapes = new Map<string, string>();
    const files = fs.readdirSync(directory)
      .filter((n: string) => n.endsWith('.sprite.json'))
      .filter((n: string) => (variant === 'c64' ? n.includes('-c64') : !n.includes('-c64')));

    for (const file of files) {
      const sprite = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      // The normal state's two cells are what a player reads.
      const normal = sprite.animations?.normal?.frames?.[0]?.[0] ?? [];
      const signature = normal.map((cell: unknown[]) => cell.join(':')).join('|');
      const seen = shapes.get(signature);
      assert.strictEqual(
        seen, undefined,
        `${variant}: ${file} and ${seen} both read as "${signature}"`,
      );
      shapes.set(signature, file);
    }
    assert.strictEqual(shapes.size, 8, `${variant}: eight distinct panels`);
  }
}

/**
 * A panel is FOUR SQUARE PIXELS and none of them is black.
 *
 * Two attempts got here. CP437 half blocks and shades paint the foreground
 * over the ground, so half of every tile kept the ground colour - black, with
 * a dark ink - and the board looked eaten into ("some blocks have black in
 * them"). The answer was the one pengo and frogger already used: one
 * character is an upper half block whose foreground is the top pixel and
 * whose background is the bottom one, which makes a character cell two pixels
 * that are each about square.
 */
export async function everyWidePanelIsFourSquarePixels(): Promise<void> {
  const fs = require('fs');
  const path = require('path');
  const directory = path.join(__dirname, '..', '..', 'sprites');
  const files = fs.readdirSync(directory)
    .filter((n: string) => n.endsWith('.sprite.json') && !n.includes('-c64'));

  assert.strictEqual(files.length, 8);

  for (const file of files) {
    const sprite = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    for (const [name, animation] of Object.entries<any>(sprite.animations)) {
      for (const frame of animation.frames) {
        for (const row of frame) {
          for (const cell of row) {
            if (!cell) continue;
            const [char, fg, bg] = cell;
            assert.strictEqual(
              char, '▀',
              `${file} ${name}: a pixel pair is an upper half block, not "${char}"`,
            );
            // Black is the terminal showing through, not a colour a panel has.
            assert.notStrictEqual(fg, 0, `${file} ${name}: a top pixel is black`);
            assert.notStrictEqual(bg, 0, `${file} ${name}: a bottom pixel is black`);
          }
        }
      }
    }
  }
}

/**
 * And the board is built from that width, not from the terminal's.
 *
 * `boardSize` used to multiply by a fixed two, so even with a one-character
 * C64 sprite the buffer would have been twice as wide as the panels drawn into
 * it - a half-empty board with the stack squeezed into the left of it.
 */
export async function theC64BoardIsAsWideAsItsPanels(): Promise<void> {
  const { boardSize, panelCols } = require('../../ui/panels/board-view');
  const stack: any = { width: 6, height: 12 };

  assert.strictEqual(panelCols('c64'), 1, 'a PETSCII panel is one character');
  assert.strictEqual(panelCols('wide'), 2, 'a terminal panel is two');

  assert.strictEqual(
    boardSize(stack, { variant: 'c64' }).cols, 6,
    'six panels at one character each',
  );
  assert.strictEqual(
    boardSize(stack, { variant: 'wide' }).cols, 12,
    'six panels at two characters each',
  );
}
