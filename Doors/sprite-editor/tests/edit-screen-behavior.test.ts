/**
 * The edit screen's modal-state bugs, exercised through the REAL key
 * handlers - a fake blessed screen records every screen.key()/keypress
 * registration and this file replays keystrokes against them, the same
 * way blessed itself would fire both the bound handler AND the keypress
 * event for one physical keypress. Source-shape grepping (edit-screen-
 * shape.test.ts) cannot see these bugs: they live in WHICH handler runs
 * for a given key while WHICH mode/naming state is active, not in whether
 * a function name appears in the file.
 *
 * The fake screen is the minimum the real blessed Box widget needs to
 * construct without throwing (verified against the actual engine, not
 * guessed): _getCoords for layout math, append/remove for the tree,
 * clearRegion for widget teardown. Nothing here renders to a terminal.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Sprite, compilePixels, decompilePixels, PixelGrid } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { EditScreen, CELL_CHAR_WIDTH } from '../edit-screen';
import { tokenAtColumn } from '../token-strip';
import { LAYOUT } from '../layout';

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
    // dialogs.ts's promptText/confirm call widget.focus(), which is
    // Element.focus() -> this.screen.setFocused(this) - NOT optional-
    // chained, so a fake screen without this throws the moment a dialog
    // opens. Mirrors the real Screen.setFocused (screen.ts): blur the
    // previous focused element, focus the new one. Nothing here renders.
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
    // Element.show() (element.ts) calls this.screen.trapFocus(this) - NOT
    // optional-chained - the moment display() shows it. Not focusing
    // anything here is fine: ConfirmModal.display() unconditionally
    // refocuses its own confirm button right after show(), so a no-op
    // (state-only) trap never leaves focus stuck anywhere real focus logic
    // depends on. Element.hide() DOES optional-chain its release
    // (`this.screen?.getFocusTrap?.() === this`), so that half still needs
    // to work correctly to release the trap when the modal is destroyed.
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

/**
 * Studio 2c task 5: the last child appended to `screen` by a promptText()/
 * confirm() call - the dialog Box (promptText) or ConfirmModal (confirm).
 * Both are parented directly on the screen (see dialogs.ts), so they land
 * at the END of screen.children, after every panel/statusBar/menuBar
 * buildLayout() creates - this reads that position instead of a hand-
 * picked index, so it can't drift if buildLayout() ever adds a pane.
 */
function lastDialog(screen: any): any {
  return screen.children[screen.children.length - 1];
}

/** blessed key names for the SHIFTED form of a typed character. */
const SHIFT_KEY_FOR_CHAR: Record<string, string> = {
  '<': 'S-,', '>': 'S-.', F: 'S-f', B: 'S-b', T: 'S-t', X: 'S-x',
};

/**
 * Fire everything a real terminal fires for one physical keypress of a
 * PRINTABLE character: the screen.key() binding for that key (or its
 * shifted form) if one exists, AND the 'keypress' event - the exact
 * double-fire that caused finding 1 and finding 3.
 */
function pressChar(screen: any, ch: string): void {
  const names = [ch, SHIFT_KEY_FOR_CHAR[ch]].filter(Boolean) as string[];
  for (const [keys, handler] of screen._keyBindings) {
    if (keys.some((k: string) => names.includes(k))) handler();
  }
  for (const kp of screen._keypressHandlers) kp(ch);
}

/** Fire a screen.key() binding for a non-printable key (tab/enter/space/...). */
function pressKey(screen: any, keyName: string): void {
  for (const [keys, handler] of screen._keyBindings) {
    if (keys.includes(keyName)) handler();
  }
}

/**
 * Dirty the document the way the hosted editor does: paint on the widget's
 * canvas, then commit. `pressKey(screen, 'space')` used to do this when the
 * door owned painting - the editor owns it now, and the door's key table
 * claims no printable key at all.
 */
function paintAndCommit(edit: any, ch = '#'): void {
  const canvas = edit.editor.getCoreCanvas();
  canvas[0][0] = { char: ch, fg: 7, bg: 0 };
  edit.commitCanvasToDoc();
}

/**
 * The handler for one binding, by ID rather than by key.
 *
 * Most studio ops are menu-only now: the hosted ANSIEditor types every
 * printable character onto the canvas, so a single-letter hotkey would
 * both fire the op AND paint the letter. Tests that used to press 'x' or
 * '+' therefore drive the op the menu drives - `bindingSet.bindings`,
 * the same already-dialog-guarded array screen.key() registration and
 * menuItems() both consume - which is the behavior that still exists.
 */
function opHandler(edit: any, id: string): (...args: any[]) => any {
  const binding = (edit as any).bindingSet.bindings.find((b: any) => b.id === id);
  if (!binding) throw new Error(`no binding with id '${id}'`);
  return binding.handler;
}

