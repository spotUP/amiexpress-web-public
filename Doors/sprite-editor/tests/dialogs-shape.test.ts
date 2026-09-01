/**
 * dialogs.ts in isolation: promptText()/confirm() against a REAL SDK
 * Textbox/ConfirmModal (constructed on the same minimal fake-screen
 * technique edit-screen-behavior.test.ts already proved lets DockablePanel
 * and friends construct and operate correctly), not a source-shape grep.
 *
 * edit-screen-behavior.test.ts proves the INTEGRATION (EditScreen's real
 * op bindings/mouse handlers actually respect screen.dialogOpen while
 * these dialogs are open). This file proves dialogs.ts's own contract in
 * isolation: the Promise resolves/rejects the right value, and
 * screen.dialogOpen is set true before the dialog is visible and cleared
 * before the Promise resolves - every time, on every exit path.
 */

import assert from 'assert';
import { promptText, confirm } from '../dialogs';

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
    on() {}, // resize/other events dialogs.ts's widgets may listen for - no-ops here
    removeListener() {},
    invalidateMouseIndex() {},
    // Element.focus() calls this.screen.setFocused(this) directly (not
    // optional-chained) - promptText's input.focus() and ConfirmModal's
    // own this._confirmButton.focus() both need it to exist. Mirrors the
    // real Screen.setFocused (screen.ts).
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
    // ConfirmModal is built with `trapFocus: true` (confirm-modal.ts), so
    // Element.show() calls this.screen.trapFocus(this) directly (not
    // optional-chained). A no-op (state-only) trap is safe here: display()
    // unconditionally refocuses its own confirm button right after show().
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

function lastChild(screen: any): any {
  return screen.children[screen.children.length - 1];
}

export async function dialogsModuleExportsPromptTextAndConfirm(): Promise<void> {
  assert.strictEqual(typeof promptText, 'function', 'dialogs.ts must export promptText');
  assert.strictEqual(typeof confirm, 'function', 'dialogs.ts must export confirm');
}

export async function promptTextSetsDialogOpenBeforeAnyAwaitAndClearsItOnCancel(): Promise<void> {
  const screen = makeFakeScreen();
  assert.strictEqual(screen.dialogOpen, undefined, 'precondition: no dialog open yet');

  const pending = promptText(screen, 'Name');
  // promptText must arm the guard SYNCHRONOUSLY - before the caller's next
  // statement runs, not after a microtask - or a keystroke arriving before
  // the first `await` boundary would slip through unguarded.
  assert.strictEqual(screen.dialogOpen, true, 'promptText must set screen.dialogOpen synchronously');

  const box = lastChild(screen);
  const input = box.children[0];
  input.cancel(); // the exact call Textbox's own ESC handling makes (textbox.ts's _onKeypress)

  const result = await pending;
  assert.strictEqual(result, null, 'ESC/cancel must resolve null');
  assert.strictEqual(screen.dialogOpen, false, 'cancelling must clear screen.dialogOpen');
}

export async function promptTextResolvesTheTrimmedSubmittedValue(): Promise<void> {
  const screen = makeFakeScreen();
  const pending = promptText(screen, 'Name', '');
  const input = lastChild(screen).children[0];

  for (const ch of '  spin  ') input.insertChar(ch);
  input.submit();

  const result = await pending;
  assert.strictEqual(result, 'spin', 'the resolved value must be trimmed');
  assert.strictEqual(screen.dialogOpen, false);
}

export async function promptTextRefusesAnEmptyOrWhitespaceOnlySubmit(): Promise<void> {
  const screen = makeFakeScreen();
  const pending = promptText(screen, 'Name', '');
  const input = lastChild(screen).children[0];

  input.submit(); // empty value
  assert.strictEqual(screen.dialogOpen, true, 'an empty submit must be refused - the dialog stays open');

  for (const ch of '   ') input.insertChar(ch);
  input.submit(); // whitespace-only value
  assert.strictEqual(screen.dialogOpen, true, 'a whitespace-only submit must be refused too');

  // Clean up: a real, non-blank submit still works after the refusals.
  input.insertChar('x');
  input.submit();
  const result = await pending;
  assert.ok(result && result.trim().length > 0);
}

export async function promptTextCarriesAnInitialValue(): Promise<void> {
  const screen = makeFakeScreen();
  const pending = promptText(screen, 'Rename', 'walk');
  const input = lastChild(screen).children[0];
  assert.strictEqual(input.getValue(), 'walk', 'the Textbox must start pre-filled with the initial value');

  input.submit();
  assert.strictEqual(await pending, 'walk');
}

export async function confirmSetsDialogOpenAndResolvesTrueOnTheConfirmButton(): Promise<void> {
  const screen = makeFakeScreen();
  const pending = confirm(screen, 'Delete this?');
  assert.strictEqual(screen.dialogOpen, true, 'confirm must set screen.dialogOpen synchronously');

  const modal = lastChild(screen);
  assert.strictEqual(screen.focusTrap, modal,
    'precondition: ConfirmModal (trapFocus:true) must have armed the real focus trap on show()');
  (modal as any)._confirmButton.emit('press');

  const result = await pending;
  assert.strictEqual(result, true);
  assert.strictEqual(screen.dialogOpen, false);
  // Fix round 1, minor 3: finish() must call modal.hide() BEFORE
  // modal.destroy() - Element.hide()'s focus-trap release
  // (`this.screen.releaseFocusTrap()`) early-returns once `this.destroyed`
  // is true, so calling destroy() first (the pre-fix code) left the trap
  // armed on a destroyed, unreachable widget forever - the DOOR's own
  // escape/keyboard handling would then depend entirely on screen.ts's
  // defensive self-heal (re-arming the first focusable element) rather
  // than the widget releasing what it acquired.
  assert.strictEqual(screen.focusTrap, null, 'confirming must release the focus trap ConfirmModal armed');
}

export async function confirmResolvesFalseOnTheCancelButton(): Promise<void> {
  const screen = makeFakeScreen();
  const pending = confirm(screen, 'Delete this?');
  const modal = lastChild(screen);
  (modal as any)._cancelButton.emit('press');

  const result = await pending;
  assert.strictEqual(result, false);
  assert.strictEqual(screen.dialogOpen, false);
}

/**
 * ESC cancels a confirm dialog too - ConfirmModal's own `key(['escape'], ...)`
 * (confirm-modal.ts) routes to the same cancel handler as the Cancel
 * button. Driven through the modal's real local key-event name
 * (`keypress <full>`, the event Element.key() actually listens on - see
 * element.ts's key()), not a private-method call.
 */
export async function confirmResolvesFalseOnEscapeWithoutTouchingAnything(): Promise<void> {
  const screen = makeFakeScreen();
  let sideEffect = false;
  const pending = confirm(screen, 'Delete this?').then((result) => {
    if (result) sideEffect = true; // what a real call site's tryOp would do on true
    return result;
  });

  const modal = lastChild(screen);
  modal.emit('keypress escape', '', { name: 'escape', full: 'escape' });

  const result = await pending;
  assert.strictEqual(result, false, 'ESC must resolve false, the same outcome as Cancel');
  assert.strictEqual(sideEffect, false, 'ESC must never trigger the confirmed side effect');
  assert.strictEqual(screen.dialogOpen, false);
}
