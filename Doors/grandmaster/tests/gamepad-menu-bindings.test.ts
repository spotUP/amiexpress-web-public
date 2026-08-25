/**
 * Joypad bindings have to reach the MENUS, not just the game.
 *
 * Reported live 2026-08-25 with an 8BitDo NES30 Pro: "when I have bound all
 * buttons I can't navigate the menu with the joypad, so it seems the bindings
 * don't save."
 *
 * They did save. The menu navigation was a separate, hardcoded scheme -
 * D-pad, A, B, Start, Select - that never looked at the saved bindings at
 * all, so a pad whose buttons enumerate differently could be fully bound and
 * still not move a menu. A player binds their pad once; the menus have to
 * honour that.
 *
 * These tests drive the exported mapping helpers rather than the screen, so
 * they prove the wiring without needing a real pad.
 */

import assert from 'assert';
import { buildGamepadMapping, MENU_ACTION_KEYS, parseTriggerStr } from '../app';

/** The triggers a menu key would fire on, given the player's bindings. */
function triggersForMenuKey(keyName: string, saved: Record<string, string[]>): any[] {
  const mapping = buildGamepadMapping({}, saved);
  const found: any[] = [];
  for (const [action, menuKey] of Object.entries(MENU_ACTION_KEYS)) {
    if ((menuKey as any)?.name !== keyName) continue;
    found.push(...((mapping as any)[action] ?? []));
  }
  return found;
}

export async function aBoundButtonMovesTheMenu(): Promise<void> {
  // A pad whose D-pad landed on a hat axis: the player binds movement to
  // whatever their pad actually reports.
  const saved = {
    hard_drop: ['axis:9:negative'],
    soft_drop: ['axis:9:positive'],
  };

  const up = triggersForMenuKey('up', saved);
  const down = triggersForMenuKey('down', saved);

  assert.ok(
    up.some((t: any) => t.type === 'axis' && t.axis === 9 && t.direction === 'negative'),
    'the binding for hard drop should move the menu up'
  );
  assert.ok(
    down.some((t: any) => t.type === 'axis' && t.axis === 9 && t.direction === 'positive'),
    'the binding for soft drop should move the menu down'
  );
}

export async function everyMenuDirectionHasAnAction(): Promise<void> {
  // A menu needs all four arrows plus confirm and back, or a pad-only player
  // reaches a screen they cannot leave.
  const names = new Set(Object.values(MENU_ACTION_KEYS).map((k: any) => k.name));

  for (const needed of ['up', 'down', 'left', 'right', 'enter', 'escape']) {
    assert.ok(names.has(needed), `no game action drives the menu's ${needed}`);
  }
}

export async function anUnusualAxisCanBeBound(): Promise<void> {
  // The binder used to name only the two sticks and drop anything else, so a
  // hat-axis D-pad could not be expressed as a trigger at all.
  const trigger: any = parseTriggerStr('axis:9:positive');

  assert.ok(trigger, 'a bare axis number should parse');
  assert.strictEqual(trigger.type, 'axis');
  assert.strictEqual(trigger.axis, 9);
  assert.strictEqual(trigger.direction, 'positive');
}

export async function namedSticksStillParse(): Promise<void> {
  const trigger: any = parseTriggerStr('axis:left-x:negative');

  assert.ok(trigger);
  assert.strictEqual(trigger.type, 'axis');
  assert.strictEqual(trigger.direction, 'negative');
}

export async function rubbishTriggersAreRejected(): Promise<void> {
  assert.strictEqual(parseTriggerStr('axis:nonsense:positive'), null);
  assert.strictEqual(parseTriggerStr('button:nope'), null);
  assert.strictEqual(parseTriggerStr('nonsense'), null);
}

export async function anEmptyBindingDisablesTheAction(): Promise<void> {
  // Clearing a binding must mean "off", not "fall back to the default", or a
  // player cannot get rid of a mapping they dislike.
  const mapping: any = buildGamepadMapping(
    { left: [{ type: 'dpad', direction: 'left' }] } as any,
    { left: [] }
  );

  assert.strictEqual(mapping.left, undefined);
}