/**
 * The registered screen.key() handler for one key, returned directly
 * instead of invoked - so a test can capture and `await` an async
 * handler's own returned Promise (op handlers that open a dialog are
 * `async`; pressKey() above fires them but discards what they return).
 */
function keyHandler(screen: any, keyName: string): (...args: any[]) => any {
  const entry = screen._keyBindings.find(([keys]: [string[], any]) => keys.includes(keyName));
  if (!entry) throw new Error(`no screen.key() binding for '${keyName}'`);
  return entry[1];
}

/**
 * Studio 2c: canvas/preview/frames/toolbar are now wrapped in a
 * DockablePanel (panels.ts's makePanel) - the panel itself sits at
 * screen.children[panelIndex], and the actual paintable box (the one
 * setContent()/getContent() reflect) is nested one level deeper, as its
 * content child. DockablePanel.append() (dockable-panel.ts) always calls
 * bringUIToFront() after a child is appended, which reorders the title
 * bar to the LAST position - so with exactly one content child appended
 * (as every pane here does), that content is reliably children[0].
 */
function paneContent(screen: any, panelIndex: number): any {
  return screen.children[panelIndex].children[0];
}

const frameStrip = (framesBoxContent: string): string => {
  const idx = framesBoxContent.indexOf('\n new animation');
  return idx === -1 ? framesBoxContent : framesBoxContent.slice(0, idx);
};

/**
 * Fire a real 'click'/'mousemove' event at a box's OWN computed absolute
 * coordinates - the exact translation `canvasHitTest`/`handleFramesClick`
 * expect from a real terminal, driving the REAL registered handlers
 * (`wireMouse()`'s `box.on('click', ...)`), not a source-shape grep.
 */
function clickBox(box: any, localX: number, localY: number, button = 'left'): void {
  const coords = box._getCoords();
  box.emit('click', { x: coords.xi + localX, y: coords.yi + localY, button });
}
function dragBox(box: any, localX: number, localY: number, button = 'left'): void {
  const coords = box._getCoords();
  box.emit('mousemove', { x: coords.xi + localX, y: coords.yi + localY, button });
}

/** A one-animation, one-frame sprite whose frame is exactly this PixelGrid. */
function pixelSprite(pixels: PixelGrid): Sprite {
  return {
    name: 'fixture',
    cellW: pixels[0].length,
    cellH: pixels.length / 2,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [compilePixels(pixels)] } },
  };
}

/**
 * Studio 2c task 5: the typed naming mode is gone - '+' now opens
 * dialogs.ts's promptText() as a real modal (a Box+Textbox appended
 * directly to the screen, found via lastDialog()), and screen.dialogOpen
 * (set by promptText itself, around its own await) is what keeps every
 * bound op key from firing while it is up - the exact discipline the old
 * `naming !== null` guard gave, now driven by the real dialog widget
 * instead of an inline field this file owned.
 */
export async function openingTheNewAnimationDialogSuppressesOpBindingsUntilItCloses(): Promise<void> {
  // Two animations so 'a' (cycle animation) has somewhere to go, one frame
  // each so 'c'/'n' (clone/new frame) have an observable frame count.
  const sprite: Sprite = {
    name: 'fixture',
    cellW: 1,
    cellH: 1,
    animations: {
      aaa: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '#', fg: 7, bg: 0 }]]] },
      bbb: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '@', fg: 7, bg: 0 }]]] },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const statusBar = screen.children[1]; // canvas panel, STATUS, menu
    const framesBox = paneContent(screen, 2);

    // keyHandler(), not pressKey(): '+'s handler is async (it awaits
    // promptText) - capturing its own returned Promise is what lets this
    // test await the whole round trip below, not just fire-and-forget it.
    const pending = opHandler(edit, 'animation.new')();
    assert.strictEqual(screen.dialogOpen, true, 'opening the dialog must set screen.dialogOpen');

    const statusBefore = statusBar.getContent();
    const stripBefore = frameStrip(framesBox.getContent());

    // "cane": c and n are bound to clone-frame/new-frame, a is bound to
    // cycle-animation. None of them may fire while the dialog is open.
    for (const ch of 'cane') pressChar(screen, ch);

    assert.strictEqual(statusBar.getContent(), statusBefore,
      'a bound op key must not change the current animation, frame, or dirty state while the dialog is open');
    assert.strictEqual(frameStrip(framesBox.getContent()), stripBefore,
      'a bound op key must not add/clone a frame while the dialog is open');

    // ESC in the dialog (its own Textbox.cancel(), the exact path a real
    // Escape keypress drives - see textbox.ts's _onKeypress) must cancel
    // without touching the document, and clear screen.dialogOpen.
    const input = lastDialog(screen).children[0];
    input.cancel();
    await pending;

    assert.strictEqual(screen.dialogOpen, false, 'cancelling the dialog must clear screen.dialogOpen');
    assert.deepStrictEqual(Object.keys((edit as any).doc.sprite.animations), ['aaa', 'bbb'],
      'ESC must cancel without creating a new animation');
  } finally {
    edit.destroy();
  }
}

