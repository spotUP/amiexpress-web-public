/**
 * Saved settings must not delete actions that did not exist when they were
 * written.
 *
 * Reported four times over two days: "the TetriNET specials still don't fire
 * on tab or number." The keys were arriving at the door perfectly - a probe
 * showed name="1", name="tab", name="0" - and resolving to NOTHING, because
 * the player's saved settings file contained only the nine movement
 * bindings. It was written before 1-6, 0, TAB and Backspace existed, and
 * loading it replaced the whole key map rather than filling in around it.
 *
 * Anyone who had ever opened the settings screen therefore had no special
 * keys at all, which is why this looked like broken specials rather than
 * missing bindings.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_KEYS, keyToAction } from '../input/config';

const app = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');

/** How the app merges a saved file over the defaults. */
function merge(saved: Record<string, unknown>): any {
  return { ...DEFAULT_KEYS, ...saved };
}

/** A settings file from before the specials existed. */
const OLD_SAVE = {
  left: ['left'],
  right: ['right'],
  rotateCW: ['up', 'x'],
  rotateCCW: ['z'],
  rotate180: ['a'],
  softDrop: ['down'],
  hardDrop: ['space'],
  hold: ['c'],
  pause: ['p'],
};

export async function anOldSaveKeepsItsOwnMovementKeys(): Promise<void> {
  const merged = merge(OLD_SAVE);

  assert.deepStrictEqual(merged.left, ['left'], 'the player own bindings must win');
  assert.deepStrictEqual(merged.hold, ['c']);
}

export async function anOldSaveStillGetsTheSpecialKeys(): Promise<void> {
  const merged = merge(OLD_SAVE);

  assert.ok(merged.useSpecialOn, 'specials must be filled in from the defaults');
  assert.ok(merged.useSpecialSelf);
  assert.ok(merged.useSpecialRandom);
  assert.ok(merged.discardSpecial);
}

export async function theActualKeysResolveAfterMerging(): Promise<void> {
  // The exact keys the reporter pressed, through the exact function the
  // door uses to turn a key into an action.
  const merged = merge(OLD_SAVE);

  assert.strictEqual(keyToAction('1', merged), 'use_special_1');
  assert.strictEqual(keyToAction('6', merged), 'use_special_6');
  assert.strictEqual(keyToAction('0', merged), 'use_special_self');
  assert.strictEqual(keyToAction('tab', merged), 'use_special_random');
  assert.strictEqual(keyToAction('backspace', merged), 'discard_special');
}

export async function theyResolveToNothingWithoutTheMerge(): Promise<void> {
  // The bug, stated as a test: the raw saved file on its own.
  assert.strictEqual(keyToAction('1', OLD_SAVE as any), null);
  assert.strictEqual(keyToAction('tab', OLD_SAVE as any), null);
}

export async function theAppActuallyMergesOnLoad(): Promise<void> {
  // Wiring, not just capability - the merge has to happen where settings
  // are read, or none of the above matters.
  const start = app.indexOf('private loadSettings');
  assert.ok(start > 0, 'loadSettings should exist');
  const body = app.slice(start, start + 2500);

  assert.ok(
    body.includes('...DEFAULT_KEYS') && body.includes('saved.keyBindings'),
    'loadSettings must merge saved keyBindings over DEFAULT_KEYS'
  );
}

export async function theWizardOffersTheSpecialsToo(): Promise<void> {
  // The wizard writes the actions it LISTS, so anything missing from its
  // list is deleted from the player's settings when they use it. That is
  // how the specials vanished; leaving them off the list would let it
  // happen again.
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const settings = readFileSync(join(__dirname, '..', 'ui', 'settings-screen.ts'), 'utf8');

  for (const action of ['useSpecialSelf', 'useSpecialRandom', 'discardSpecial']) {
    assert.ok(
      settings.includes(action),
      `the key binding wizard should offer ${action}`
    );
  }

  for (const action of ['use_special_self', 'use_special_random', 'discard_special']) {
    assert.ok(
      settings.includes(action),
      `the joypad wizard should offer ${action}`
    );
  }
}

export async function bindingsCanBeSkipped(): Promise<void> {
  // "We need a way to skip binding a button for joypad mapping if the
  // joypad doesn't have enough buttons."
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const settings = readFileSync(join(__dirname, '..', 'ui', 'settings-screen.ts'), 'utf8');

  assert.ok(
    settings.includes('leave unbound'),
    'both wizards should say that Enter skips an action'
  );
}
