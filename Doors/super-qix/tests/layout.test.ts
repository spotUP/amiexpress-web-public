/**
 * Playfield layout.
 *
 * Reported live 2026-08-30 with a screenshot: the field drew on every OTHER
 * row, its right and bottom borders were missing, the HUD was absent, and a
 * stray frame was drawn around the game area.
 *
 * One cause behind all of it. `blessed.box()` in this SDK returns a Panel,
 * and Panel defaults to `{type:'line', fg:'blue'}` whenever `border` is not
 * present in the options (widgets/panel.ts) - unlike real blessed, where a
 * box has no border. So:
 *
 *   - the game area lost two columns and two rows to a border nobody asked
 *     for, leaving an inner width of 78 for an 80-column field. Each row
 *     then wrapped, inserting a blank line after every real line, which is
 *     the "every other row is black" the user saw, and pushed the bottom
 *     half of the field out of view;
 *   - the HUD is one row tall, so its injected border WAS the whole box and
 *     the score line never appeared at all.
 *
 * The door now passes `border: undefined` explicitly (which Panel honours,
 * since it tests `'border' in options`) and `wrap: false`, because the
 * engine lays the field out itself and must never be re-wrapped.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  FIELD_WIDTH,
  FIELD_HEIGHT,
  CELL_WIDTH,
} from '../game/constants';

function makeScreen(): any {
  return blessed.screen({
    smartCSR: true,
    dockBorders: true,
    fullUnicode: false,
    output: () => {},
    input: null as any,
  } as any);
}

/**
 * The defect itself, pinned: a box created the way the door used to create
 * one comes out with a border, and therefore too little room for the field.
 * If this ever stops being true the Panel default has changed and the
 * door's explicit `border: undefined` can be revisited.
 */
export async function aDefaultBoxStillComesWithAnUnwantedBorder(): Promise<void> {
  const screen = makeScreen();
  const box: any = blessed.box({
    parent: screen, top: 1, left: 0, width: '100%', height: SCREEN_HEIGHT - 4,
  });

  assert.strictEqual(
    box.hasBorder(), true,
    'Panel no longer injects a default border - the door can stop working around it'
  );
  assert.ok(
    box.iwidth < FIELD_WIDTH * CELL_WIDTH,
    `a default box has inner width ${box.iwidth}, which is why the field wrapped`
  );
}

/**
 * The game area as the door builds it must hold the field exactly: one
 * character per art column, one row per field row, with nothing left over
 * to wrap or clip.
 */
export async function theGameAreaFitsTheFieldExactly(): Promise<void> {
  const screen = makeScreen();
  const gameArea: any = blessed.box({
    fixed: true,
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: SCREEN_HEIGHT - 4,
    tags: true,
    wrap: false,
    border: undefined,
    style: { bg: 'black' },
  });

  assert.strictEqual(gameArea.hasBorder(), false, 'the game area must have no border');
  assert.strictEqual(
    gameArea.iwidth, FIELD_WIDTH * CELL_WIDTH,
    `the field is ${FIELD_WIDTH * CELL_WIDTH} columns; the game area offers ${gameArea.iwidth}`
  );
  assert.strictEqual(
    gameArea.iheight, FIELD_HEIGHT,
    `the field is ${FIELD_HEIGHT} rows; the game area offers ${gameArea.iheight}`
  );
  assert.strictEqual(FIELD_WIDTH * CELL_WIDTH, SCREEN_WIDTH, 'the field should fill the screen width');
}

/** A one-row HUD must keep its row. */
export async function theHudKeepsItsSingleRow(): Promise<void> {
  const screen = makeScreen();
  const hud: any = blessed.box({
    parent: screen, top: 0, left: 0, width: '100%', height: 1,
    tags: true, border: undefined, content: 'HUD',
  });

  assert.strictEqual(hud.hasBorder(), false);
  assert.strictEqual(hud.iheight, 1, 'the HUD lost its only row to a border');
  assert.strictEqual(hud.iwidth, SCREEN_WIDTH);
}

/**
 * The three panes must tile the screen exactly - no overlap, no gap. The
 * footer overdrawing the field was part of the reported symptom.
 */
export async function theThreePanesTileTheScreenWithoutOverlap(): Promise<void> {
  const hudRows = 1;
  const gameRows = SCREEN_HEIGHT - 4;
  const footerRows = 3;

  assert.strictEqual(
    hudRows + gameRows + footerRows, SCREEN_HEIGHT,
    'HUD + game area + footer must add up to exactly the screen height'
  );
  assert.strictEqual(gameRows, FIELD_HEIGHT, 'the game area must be exactly as tall as the field');
}

/**
 * And the door must actually declare both, or the fix is not in the product.
 */
export async function theDoorDeclaresBorderlessAndUnwrapped(): Promise<void> {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf-8');

  const gameAreaBlock = src.slice(src.indexOf('gameArea = blessed.box('));
  const gameAreaOptions = gameAreaBlock.slice(0, gameAreaBlock.indexOf('});'));
  assert.ok(/wrap:\s*false/.test(gameAreaOptions), 'the game area must set wrap: false');
  assert.ok(/border:\s*undefined/.test(gameAreaOptions), 'the game area must set border: undefined');

  const hudBlock = src.slice(src.indexOf('hudBox = blessed.box('));
  const hudOptions = hudBlock.slice(0, hudBlock.indexOf('});'));
  assert.ok(/border:\s*undefined/.test(hudOptions), 'the HUD must set border: undefined');
}