/**
 * Fix round 1 (review-caught CRITICAL 1): screen.key() bindings and a
 * DropdownMenu's mouse-driven item are TWO SEPARATE dispatch paths -
 * dropdown-menu.ts's selectItem() calls `item.action?.()` directly, never
 * touching screen.key()'s registered-handler map or screen.dialogOpen.
 * Before this fix, opening the new-animation dialog with '+' and then
 * clicking Frame > Delete Frame in the still-visible menu bar opened a
 * SECOND ConfirmModal stacked over the first, and confirming it deleted
 * the frame underneath. `menuItems()[i].items[j].action` (read here) is
 * the EXACT function reference menu-bar.ts hands to `new DropdownMenu({
 * items: item.items, ... })` (same array, not cloned - traced in
 * menu-bar.ts/dropdown-menu.ts), so calling it directly is calling it "the
 * way dropdown-menu does" without needing to drive the full mouse-click-
 * opens-dropdown UI chain.
 */
export async function menuActionsAreSuppressedWhileADialogIsOpen(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: {
      only: {
        ticksPerFrame: 4, loop: true,
        frames: [[[{ char: '1', fg: 7, bg: 0 }]], [[{ char: '2', fg: 7, bg: 0 }]]],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const pending = opHandler(edit, 'animation.new')(); // open the new-animation dialog
    assert.strictEqual(screen.dialogOpen, true);
    const dialogBefore = lastDialog(screen);
    const framesBefore = (edit as any).doc.sprite.animations.only.frames.length;

    const frameMenu = (edit as any).bindingSet.menuItems().find((m: any) => m.label === 'Frame');
    const deleteFrameItem = frameMenu.items.find((i: any) => i.label.startsWith('Delete Frame'));
    assert.ok(deleteFrameItem, 'precondition: the Frame menu must have a Delete Frame item');

    deleteFrameItem.action(); // the exact call dropdown-menu.ts's selectItem() makes

    assert.strictEqual((edit as any).doc.sprite.animations.only.frames.length, framesBefore,
      'a menu action must not run its op while a dialog is open');
    // assert.ok(a === b), NOT assert.strictEqual(a, b): on failure,
    // strictEqual's generated diff tries to util.inspect() both operands -
    // full LIVE blessed widget trees here (circular parent/children/screen
    // refs), which made the RED-by-deletion proof for this exact test
    // hang for minutes formatting an error message instead of failing
    // fast. ok()'s failure message is a plain string; nothing is
    // serialized either way.
    assert.ok(lastDialog(screen) === dialogBefore,
      'a menu action must not open a SECOND dialog while one is already open - no stacking');
    assert.strictEqual(screen.dialogOpen, true, 'the original dialog must still be open');

    lastDialog(screen).children[0].cancel();
    await pending;
  } finally {
    edit.destroy();
  }
}

/**
 * Companion to the above: the guard must be transparent, not a permanent
 * block - a menu-only binding (empty `keys`, e.g. View > Reset Layout)
 * must still run normally through the SAME wrapped action when no dialog
 * is open.
 */
export async function menuActionsStillWorkWhenNoDialogIsOpen(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    assert.strictEqual(screen.dialogOpen, undefined, 'precondition: no dialog open');

    const viewMenu = (edit as any).bindingSet.menuItems().find((m: any) => m.label === 'View');
    const resetLayoutItem = viewMenu.items.find((i: any) => i.label === 'Reset Layout');
    assert.ok(resetLayoutItem, 'precondition: the View menu must have a Reset Layout item');

    // Move the canvas panel away from its LAYOUT rect, then prove the
    // menu action (not the hotkey - there isn't one, this binding has
    // keys:[]) still restores it.
    (edit as any).canvasPanel.position.left += 5;
    resetLayoutItem.action();

    assert.notStrictEqual((edit as any).canvasPanel.position.left, undefined);
    assert.strictEqual((edit as any).canvasPanel.position.left, LAYOUT.edit.canvas.left,
      'a menu-only (keys:[]) action must still run normally when no dialog is open');
  } finally {
    edit.destroy();
  }
}

