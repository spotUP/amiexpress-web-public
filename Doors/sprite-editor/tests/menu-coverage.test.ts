/**
 * Task 7: "nothing should be hidden behind only hotkeys" - every key a
 * screen registers must also be reachable from a menu. The controller's
 * audit found three gaps (edit-screen.ts's escape and delete/backspace,
 * art-screen.ts's whole picker) that a SOURCE-SHAPE regex never would have
 * caught, because a source pin only proves what you remembered to grep
 * for - it says nothing about what got registered that the grep never
 * anticipated. This file is the real fix: a RUNTIME check, built the same
 * way edit-screen-behavior.test.ts's fake screen already proves out, that
 * compares what a screen actually has registered against what the
 * screen's own binding table declares. Any key registered outside the
 * table - by construction, ANY future gap of this exact shape - fails it.
 *
 * Two screens are audited: EditScreen and ArtSession, the two the
 * controller's audit named and this task's brief scopes its Files/Test
 * lists to. StudioApp (app.ts, the browser) is deliberately NOT audited
 * here - manual review of its own buildBindings() table (every keyed
 * entry already carries a menu/label) plus its own existing shape tests
 * (app-shape.test.ts's theBrowserHasAMenuBarBuiltFromTheBindingSet and
 * bindKeysRoutesThroughTheDialogOpenGuard) already establish the identical
 * invariant there; this is a deliberate scope decision, not a silent gap.
 *
 * Documented, deliberate exceptions (this runtime check would not even
 * SEE these - it only inspects Screen.key() registrations - documented
 * anyway, per the brief's instruction not to leave an exception implicit):
 *  - edit-screen.ts's raw `screen.on('keypress', onKeypress)` listener
 *    (typed cell-art glyphs) is not a screen.key() binding at all - it is
 *    the ordinary "type a character" affordance, the same as typing into
 *    any text field, and needs no menu item any more than a text field
 *    does.
 *  - dialogs.ts's promptText()/confirm() dialogs, and the SDK widgets they
 *    are built on (Textbox, ConfirmModal - its own ESC handler and its
 *    Button.key(['enter','return']), MenuBar/DropdownMenu's own internal
 *    Tab/arrow navigation) all register through Element.key() (`this.key(
 *    ...)` on the WIDGET itself), which lives in a completely different
 *    map (screen.ts's own private `keyHandlers`, keyed only when the
 *    widget is focused) from Screen.key()'s registered-handler map, which
 *    is what this file's `_keyBindings` fake tracks. They are already
 *    reachable without a hotkey (a Textbox is directly typable; a
 *    ConfirmModal's two buttons are clickable and Tab-reachable), so they
 *    are out of scope for a STUDIO menu entry by design.
 */

