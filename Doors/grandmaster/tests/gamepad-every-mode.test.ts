/**
 * The joypad works in EVERY mode, not just the single-player one.
 *
 * Reported live 2026-08-26: "the joypad doesn't work in TetriNET, why don't
 * they use the same codebase?" - a fair question. The mapper was built
 * inline inside the single-player launch and handed to GameScreen alone, so
 * TetriNET had no joypad support at all: not a bug in the pad code, an
 * entire screen that never asked for it.
 *
 * There is now ONE builder (createGamepadMapper) and every screen that takes
 * input takes the mapper. These tests fail if a new mode is added that
 * forgets it, which is the mistake being locked out.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const app = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');
const tetrinetScreen = readFileSync(join(__dirname, '..', 'ui', 'tetrinet-screen.ts'), 'utf8');

export async function thereIsOneBuilderForTheJoypad(): Promise<void> {
  assert.ok(
    app.includes('private createGamepadMapper()'),
    'the pad should be built in one place, not inline per screen'
  );

  // Inline construction is what let one screen have a pad and another not.
  const inlineBuilds = app.split('new GamepadActionMapper').length - 1;
  assert.strictEqual(
    inlineBuilds, 1,
    `GamepadActionMapper should be constructed once, inside the builder; found ${inlineBuilds}`
  );
}

export async function everyTetrinetLaunchGetsTheJoypad(): Promise<void> {
  const launches = app.split('new TetriNetScreen({').length - 1;
  const withPad = app.split('gamepadMapper: tetrinetPad').length - 1;

  assert.ok(launches > 0, 'expected TetriNET launches to exist');
  assert.strictEqual(
    withPad, launches,
    `${launches} TetriNET launches but only ${withPad} pass a joypad`
  );
}

export async function tetrinetBindsThePadToTheSameActions(): Promise<void> {
  // Same callbacks for keyboard and pad, through one helper - not a second
  // set of bindings that can drift from the first.
  assert.ok(
    tetrinetScreen.includes('this.gamepadMapper?.on(action, handler)'),
    'TetriNET should bind the pad through its shared on() helper'
  );

  for (const action of ['left', 'right', 'rotate_cw', 'soft_drop', 'hard_drop', 'hold', 'pause']) {
    assert.ok(
      tetrinetScreen.includes(`on('${action}'`),
      `TetriNET should route "${action}" through the shared binder`
    );
  }
}

export async function theBuilderUsesThePlayersTiming(): Promise<void> {
  // The same DAS/ARR the keyboard uses, so the two do not feel different.
  const start = app.indexOf('private createGamepadMapper()');
  const body = app.slice(start, start + 700);

  assert.ok(body.includes('this.state.settings.das'), 'pad DAS should come from settings');
  assert.ok(body.includes('this.state.settings.arr'), 'pad ARR should come from settings');
  assert.ok(body.includes('TIMING.DAS_DELAY'), 'pad DAS should fall back to the shared default');
  assert.ok(body.includes('TIMING.ARR_RATE'), 'pad ARR should fall back to the shared default');
}