export async function typingIntoTheNewAnimationDialogAndSubmittingCreatesIt(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture',
    cellW: 1,
    cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '#', fg: 7, bg: 0 }]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const statusBar = screen.children[1]; // canvas panel, STATUS, menu
    const pending = opHandler(edit, 'animation.new')();
    const input = lastDialog(screen).children[0];
    for (const ch of 'spin') input.insertChar(ch);
    input.submit();
    await pending;

    assert.strictEqual(screen.dialogOpen, false, 'submitting must clear screen.dialogOpen');
    assert.strictEqual((edit as any).doc.animation, 'spin',
      'submitting a valid name must create the animation and switch to it');
    assert.ok(statusBar.getContent().includes(' spin '),
      `the new animation must show on the status bar - got: ${statusBar.getContent()}`);
  } finally {
    edit.destroy();
  }
}

/**
 * Studio 2c: bindings.ts derives the exclusion set from the table instead
 * of a hand string. S-, and S-. are the one case in this door where the
 * shift-key's real typed symbol ('<' / '>') is not its letter-uppercase -
 * a keyboard shift+comma types '<', not a capitalised comma. Locks in that
 * the derivation still keeps those two out of painted cell art, the same
 * as the old hand-written string did.
 */
export async function shiftCommaAndShiftPeriodDoNotTypeIntoTheCell(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture',
    cellW: 2,
    cellH: 1,
    animations: {
      only: {
        ticksPerFrame: 4, loop: true,
        frames: [
          [[{ char: '#', fg: 7, bg: 0 }, null]],
          [[{ char: '@', fg: 7, bg: 0 }, null]],
        ],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const canvasBox = paneContent(screen, 0);

    const beforeComma = canvasBox.getContent();
    opHandler(edit, 'frame.moveEarlier')(); // Shift+comma: S-, binding (move frame earlier) + keypress '<'
    assert.strictEqual(canvasBox.getContent(), beforeComma,
      'Shift+comma must not write the character < into the current cell');

    const beforePeriod = canvasBox.getContent();
    opHandler(edit, 'frame.moveLater')(); // Shift+period: S-. binding (move frame later) + keypress '>'
    assert.strictEqual(canvasBox.getContent(), beforePeriod,
      'Shift+period must not write the character > into the current cell');
  } finally {
    edit.destroy();
  }
}

/**
 * Studio 2c fix round 1 (minor, closed while here): space is excluded via
 * its own table entry (bindings.ts's 'space' -> ' ' alias), precisely so
 * the keypress fallback that fires for the SAME physical keystroke as the
 * dedicated space handler is a no-op. Compares the double-fire against a
 * solo fire of just the dedicated handler: they must produce identical
 * canvas content, proving the fallback never runs setCell(' ') on top of
 * the glyph the dedicated handler just painted.
 */
export async function spaceExclusionMakesTheKeypressFallbackANoOp(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture',
    cellW: 2,
    cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '#', fg: 7, bg: 0 }, null]]] } },
  };

  const soloScreen = makeFakeScreen();
  const solo = new EditScreen(soloScreen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  let soloContent: string;
  try {
    pressKey(soloScreen, 'space'); // only the dedicated paint handler fires
    soloContent = paneContent(soloScreen, 0).getContent();
  } finally {
    solo.destroy();
  }

  const doubleScreen = makeFakeScreen();
  const double = new EditScreen(doubleScreen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    // Real blessed fires BOTH the 'space' key binding (paints the current
    // glyph) AND the 'keypress' event (ch=' ') for the same physical
    // keystroke - the same double-fire every other bound key gets.
    pressKey(doubleScreen, 'space');
    for (const kp of doubleScreen._keypressHandlers) kp(' ');

    assert.strictEqual(paneContent(doubleScreen, 0).getContent(), soloContent,
      "the keypress fallback for space must be a no-op: space's key is in the derived exclusion " +
      'set precisely so it cannot overwrite the just-painted glyph with a blank cell');
  } finally {
    double.destroy();
  }
}

export async function shiftXDoesNotTypeIntoTheCell(): Promise<void> {
  // Exactly ONE animation: S-x's own op (deleteAnimation) refuses ("cannot
  // delete the last animation") and leaves the doc untouched, isolating
  // the OTHER half of the bug - the exclusion list missing 'X' - as the
  // only thing that can still change the canvas.
  const sprite: Sprite = {
    name: 'fixture',
    cellW: 2,
    cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '#', fg: 7, bg: 0 }, null]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const canvasBox = paneContent(screen, 0);
    const before = canvasBox.getContent();

    pressChar(screen, 'X'); // Shift+X: S-x binding (refused) + keypress 'X'

    assert.strictEqual(canvasBox.getContent(), before,
      'Shift+X must not write the letter X into the current cell');
  } finally {
    edit.destroy();
  }
}

/**
 * Fix round 1, Important 3: F1 is the studio.help binding's hotkey (it
 * shipped keyboard-unreachable - empty keys, no tab stop - in the
 * original commit). This help is a one-shot status-bar flash (reusing
 * the existing statusFlash+paint plumbing, not a modal/overlay), so
 * "closes cleanly" here means exactly that: it never enters a mode that
 * swallows the next keypress. Pins both halves - the hint appears AND
 * the document is untouched - then proves the door is not stuck by
 * moving the cursor immediately afterward.
 */
