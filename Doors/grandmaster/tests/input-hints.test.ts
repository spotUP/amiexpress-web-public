/**
 * In-game control hints.
 *
 * Reported 2026-08-26: "the in-game button hints need to update as the key
 * bindings change, and it needs to know if keyboard or joypad is used and
 * show the proper hints."
 *
 * The hint bar was a hardcoded string - "1-6 special on player 0 self TAB
 * random BS discard P pause" - so it lied to anyone who rebound a key, and
 * to everyone playing on a pad, where none of those labels exist.
 */

import assert from 'assert';
import {
  tetrinetHints,
  buildHintLine,
  formatKeyName,
  formatTriggerName,
  keyFor,
  padFor,
} from '../ui/input-hints';

const DEFAULT_KEYS: any = {
  useSpecialOn: [['1'], ['2'], ['3'], ['4'], ['5'], ['6']],
  useSpecialSelf: ['0'],
  useSpecialRandom: ['tab'],
  discardSpecial: ['backspace'],
  pause: ['p'],
  left: ['left'],
  hardDrop: ['space'],
};

const PAD_BINDINGS: any = {
  use_special_self: ['button:a'],
  use_special_random: ['button:b'],
  discard_special: ['dpad:down'],
  pause: ['button:start'],
};

export async function keyNamesReadLikeKeys(): Promise<void> {
  assert.strictEqual(formatKeyName('tab'), 'TAB');
  assert.strictEqual(formatKeyName('backspace'), 'BS');
  assert.strictEqual(formatKeyName('space'), 'SPACE');
  assert.strictEqual(formatKeyName('p'), 'P');
}

export async function padNamesReadLikeControls(): Promise<void> {
  assert.strictEqual(formatTriggerName('button:a'), 'A');
  assert.strictEqual(formatTriggerName('button:start'), 'START');
  assert.strictEqual(formatTriggerName('dpad:left'), 'D-Left');
  // A raw axis number, because a stick name is fiction on a pad the browser
  // reports as "mapping: n/a" - see the 8BitDo work.
  assert.strictEqual(formatTriggerName('axis:3:positive'), 'AX3+');
}

export async function hintsFollowTheKEYSthePlayerBound(): Promise<void> {
  const rebound = { ...DEFAULT_KEYS, useSpecialRandom: ['r'], discardSpecial: ['delete'] };

  const line = tetrinetHints('keyboard', rebound, PAD_BINDINGS);

  assert.ok(line.includes('R random'), `rebound key should show: ${line}`);
  assert.ok(line.includes('DEL discard'), `rebound key should show: ${line}`);
  assert.ok(!line.includes('TAB'), `the old binding should be gone: ${line}`);
}

export async function hintsSwitchToTheJOYPADwhenItIsUsed(): Promise<void> {
  const line = tetrinetHints('gamepad', DEFAULT_KEYS, PAD_BINDINGS);

  assert.ok(line.includes('A self'), `pad control should show: ${line}`);
  assert.ok(line.includes('START pause'), `pad control should show: ${line}`);
  assert.ok(!line.includes('TAB'), `keyboard names must not appear: ${line}`);
}

export async function slotNumbersAreKeyboardOnly(): Promise<void> {
  // 1-6 target opponent slots and have no pad equivalent.
  const keyboard = tetrinetHints('keyboard', DEFAULT_KEYS, PAD_BINDINGS);
  const pad = tetrinetHints('gamepad', DEFAULT_KEYS, PAD_BINDINGS);

  assert.ok(keyboard.includes('1-6'));
  assert.ok(!pad.includes('1-6'));
}

export async function unboundActionsAreLeftOut(): Promise<void> {
  // A hint for a control that does nothing is worse than no hint.
  const sparse: any = { useSpecialSelf: ['0'] };

  const line = tetrinetHints('keyboard', sparse, {});

  assert.ok(line.includes('0 self'));
  assert.ok(!line.includes('discard'), `unbound action should be absent: ${line}`);
  assert.ok(!line.includes('pause'), `unbound action should be absent: ${line}`);
}

export async function lookupsReturnNothingWhenUnbound(): Promise<void> {
  assert.strictEqual(keyFor('hold', {}), null);
  assert.strictEqual(padFor('hold', {}), null);
  assert.strictEqual(keyFor('not_an_action', DEFAULT_KEYS), null);
}

export async function theLineIsBuiltFromTheEntriesGiven(): Promise<void> {
  const line = buildHintLine(
    [{ action: 'pause', label: 'pause' }, { action: 'hard_drop', label: 'drop' }],
    'keyboard',
    DEFAULT_KEYS,
    {}
  );

  assert.strictEqual(line, 'P pause   SPACE drop');
}