import assert from 'assert';
import { EditScreen } from '../edit-screen';
import { ArtSession } from '../art-screen';
import type { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

/**
 * Same fake screen edit-screen-behavior.test.ts already proved lets
 * EditScreen (DockablePanels, Textbox, ConfirmModal included) AND
 * ArtSession (a plain blessed.list) construct and tear down correctly -
 * duplicated here rather than imported, the established per-file
 * convention in this test suite (panels-behavior.test.ts and
 * dialogs-shape.test.ts each keep their own copy too).
 */
function makeFakeScreen(): any {
  const screen: any = {
    width: 80,
    height: 24,
    children: [] as any[],
    _getCoords: () => ({ xi: 0, xl: 80, yi: 0, yl: 24 }),
    append(element: any) {
      element.parent = screen;
      element.screen = screen;
      screen.children.push(element);
      element.emit('attach');
    },
    remove(element: any) {
      screen.children = screen.children.filter((c: any) => c !== element);
    },
    render() {},
    clearRegion() {},
    invalidateMouseIndex() {},
    _keyBindings: [] as Array<[string[], (...args: any[]) => void]>,
    key(keys: string[], handler: (...args: any[]) => void) {
      screen._keyBindings.push([keys, handler]);
    },
    unkey(keys: string[], handler: (...args: any[]) => void) {
      screen._keyBindings = screen._keyBindings.filter(([, h]: any) => h !== handler);
    },
    _keypressHandlers: [] as Array<(ch: string) => void>,
    on(event: string, handler: (ch: string) => void) {
      if (event === 'keypress') screen._keypressHandlers.push(handler);
    },
    removeListener(event: string, handler: (ch: string) => void) {
      if (event === 'keypress') {
        screen._keypressHandlers = screen._keypressHandlers.filter((h: any) => h !== handler);
      }
    },
    _focused: null as any,
    setFocused(element: any) {
      if (screen._focused && screen._focused !== element) {
        screen._focused.focused = false;
        screen._focused.emit('blur');
      }
      screen._focused = element;
      if (element) {
        element.focused = true;
        element.emit('focus');
      }
    },
    getFocused() {
      return screen._focused;
    },
    focusTrap: null as any,
    trapFocus(container: any) {
      screen.focusTrap = container;
    },
    releaseFocusTrap(owner?: any) {
      if (!screen.focusTrap) return;
      if (owner && screen.focusTrap !== owner) return;
      screen.focusTrap = null;
    },
    isFocusTrapped() {
      return screen.focusTrap !== null;
    },
    getFocusTrap() {
      return screen.focusTrap;
    },
  };
  return screen;
}

/** Every Screen.key()-registered key name, from the fake screen's own tracking. */
function registeredScreenKeyNames(screen: any): string[] {
  const names = new Set<string>();
  for (const [keys] of screen._keyBindings) {
    for (const k of keys) names.add(k);
  }
  return [...names].sort();
}

/** Every key name any table binding declares. */
function tableKeyNames(bindings: Array<{ keys: string[] }>): string[] {
  const names = new Set<string>();
  for (const b of bindings) for (const k of b.keys) names.add(k);
  return [...names].sort();
}

function fixtureSprite(): Sprite {
  return {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
}

export async function everyEditScreenKeyedBindingHasAMenuEntry(): Promise<void> {
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', fixtureSprite(), () => {});
  try {
    const bindings: Array<{ id: string; keys: string[]; menu: string; label: string }> =
      (edit as any).bindingSet.bindings;
    assert.ok(bindings.length > 0, 'precondition: EditScreen must declare a non-empty binding table');
    for (const b of bindings) {
      if (b.keys.length === 0) continue; // menu-only bindings (keys: []) are exempt by design
      assert.ok(b.menu && b.menu.length > 0, `binding '${b.id}' has keys ${JSON.stringify(b.keys)} but no menu`);
      assert.ok(b.label && b.label.length > 0, `binding '${b.id}' has keys ${JSON.stringify(b.keys)} but no label`);
    }
  } finally {
    edit.destroy();
  }
}

/**
 * The real fix: this is what catches gaps 1 and 2 (escape, delete/
 * backspace) - both used to be registered directly via a bare
 * `this.key([...])` call OUTSIDE buildOpBindings(), so they showed up on
 * the real screen with no matching table entry at all. A source-shape pin
 * over the table's contents alone could never see this, because the bug
 * was in what ELSE got registered, not in what the table said.
 */
export async function editScreenRegistersNoScreenKeysOutsideItsBindingTable(): Promise<void> {
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', fixtureSprite(), () => {});
  try {
    const registered = registeredScreenKeyNames(screen);
    const tabled = tableKeyNames((edit as any).bindingSet.bindings);
    const extra = registered.filter(k => !tabled.includes(k));
    const missing = tabled.filter(k => !registered.includes(k));
    assert.deepStrictEqual(extra, [],
      `these keys are registered on the screen but have NO table entry - the exact shape of gaps 1/2: ${extra.join(', ')}`);
    assert.deepStrictEqual(missing, [],
      `these table keys were declared but never actually registered on the screen: ${missing.join(', ')}`);
  } finally {
    edit.destroy();
  }
}

export async function everyArtSessionKeyedBindingHasAMenuEntry(): Promise<void> {
  const screen = makeFakeScreen();
  const session = new ArtSession(screen, 'fixture-door', () => {});
  try {
    assert.ok((session as any).bindingSet,
      'ArtSession must build a bindingSet - without one, none of its keys are menu-reachable');
    const bindings: Array<{ id: string; keys: string[]; menu: string; label: string }> =
      (session as any).bindingSet.bindings;
    assert.ok(bindings.length > 0, 'precondition: ArtSession must declare a non-empty binding table');
    for (const b of bindings) {
      if (b.keys.length === 0) continue;
      assert.ok(b.menu && b.menu.length > 0, `binding '${b.id}' has keys ${JSON.stringify(b.keys)} but no menu`);
      assert.ok(b.label && b.label.length > 0, `binding '${b.id}' has keys ${JSON.stringify(b.keys)} but no label`);
    }
  } finally {
    session.destroy();
  }
}

/**
 * The real fix for gap 3: before this task the picker had no bindingSet at
 * all (`(session as any).bindingSet` was undefined) and every one of
 * up/k/down/j/enter/escape was registered directly via a bare this.key()
 * call - this is what would have failed, the same shape as the edit-screen
 * check above.
 */
export async function artSessionRegistersNoScreenKeysOutsideItsBindingTable(): Promise<void> {
  const screen = makeFakeScreen();
  const session = new ArtSession(screen, 'fixture-door', () => {});
  try {
    const registered = registeredScreenKeyNames(screen);
    const tabled = tableKeyNames((session as any).bindingSet.bindings);
    const extra = registered.filter(k => !tabled.includes(k));
    const missing = tabled.filter(k => !registered.includes(k));
    assert.deepStrictEqual(extra, [],
      `these keys are registered on the screen but have NO table entry - the exact shape of gap 3: ${extra.join(', ')}`);
    assert.deepStrictEqual(missing, [],
      `these table keys were declared but never actually registered on the screen: ${missing.join(', ')}`);
  } finally {
    session.destroy();
  }
}