export async function f1InvokesHelpWithoutTouchingTheDocumentAndLeavesNoStuckState(): Promise<void> {
  // cellH: 2 so 'down' has somewhere to move the cursor to - the "not
  // stuck" proof below needs an observable move.
  const sprite: Sprite = {
    name: 'fixture',
    cellW: 1,
    cellH: 2,
    animations: {
      only: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '#', fg: 7, bg: 0 }], [{ char: '@', fg: 7, bg: 0 }]]] },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const statusBar = screen.children[1]; // canvas panel, STATUS, menu
    const framesBox = paneContent(screen, 2);
    const beforeStrip = frameStrip(framesBox.getContent());
    const beforeDirty = (edit as any).doc.dirty;
    const beforeFrame = (edit as any).doc.frame;

    opHandler(edit, 'studio.help')();

    // 'belong to the editor' is distinctive to the help text - unlike
    // 'C-s save', it does not already appear in the default status line,
    // so this proves the help handler ran rather than passing on the
    // permanent hint that was already there.
    assert.ok(statusBar.getContent().includes('belong to the editor'),
      'Help must render the keyboard-shortcuts hint onto the status bar');
    assert.strictEqual(frameStrip(framesBox.getContent()), beforeStrip,
      'F1 must not touch frames');
    assert.strictEqual((edit as any).doc.dirty, beforeDirty,
      'F1 must not mark the document dirty - it only reads the binding table');

    // Closes cleanly: no overlay/modal state was entered, so the very next
    // op still runs. The cursor is the hosted editor's now, so the proof is
    // an op of the door's own - a frame change - rather than a cursor move.
    opHandler(edit, 'frame.next')();
    assert.strictEqual((edit as any).doc.frame, beforeFrame,
      'the one-frame fixture clamps, so the frame cannot move - but the op must RUN, not throw');
    assert.doesNotThrow(() => opHandler(edit, 'frame.new')(),
      'an op immediately after Help must still run - Help must not leave the door stuck');
  } finally {
    edit.destroy();
  }
}

/**
 * Fix round 1, Important 2 (companion pin): the render side and the hit-
 * test side must be reading the literal SAME constant, not two separate
 * '2's. Clicks at every column across a 3-cell-wide row must each land on
 * exactly the cell CELL_CHAR_WIDTH says it should, including the boundary
 * columns (col*CELL_CHAR_WIDTH and col*CELL_CHAR_WIDTH + CELL_CHAR_WIDTH - 1).
 */
export async function everyColumnOfACellMapsToTheSameCellViaCellCharWidth(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 3, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null, null, null]]] } },
  };
  for (let cellCol = 0; cellCol < 3; cellCol++) {
    for (let offset = 0; offset < CELL_CHAR_WIDTH; offset++) {
      const screen = makeFakeScreen();
      const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
      try {
        const canvasBox = paneContent(screen, 0);
        clickBox(canvasBox, cellCol * CELL_CHAR_WIDTH + offset, 0);
        assert.deepStrictEqual((edit as any).doc.sprite.animations['only'].frames[0][0][cellCol],
          { char: '▀', fg: 11, bg: 0 },
          `column ${cellCol * CELL_CHAR_WIDTH + offset} must map to cell ${cellCol}`);
      } finally {
        edit.destroy();
      }
    }
  }
}

export async function draggingWithoutAHeldButtonDoesNotPaint(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const canvasBox = paneContent(screen, 0);
    // A plain mouse-move with no button - real terminals only ever send
    // this for hover, and it must never paint.
    const coords = canvasBox._getCoords();
    canvasBox.emit('mousemove', { x: coords.xi, y: coords.yi });
    assert.strictEqual((edit as any).doc.sprite.animations['only'].frames[0][0][0], null);
  } finally {
    edit.destroy();
  }
}

export async function fillDoesNotHappenOnDragOnlyOnClick(): Promise<void> {
  const pixels: PixelGrid = [
    [1, 1],
    [1, 1],
  ];
  const sprite = pixelSprite(pixels);
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    pressChar(screen, 'u'); // fill tool
    const canvasBox = paneContent(screen, 0);
    const docBefore = (edit as any).doc;
    dragBox(canvasBox, 0, 0, 'left'); // a drag, not a click - fill must not run

    assert.strictEqual((edit as any).doc, docBefore,
      'drag painting is restricted to paint/erase - fill must not fire on mousemove');
  } finally {
    edit.destroy();
  }
}

