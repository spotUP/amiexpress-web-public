/**
 * The picture behind the playfield.
 *
 * Super Qix hides a piece of ANSI art behind the field and uncovers it as
 * the player claims area, the way the arcade original does. These tests pin
 * the parts that are easy to get subtly wrong: which file a level gets, that
 * the art is cropped to the field rather than overflowing it, that unclaimed
 * ground still HIDES the picture, and that a revealed frame still fits an
 * 80-column screen.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { QixEngine } from '../game/qix-engine';
import { SuperQixData } from '../game/types';
import {
  listBackgrounds,
  loadBackgroundForLevel,
  artForCell,
} from '../game/background';
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  ART_WIDTH,
  ART_HEIGHT,
  CELL_WIDTH,
  SCREEN_WIDTH,
  STARTING_LIVES,
} from '../game/constants';

function createData(): SuperQixData {
  return {
    state: 'menu', score: 0, lives: STARTING_LIVES, level: 1,
    claimedPercent: 0, targetPercent: 75, scoreMultiplier: 1,
    field: [], fieldWidth: FIELD_WIDTH, fieldHeight: FIELD_HEIGHT,
    marker: {
      x: 0, y: 0, isDrawing: false, drawSpeed: null,
      hasShield: false, speedBoost: false, speedBoostTimer: 0,
    },
    currentStix: null,
    qixList: [], sparxList: [], fuse: null, qixIdCounter: 0, sparxIdCounter: 0,
    powerUps: [], powerUpIdCounter: 0, collectedLetters: [], levelWord: '',
    activeEffects: [], borderPath: [],
    highscores: [], menuSelection: 0, playerName: '', playerNameCursor: 0,
    lastUpdateTime: Date.now(), frameCount: 0, levelStartTime: Date.now(),
    stopTimer: 0, transitionTimer: 0, transitionMessage: '',
  };
}

/** Strip blessed tags to get the characters a terminal would actually show. */
function visible(frame: string): string {
  return frame.replace(/\{[^}]*\}/g, '');
}

const BLOCK_GLYPHS = /[▀-▟]/;

export async function backgroundsAreListedInAStableOrder(): Promise<void> {
  const names = listBackgrounds();
  assert.ok(names.length > 0, 'no background art found - the door ships art in backgrounds/');

  const sorted = [...names].sort();
  assert.deepStrictEqual(
    names, sorted,
    'backgrounds must be sorted, or a level would show a different picture between runs'
  );

  // XBin art carries its own font, which a terminal cannot load, so those
  // files would render as the wrong glyphs entirely.
  const xbin = names.filter(n => /\.xb$/i.test(n));
  assert.deepStrictEqual(xbin, [], `XBin files must not be offered as backgrounds: ${xbin.join(', ')}`);
}

export async function eachLevelGetsADeterministicPicture(): Promise<void> {
  const names = listBackgrounds();

  const first = await loadBackgroundForLevel(1);
  const second = await loadBackgroundForLevel(2);
  assert.ok(first, 'level 1 should have a background');
  assert.ok(second, 'level 2 should have a background');

  assert.strictEqual(first!.name, names[0], 'level 1 should show the first picture');
  assert.strictEqual(second!.name, names[1], 'level 2 should show the second');

  // Same level twice must give the same picture.
  const firstAgain = await loadBackgroundForLevel(1);
  assert.strictEqual(firstAgain!.name, first!.name);

  // And the list wraps once there are more levels than pictures.
  const wrapped = await loadBackgroundForLevel(names.length + 1);
  assert.strictEqual(wrapped!.name, names[0], 'levels past the last picture should wrap round');
}

export async function artIsCroppedToTheFieldNotOverflowing(): Promise<void> {
  const background = await loadBackgroundForLevel(1);
  assert.ok(background);

  assert.strictEqual(background!.cells.length, ART_HEIGHT, 'art should be cropped to the field height');
  for (const row of background!.cells) {
    assert.strictEqual(row.length, ART_WIDTH, 'every art row should be exactly the field width');
  }

  // One logical cell covers CELL_WIDTH art columns, and the grid must line
  // up with the art exactly - no partial cell at the right edge.
  assert.strictEqual(ART_WIDTH, FIELD_WIDTH * CELL_WIDTH);
}

