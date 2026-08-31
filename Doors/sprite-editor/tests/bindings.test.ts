/**
 * bindings.ts is the single table that drives both hotkey wiring and the
 * glyph-typing exclusion set (see edit-screen.ts). These tests pin the
 * generic contract in isolation, with a small sample table, before any
 * door screen consumes it.
 */

import assert from 'assert';
import { buildBindingSet, StudioBinding } from '../bindings';

function noop(): void {}

const sample: StudioBinding[] = [
  { id: 'frame.new', keys: ['n'], hotkeyHint: 'n', menu: 'Frame', label: 'New Frame', handler: noop },
  { id: 'frame.delete', keys: ['x'], hotkeyHint: 'x', menu: 'Frame', label: 'Delete Frame', handler: noop },
  { id: 'animation.delete', keys: ['S-x'], hotkeyHint: 'S-x', menu: 'Animation', label: 'Delete Animation', handler: noop },
  { id: 'file.save', keys: ['s'], hotkeyHint: 's', menu: 'File', label: 'Save', handler: noop },
];

export async function excludedGlyphKeysContainsEverySinglePrintableCharKey(): Promise<void> {
  const set = buildBindingSet(sample).excludedGlyphKeys;
  assert.ok(set.has('n'), 'a plain single-char key must contribute itself');
  assert.ok(set.has('x'), 'a plain single-char key must contribute itself');
  assert.ok(set.has('s'), 'a plain single-char key must contribute itself');
  assert.ok(set.has('X'), 'S-x must contribute the uppercase letter X');
  assert.ok(!set.has('S-x'), 'the raw key name itself must not appear in the glyph set');
}

export async function multiCharKeyNamesContributeNothing(): Promise<void> {
  const bindings: StudioBinding[] = [
    { id: 'cursor.up', keys: ['up'], hotkeyHint: 'up', menu: 'View', label: 'Move Up', handler: noop },
    { id: 'view.toggle', keys: ['tab'], hotkeyHint: 'tab', menu: 'View', label: 'Toggle Mode', handler: noop },
  ];
  const set = buildBindingSet(bindings).excludedGlyphKeys;
  assert.strictEqual(set.size, 0, `arrow/tab-style key names must not leak into the glyph set: ${[...set]}`);
}

export async function menuItemsGroupsByMenuPreservingTableOrder(): Promise<void> {
  const menus = buildBindingSet(sample).menuItems();
  assert.deepStrictEqual(menus.map(m => m.label), ['Frame', 'Animation', 'File'],
    'menus must appear in first-seen table order');
  assert.deepStrictEqual(menus[0].items.map(i => i.label), ['New Frame (n)', 'Delete Frame (x)'],
    'items must preserve table order within their menu and include the hotkey hint');
  assert.strictEqual(menus[1].items[0].label, 'Delete Animation (S-x)');
}

export async function menuItemLabelOmitsTheHintParenWhenThereIsNoHotkey(): Promise<void> {
  const bindings: StudioBinding[] = [
    { id: 'tool.recolor', keys: [], hotkeyHint: '', menu: 'Tools', label: 'Recolor Selection', handler: noop },
  ];
  const menus = buildBindingSet(bindings).menuItems();
  assert.strictEqual(menus[0].items[0].label, 'Recolor Selection',
    'a binding with no hotkey must not render an empty "()" suffix');
}

export async function duplicateIdsThrowAtBuildTime(): Promise<void> {
  const bindings: StudioBinding[] = [
    { id: 'frame.new', keys: ['n'], hotkeyHint: 'n', menu: 'Frame', label: 'New Frame', handler: noop },
    { id: 'frame.new', keys: ['c'], hotkeyHint: 'c', menu: 'Frame', label: 'Also New Frame', handler: noop },
  ];
  assert.throws(() => buildBindingSet(bindings), /frame\.new/,
    'two bindings sharing an id must throw at build time, naming the id');
}

/**
 * Controller ruling: a binding may declare an EMPTY keys array for a
 * menu-only action (no hotkey at all, wired later by a menu task). It must
 * contribute nothing to key wiring or the glyph exclusion set, but it must
 * still appear in menuItems() so a menu can offer it.
 */
export async function anEmptyKeysBindingIsMenuOnly(): Promise<void> {
  const bindings: StudioBinding[] = [
    { id: 'frame.new', keys: ['n'], hotkeyHint: 'n', menu: 'Frame', label: 'New Frame', handler: noop },
    { id: 'frame.resize', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Resize Canvas', handler: noop },
  ];
  const set = buildBindingSet(bindings);
  assert.strictEqual(set.excludedGlyphKeys.size, 1, 'the menu-only binding must not add to the glyph set');
  const items = set.menuItems()[0].items.map(i => i.label);
  assert.deepStrictEqual(items, ['New Frame (n)', 'Resize Canvas'],
    'a keys:[] binding must still surface as a menu item');
}

/**
 * The two shifted-punctuation bindings edit-screen.ts actually uses
 * (S-, / S-.) type '<' / '>' on a real keyboard, not the letter-uppercase
 * rule's ',' / '.' - a keyboard shift+comma is the symbol '<', never a
 * capitalised comma. Pinned here since edit-screen-behavior.test.ts relies
 * on it to keep '<'/'>' out of painted cell art.
 */
export async function shiftedCommaAndPeriodContributeTheirRealSymbols(): Promise<void> {
  const bindings: StudioBinding[] = [
    { id: 'frame.moveEarlier', keys: ['S-,'], hotkeyHint: 'S-,', menu: 'Frame', label: 'Move Frame Earlier', handler: noop },
    { id: 'frame.moveLater', keys: ['S-.'], hotkeyHint: 'S-.', menu: 'Frame', label: 'Move Frame Later', handler: noop },
  ];
  const set = buildBindingSet(bindings).excludedGlyphKeys;
  assert.ok(set.has('<'), 'S-, must contribute the real shifted symbol <');
  assert.ok(set.has('>'), 'S-. must contribute the real shifted symbol >');
}

/** blessed names the spacebar 'space', not the literal character ' '. */
export async function theSpaceKeyContributesTheSpaceCharacter(): Promise<void> {
  const bindings: StudioBinding[] = [
    { id: 'paint.paint', keys: ['space'], hotkeyHint: 'space', menu: 'Paint', label: 'Paint', handler: noop },
  ];
  const set = buildBindingSet(bindings).excludedGlyphKeys;
  assert.ok(set.has(' '), 'space must contribute the literal space character');
}