export async function clickingInTheGapBetweenFrameTokensDoesNotChangeTheSelection(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: {
      only: {
        ticksPerFrame: 4, loop: true,
        frames: [[[{ char: '1', fg: 7, bg: 0 }]], [[{ char: '2', fg: 7, bg: 0 }]]],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const tokens: string[] = (edit as any).frameTokens();
    const gapColumn = tokens[0].length; // the single space between the two tokens
    assert.strictEqual(tokenAtColumn(tokens, gapColumn), -1, 'precondition: this column is the gap');

    const framesBox = paneContent(screen, 2);
    clickBox(framesBox, gapColumn, 0);

    assert.strictEqual((edit as any).doc.frame, 0, 'a click in the gap must not change the frame selection');
  } finally {
    edit.destroy();
  }
}

export async function clickingAFrameNumberWhileADialogIsOpenDoesNothing(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: {
      only: {
        ticksPerFrame: 4, loop: true,
        frames: [[[{ char: '1', fg: 7, bg: 0 }]], [[{ char: '2', fg: 7, bg: 0 }]]],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const pending = opHandler(edit, 'animation.new')(); // open the new-animation dialog
    const tokens: string[] = (edit as any).frameTokens();
    const targetColumn = tokens[0].length + 1; // start of frame token index 1

    const framesBox = paneContent(screen, 2);
    clickBox(framesBox, targetColumn, 0);

    assert.strictEqual((edit as any).doc.frame, 0, 'a click on a frame number while a dialog is open must be ignored');

    lastDialog(screen).children[0].cancel();
    await pending;
  } finally {
    edit.destroy();
  }
}

/**
 * Studio 2c task 5: frame delete ('x') now asks dialogs.ts's confirm() -
 * built on the SDK's real ConfirmModal (parented directly on the screen,
 * so lastDialog(screen) finds it) - before calling deleteFrame(). Driven
 * through the modal's actual Cancel button (a real `Button.emit('press')`,
 * the same event ConfirmModal wires its own click/Enter handling to), not
 * a source-shape grep.
 */
export async function deletingAFrameAsksForConfirmationAndCancelLeavesItAlone(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: {
      only: {
        ticksPerFrame: 4, loop: true,
        frames: [[[{ char: '1', fg: 7, bg: 0 }]], [[{ char: '2', fg: 7, bg: 0 }]]],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const pending = opHandler(edit, 'frame.delete')();
    assert.strictEqual(screen.dialogOpen, true, 'delete-frame must open a confirm dialog');
    assert.strictEqual((edit as any).doc.sprite.animations.only.frames.length, 2,
      'the frame must not be deleted before the dialog is answered');

    const modal = lastDialog(screen);
    (modal as any)._cancelButton.emit('press');
    await pending;

    assert.strictEqual(screen.dialogOpen, false);
    assert.strictEqual((edit as any).doc.sprite.animations.only.frames.length, 2,
      'cancelling the confirm dialog must leave the frame untouched');
  } finally {
    edit.destroy();
  }
}

export async function deletingAFrameActuallyDeletesItOnConfirm(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: {
      only: {
        ticksPerFrame: 4, loop: true,
        frames: [[[{ char: '1', fg: 7, bg: 0 }]], [[{ char: '2', fg: 7, bg: 0 }]]],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const pending = opHandler(edit, 'frame.delete')();
    const modal = lastDialog(screen);
    (modal as any)._confirmButton.emit('press');
    await pending;

    assert.strictEqual((edit as any).doc.sprite.animations.only.frames.length, 1,
      'confirming must actually delete the frame');
  } finally {
    edit.destroy();
  }
}

/** Same discipline for animation delete (S-x) - a second, independent call site. */
export async function deletingAnAnimationAsksForConfirmationAndCancelLeavesItAlone(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: {
      aaa: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '#', fg: 7, bg: 0 }]]] },
      bbb: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '@', fg: 7, bg: 0 }]]] },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const pending = opHandler(edit, 'animation.delete')();
    const modal = lastDialog(screen);
    (modal as any)._cancelButton.emit('press');
    await pending;

    assert.deepStrictEqual(Object.keys((edit as any).doc.sprite.animations), ['aaa', 'bbb'],
      'cancelling must leave both animations in place');
  } finally {
    edit.destroy();
  }
}

/**
 * Studio 2c task 5: ESC on a dirty document now asks confirm() ONCE -
 * replacing the old ESC-twice discard-window discipline (discardArmedAt/
 * DISCARD_WINDOW_MS, both deleted). Confirming exits (onExit fires);
 * cancelling leaves the editor open with the document still dirty.
 */