export async function artForCellAlwaysReturnsAFullCell(): Promise<void> {
  const background = await loadBackgroundForLevel(1);

  const inside = artForCell(background, 0, 0);
  assert.strictEqual(inside.length, CELL_WIDTH);

  // Off the edge of the art, and with no art at all, it must still return a
  // full cell so the renderer never has to check for gaps.
  const outside = artForCell(background, FIELD_WIDTH + 50, FIELD_HEIGHT + 50);
  assert.strictEqual(outside.length, CELL_WIDTH);
  assert.strictEqual(artForCell(null, 0, 0).length, CELL_WIDTH);
}

/**
 * The whole point of the feature: the picture is hidden until claimed. If
 * unclaimed ground showed it, there would be nothing to uncover.
 */
export async function unclaimedGroundHidesThePictureAndClaimingRevealsIt(): Promise<void> {
  const data = createData();
  let frame = '';
  const engine = new QixEngine(data, content => { frame = content; });
  engine.setBackground(await loadBackgroundForLevel(1));
  engine.initLevel(1);

  assert.ok(
    !BLOCK_GLYPHS.test(visible(frame)),
    'the picture must not be visible before any area is claimed'
  );

  for (let y = 1; y < FIELD_HEIGHT - 1; y++) {
    for (let x = 1; x < FIELD_WIDTH - 1; x++) data.field[y][x] = 'claimed';
  }
  engine.render();

  assert.ok(
    BLOCK_GLYPHS.test(visible(frame)),
    'claiming the field should uncover the picture'
  );
}

export async function aRevealedFrameStillFitsTheScreen(): Promise<void> {
  const data = createData();
  let frame = '';
  const engine = new QixEngine(data, content => { frame = content; });
  engine.setBackground(await loadBackgroundForLevel(1));
  engine.initLevel(1);

  for (let y = 1; y < FIELD_HEIGHT - 1; y++) {
    for (let x = 1; x < FIELD_WIDTH - 1; x++) data.field[y][x] = 'claimed';
  }
  engine.render();

  const rows = frame.split('\n');
  assert.strictEqual(rows.length, FIELD_HEIGHT, 'the frame should be one row per field row');

  for (const row of rows) {
    const width = visible(row).length;
    assert.strictEqual(
      width, SCREEN_WIDTH,
      `a revealed row is ${width} columns wide, but the screen is ${SCREEN_WIDTH}`
    );
  }
}

/**
 * A board whose art is missing must still be playable - the door falls back
 * to the flat playfield rather than failing to start.
 */
export async function aBoardWithNoArtStillRenders(): Promise<void> {
  const data = createData();
  let frame = '';
  const engine = new QixEngine(data, content => { frame = content; });
  engine.setBackground(null);
  engine.initLevel(1);

  for (let y = 1; y < FIELD_HEIGHT - 1; y++) {
    for (let x = 1; x < FIELD_WIDTH - 1; x++) data.field[y][x] = 'claimed';
  }
  engine.render();

  const rows = frame.split('\n');
  assert.strictEqual(rows.length, FIELD_HEIGHT);
  for (const row of rows) {
    assert.strictEqual(visible(row).length, SCREEN_WIDTH);
  }
}

/**
 * The art ships inside the door, so it travels with the Doors volume on a
 * deploy. Art resolved relative to the working directory would be looked for
 * under web/backend, which is the mistake that lost Arkanoid's highscores.
 */
export async function artShipsInsideTheDoor(): Promise<void> {
  const dir = path.resolve(__dirname, '..', 'backgrounds');
  assert.ok(fs.existsSync(dir), `backgrounds/ must live inside the door, expected ${dir}`);

  const shipped = fs.readdirSync(dir).filter(n => /\.(ans|asc)$/i.test(n));
  assert.ok(shipped.length > 0, 'no art files shipped with the door');
}