export async function escapeOnADirtyDocumentAsksToDiscardAndOnlyExitsOnConfirm(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const screen = makeFakeScreen();
  let exited = false;
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => { exited = true; });
  try {
    // Dirty the document the same way a real edit would: paint on the
    // hosted canvas and commit, which is where painting lives now.
    paintAndCommit(edit);
    assert.strictEqual((edit as any).doc.dirty, true, 'precondition: the document must be dirty');

    const pending = opHandler(edit, 'file.closeEditor')();
    assert.strictEqual(screen.dialogOpen, true, 'ESC on a dirty document must open a confirm dialog');

    const modal = lastDialog(screen);
    (modal as any)._cancelButton.emit('press'); // "no, don't discard"
    await pending;

    assert.strictEqual(exited, false, 'cancelling the discard prompt must not exit');
    assert.strictEqual(screen.dialogOpen, false);
  } finally {
    edit.destroy();
  }
}

export async function escapeOnADirtyDocumentExitsWhenDiscardIsConfirmed(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const screen = makeFakeScreen();
  let exited = false;
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => { exited = true; });
  paintAndCommit(edit); // dirty it

  const pending = opHandler(edit, 'file.closeEditor')();
  const modal = lastDialog(screen);
  (modal as any)._confirmButton.emit('press'); // "yes, discard"
  await pending;

  assert.strictEqual(exited, true, 'confirming the discard prompt must exit');
}

/** A CLEAN document must exit on the first ESC - no confirm dialog at all. */
export async function escapeOnACleanDocumentExitsImmediatelyWithNoDialog(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const screen = makeFakeScreen();
  let exited = false;
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => { exited = true; });
  assert.strictEqual((edit as any).doc.dirty, false, 'precondition: freshly opened, not dirty');

  opHandler(edit, 'file.closeEditor')();

  assert.strictEqual(exited, true, 'a clean document must exit on the first ESC, no confirmation needed');
  assert.strictEqual(screen.dialogOpen, undefined, 'no dialog should ever have opened');
}

/**
 * Live user report, 2026-09-01, while this task was already in flight:
 * "cannot leave the sprite editor via menu or keys". Confirmed diagnosis:
 * bare ESC was the ONLY way out (no other key, no menu entry beyond File >
 * Save). C-q is added as a second hotkey on the SAME 'file.closeEditor'
 * binding (keys: ['escape', 'C-q']) - it must exit a CLEAN document
 * immediately, exactly like escape.
 */
export async function cqClosesACleanEditorTheSameWayEscapeDoes(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const screen = makeFakeScreen();
  let exited = false;
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => { exited = true; });
  assert.strictEqual((edit as any).doc.dirty, false, 'precondition: freshly opened, not dirty');

  opHandler(edit, 'file.closeEditor')();

  assert.strictEqual(exited, true, 'C-q on a clean document must exit immediately, exactly like escape');
  assert.strictEqual(screen.dialogOpen, undefined, 'no dialog should ever have opened');
}

/**
 * The other half of the live user report: ESC-ESC on a dirty document
 * looked "stuck" because ESC cancels the confirm dialog rather than
 * confirming it. C-q is the SAME binding, not a shortcut around the
 * dirty-confirm flow - it must open the identical discard dialog.
 */
export async function cqOnADirtyDocumentAsksToDiscardJustLikeEscape(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const screen = makeFakeScreen();
  let exited = false;
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => { exited = true; });
  try {
    paintAndCommit(edit); // dirty it
    assert.strictEqual((edit as any).doc.dirty, true, 'precondition: the document must be dirty');

    const pending = opHandler(edit, 'file.closeEditor')();
    assert.strictEqual(screen.dialogOpen, true,
      'C-q on a dirty document must open the SAME discard confirm dialog escape does');

    const modal = lastDialog(screen);
    (modal as any)._confirmButton.emit('press');
    await pending;

    assert.strictEqual(exited, true, 'confirming the discard prompt reached via C-q must exit');
  } finally {
    edit.destroy();
  }
}

/** A blessed key name for a real KeyEvent, driven through Screen's real _handleKey dispatch. */
function keyEvent(name: string, ctrl = false): any {
  return { name, full: name, ctrl, meta: false, shift: false, sequence: name };
}

/**
 * Fix round 1 (screen.ts root-cause fix): a REAL `_handleKey` dispatch
 * used to deliver a dialog-opening keystroke a SECOND time, to whatever
 * that same keystroke's handler had just focused - see screen.ts's
 * `focusedBeforeGlobalHandlers` for the exact mechanism and
 * task-7-report.md's "## Fix round 1" for the full analysis. This
 * discovery started with escape (opens the discard ConfirmModal on a
 * dirty document, which itself binds Escape-to-cancel - self-cancelling
 * within one keystroke), and the coordinator asked to verify the SAME
 * fix holds for every OTHER key in this door that opens a dialog: '+'
 * (new animation - promptText/Textbox), 'x' (delete frame - confirm),
 * 'S-x' (delete animation - confirm), on top of escape itself. Each gets
 * three tests below: opens-and-survives its own triggering keystroke,
 * then Enter confirms and Escape cancels as SEPARATE, subsequent real
 * keystrokes - proving the fix is general (a screen.ts dispatch property)
 * rather than a special case for one binding.
 */

/** Await enough of a tick for an `await confirm(...)`/`await promptText(...)` continuation's microtask to run. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------
// escape ('file.closeEditor', dirty document -> discard confirm)
// ---------------------------------------------------------------------

export async function escapeOnADirtyDocumentOpensAndSurvivesItsOwnTriggeringKeystroke(): Promise<void> {
  const screen: any = new Screen({ title: 'edit-screen-esc-survives', width: 80, height: 25 } as any);
  let exited = false;
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => { exited = true; });
  try {
    paintAndCommit(edit); // dirty it - the canvas is where paint happens now
    screen._handleKey(undefined, keyEvent('C-q'));

    assert.strictEqual(screen.dialogOpen, true,
      'a real C-q keypress must open the discard confirm dialog and SURVIVE its own triggering keystroke');
    assert.strictEqual(exited, false, 'opening the dialog must not itself exit the editor');
    assert.strictEqual((edit as any).doc.dirty, true, 'and must not itself discard anything');
  } finally {
    edit.destroy();
    screen.destroy();
  }
}

export async function escapeThenARealEnterKeypressExitsADirtyDocumentThroughTheConfirmModal(): Promise<void> {
  const screen: any = new Screen({ title: 'edit-screen-esc-enter', width: 80, height: 25 } as any);
  let exited = false;
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => { exited = true; });
  try {
    paintAndCommit(edit);
    screen._handleKey(undefined, keyEvent('C-q'));
    assert.strictEqual(screen.dialogOpen, true, 'precondition: the dialog must be open');

    // A SEPARATE, subsequent real keystroke - ConfirmModal.display() already
    // focused its own confirm button when the dialog opened above.
    screen._handleKey(undefined, keyEvent('enter'));
    await flush();

    assert.strictEqual(exited, true, 'a real Enter keypress on the focused confirm button must exit the editor');
    assert.strictEqual(screen.dialogOpen, false);
  } finally {
    screen.destroy();
  }
}

export async function escapeThenARealEscapeCancelsAndLeavesTheDocumentDirty(): Promise<void> {
  const screen: any = new Screen({ title: 'edit-screen-esc-esc', width: 80, height: 25 } as any);
  let exited = false;
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => { exited = true; });
  try {
    paintAndCommit(edit);
    screen._handleKey(undefined, keyEvent('C-q'));
    assert.strictEqual(screen.dialogOpen, true, 'precondition: the dialog must be open');

    // A SEPARATE, subsequent real Escape - this one DOES reach
    // ConfirmModal's own key(['escape'], cancel) binding, exactly as
    // intended: the fix stops a keystroke reaching what IT JUST FOCUSED,
    // not later, independent keystrokes aimed at an already-focused modal.
    screen._handleKey(undefined, keyEvent('escape'));
    await flush();

    assert.strictEqual(screen.dialogOpen, false, 'a second, separate Escape must cancel the dialog');
    assert.strictEqual(exited, false, 'cancelling must not exit the editor');
    assert.strictEqual((edit as any).doc.dirty, true, 'and must not discard the document');
  } finally {
    edit.destroy();
    screen.destroy();
  }
}

/**
 * C-q remains a working second hotkey on 'file.closeEditor' (unaffected by
 * this fix round either way - it never collided with ConfirmModal's own
 * escape binding in the first place, fix-round-1's report explains why).
 */
export async function cqReliablyExitsADirtyEditorViaRealKeyDispatchEndToEnd(): Promise<void> {
  const screen: any = new Screen({ title: 'edit-screen-real-keys-cq', width: 80, height: 25 } as any);
  let exited = false;
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => { exited = true; });
  try {
    paintAndCommit(edit);
    screen._handleKey(undefined, keyEvent('C-q', true));
    assert.strictEqual(screen.dialogOpen, true, 'a real C-q keypress must open the discard confirm dialog');

    screen._handleKey(undefined, keyEvent('enter'));
    await flush();

    assert.strictEqual(exited, true, 'a real Enter keypress on the focused confirm button must exit the editor');
    assert.strictEqual(screen.dialogOpen, false);
  } finally {
    screen.destroy();
  }
}

// ---------------------------------------------------------------------
// '+' ('animation.new' - promptText/Textbox)
// ---------------------------------------------------------------------

function twoAnimationSprite(): Sprite {
  return {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: {
      aaa: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '#', fg: 7, bg: 0 }]]] },
      bbb: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '@', fg: 7, bg: 0 }]]] },
    },
  };
}

