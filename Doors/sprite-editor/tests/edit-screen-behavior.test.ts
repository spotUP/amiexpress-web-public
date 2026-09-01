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
    const statusBar = screen.children[4];
    const framesBox = paneContent(screen, 2);

    // keyHandler(), not pressKey(): '+'s handler is async (it awaits
    // promptText) - capturing its own returned Promise is what lets this
    // test await the whole round trip below, not just fire-and-forget it.
    const pending = keyHandler(screen, '+')();
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
    const pending = keyHandler(screen, '+')(); // open the new-animation dialog
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
    const statusBar = screen.children[4];
    const pending = keyHandler(screen, '+')();
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

export async function selectingBackToANonPixelFrameDropsToCellModeAndSpaceNeverThrows(): Promise<void> {
  // Reviewer's exact repro: frame 0 is plain cell art (not pixel-
  // editable), frame 1 is pure half-block (pixel-editable).
  const sprite: Sprite = {
    name: 'fixture',
    cellW: 1,
    cellH: 1,
    animations: {
      only: {
        ticksPerFrame: 4,
        loop: true,
        frames: [
          [[{ char: 'A', fg: 7, bg: 0 }]],
          [[{ char: '█', fg: 5, bg: 5 }]],
        ],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const canvasBox = paneContent(screen, 0);

    pressChar(screen, '.'); // frame 1: pixel-editable
    pressKey(screen, 'tab'); // -> pixel mode
    assert.ok(canvasBox.getContent().includes('PIXEL'), 'tab must enter pixel mode on a half-block frame');

    pressChar(screen, ','); // back to frame 0: NOT pixel-editable
    assert.ok(canvasBox.getContent().includes('CELL'),
      'selecting a non-half-block frame must drop back to cell mode');
    assert.ok(!canvasBox.getContent().includes('PIXEL'));

    assert.doesNotThrow(() => pressKey(screen, 'space'),
      'space must never throw out of a key handler, even on a stale pixel-mode selection');
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
    pressChar(screen, '<'); // Shift+comma: S-, binding (move frame earlier) + keypress '<'
    assert.strictEqual(canvasBox.getContent(), beforeComma,
      'Shift+comma must not write the character < into the current cell');

    const beforePeriod = canvasBox.getContent();
    pressChar(screen, '>'); // Shift+period: S-. binding (move frame later) + keypress '>'
    assert.strictEqual(canvasBox.getContent(), beforePeriod,
      'Shift+period must not write the character > into the current cell');
  } finally {
    edit.destroy();
  }
}

/**
 * Studio 2c fix round 1: the controller signed off dropping the old hand
 * string's orphaned 'S' from the exclusion set (no binding has ever
 * produced it - there is no S-s binding anywhere in this door), which
 * widens what cell mode accepts: a bare 'S' is now an ordinary glyph like
 * any other letter, where the old hand-written string silently swallowed
 * it for no discoverable reason. Pins BOTH halves so a future change
 * can't silently regress the sign-off or silently reintroduce a collision:
 * (1) the derived set must not contain 'S', and (2) typing it must
 * actually reach setCell.
 */
export async function typingCapitalSPaintsAGlyphIntentionallyNotExcluded(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture',
    cellW: 2,
    cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '#', fg: 7, bg: 0 }, null]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    // No binding in the table may derive the glyph 'S' - if one ever does
    // (e.g. a future S-s binding), this assertion forces whoever adds it to
    // decide about the collision deliberately, rather than have the
    // exclusion set silently swallow 'S' again.
    assert.ok(!(edit as any).bindingSet.excludedGlyphKeys.has('S'),
      "no binding may derive the glyph 'S' - the controller signed off on this being unexcluded");

    const canvasBox = paneContent(screen, 0);
    const before = canvasBox.getContent();

    pressChar(screen, 'S'); // no S-s binding exists, so only the keypress fires

    assert.notStrictEqual(canvasBox.getContent(), before,
      "typing 'S' in cell mode must reach setCell as an ordinary glyph, not be silently swallowed");
    assert.ok(canvasBox.getContent().includes('S'),
      "the painted cell must contain the typed glyph 'S'");
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
    const statusBar = screen.children[4];
    const framesBox = paneContent(screen, 2);
    const beforeStrip = frameStrip(framesBox.getContent());
    const beforeDirty = (edit as any).doc.dirty;
    const beforeCursorRow = (edit as any).cursorRow;

    pressKey(screen, 'f1');

    // 'S-x animation' is distinctive to the F1 help text - unlike 'save'
    // or 'TAB mode', it does not already appear in the default status
    // line, so this actually proves F1's own handler ran rather than
    // passing on the permanent hint that was already there.
    assert.ok(statusBar.getContent().includes('S-x animation'),
      'F1 must render the keyboard-shortcuts hint onto the status bar');
    assert.strictEqual(frameStrip(framesBox.getContent()), beforeStrip,
      'F1 must not touch frames');
    assert.strictEqual((edit as any).doc.dirty, beforeDirty,
      'F1 must not mark the document dirty - it only reads the binding table');

    // Closes cleanly: no overlay/modal state was entered, so the very
    // next key still reaches its ordinary handler.
    pressKey(screen, 'down');
    assert.strictEqual((edit as any).cursorRow, beforeCursorRow + 1,
      'a normal key immediately after F1 must still move the cursor - F1 must not leave the door stuck');
  } finally {
    edit.destroy();
  }
}

/**
 * Studio 2c task 4: mouse painting. The default tool is 'paint' and the
 * default fg/glyph/bg (11, GLYPHS[0]='▀', 0) are the same ones the
 * spacebar paints with - a click is a second input surface for the exact
 * same op, not a parallel painting path.
 */
export async function clickingTheCanvasPaintsTheClickedCellWithTheActiveTool(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 3, cellH: 2,
    animations: {
      only: {
        ticksPerFrame: 4, loop: true,
        frames: [[[null, null, null], [null, null, null]]],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const canvasBox = paneContent(screen, 0);
    clickBox(canvasBox, 2, 1); // 2 chars/cell: local column 2 is cell column 1; row 1 is cell row 1
    assert.deepStrictEqual((edit as any).doc.sprite.animations['only'].frames[0][1][1],
      { char: '▀', fg: 11, bg: 0 },
      'the clicked cell must be painted with the default glyph/fg/bg, exactly like pressing space would');
    assert.strictEqual((edit as any).doc.sprite.animations['only'].frames[0][0][0], null,
      'only the clicked cell may change');
  } finally {
    edit.destroy();
  }
}

/**
 * Studio 2c task 4: paintCanvas() used to join rows with '\n ' (a leading
 * SPACE, not just a newline) - `['a','b'].join('\n ')` is `'a\n b'`, so
 * every row except the first rendered one column further right than row
 * 0. Invisible to any keyboard-only test (the cursor overlay is picked by
 * array index, never by screen column), but fatal to a click: this pins
 * that the column a click lands on for row 1+ is the SAME column the
 * rendered text actually shows there, not one off.
 */
export async function canvasClickColumnMappingMatchesTheRenderedGridOnEveryRow(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 2, cellH: 2,
    animations: {
      only: {
        ticksPerFrame: 4, loop: true,
        frames: [[
          [{ char: 'A', fg: 7, bg: 0 }, { char: 'B', fg: 7, bg: 0 }],
          [{ char: 'C', fg: 7, bg: 0 }, { char: 'D', fg: 7, bg: 0 }],
        ]],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const canvasBox = paneContent(screen, 0);
    const row1 = canvasBox.getContent().split('\n')[1].replace(/\{[^}]*\}/g, '');
    // Fix round 1, Important 2: built from the SAME exported
    // CELL_CHAR_WIDTH canvasHitTest divides by, not a hand-typed '4' -
    // if paintCanvas's `char.repeat(CELL_CHAR_WIDTH)` and
    // canvasHitTest's `Math.floor(localX / CELL_CHAR_WIDTH)` ever
    // desync (one gets edited, the other doesn't), this expectation and
    // the click below stop lining up and the test fails.
    assert.strictEqual(row1.slice(0, 2 * CELL_CHAR_WIDTH), 'C'.repeat(CELL_CHAR_WIDTH) + 'D'.repeat(CELL_CHAR_WIDTH),
      'row 1 must render flush-left, CELL_CHAR_WIDTH characters per cell, exactly like row 0 - no phantom left margin');

    clickBox(canvasBox, CELL_CHAR_WIDTH, 1); // local column CELL_CHAR_WIDTH, row 1 - the column 'D' actually renders at
    assert.deepStrictEqual((edit as any).doc.sprite.animations['only'].frames[0][1][1],
      { char: '▀', fg: 11, bg: 0 },
      'the click must repaint cell (1,1) - the SAME cell the rendered text shows at that column');
    assert.deepStrictEqual((edit as any).doc.sprite.animations['only'].frames[0][1][0],
      { char: 'C', fg: 7, bg: 0 },
      'cell (1,0) must stay untouched - a phantom left margin on row 1 would have made THIS the one hit instead');
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

export async function draggingWithThePaintToolPaintsEveryCellItCrosses(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 3, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null, null, null]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const canvasBox = paneContent(screen, 0);
    clickBox(canvasBox, 0, 0);              // cell 0: an ordinary click
    dragBox(canvasBox, 4, 0, 'left');       // cell 2: a mousemove WITH the button held

    const frame = (edit as any).doc.sprite.animations['only'].frames[0][0];
    assert.notStrictEqual(frame[0], null, 'the clicked cell must be painted');
    assert.notStrictEqual(frame[2], null, 'the dragged-over cell must be painted too');
    assert.strictEqual(frame[1], null, 'the cell the drag jumped over (never visited) stays untouched');
  } finally {
    edit.destroy();
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

export async function pressingToolHotkeysSwitchesTheActiveTool(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    assert.strictEqual((edit as any).tool, 'paint', 'paint is the default tool');
    pressChar(screen, 'e');
    assert.strictEqual((edit as any).tool, 'erase');
    pressChar(screen, 'k');
    assert.strictEqual((edit as any).tool, 'pick');
    pressChar(screen, 'u');
    assert.strictEqual((edit as any).tool, 'fill');
    pressChar(screen, 'p');
    assert.strictEqual((edit as any).tool, 'paint');
  } finally {
    edit.destroy();
  }
}

/**
 * The four tool hotkeys are single printable chars, so like every other
 * one (g/f/b/n/c/x/a/t/l/s) they must be excluded from ordinary cell
 * typing AND still only reach the tool switch while a dialog is open -
 * the same screen.dialogOpen guard opKey() already gives every op
 * binding.
 */
export async function toolHotkeysAreExcludedFromCellTypingAndGuardedWhileADialogIsOpen(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: {
      only: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '#', fg: 7, bg: 0 }]]] },
      other: { ticksPerFrame: 4, loop: true, frames: [[[{ char: '@', fg: 7, bg: 0 }]]] },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    for (const ch of ['p', 'e', 'k', 'u']) {
      assert.ok((edit as any).bindingSet.excludedGlyphKeys.has(ch),
        `'${ch}' must be excluded from cell typing - it is a bound tool hotkey`);
    }

    const pending = keyHandler(screen, '+')(); // open the new-animation dialog
    const toolBefore = (edit as any).tool;
    for (const ch of 'pku') pressChar(screen, ch);
    assert.strictEqual((edit as any).tool, toolBefore, 'typing while the dialog is open must not switch tools');

    const input = lastDialog(screen).children[0];
    assert.strictEqual(input.getValue(), '',
      'pressChar() drives the OUTER screen bindings, not the dialog\'s own Textbox - ' +
      'the tool hotkeys must be swallowed by dialogOpen, not land in the dialog either');
    input.cancel();
    await pending;
  } finally {
    edit.destroy();
  }
}

export async function pickToolReadsTheClickedColourWithoutChangingTheDocument(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[{ char: 'Z', fg: 5, bg: 2 }]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    pressChar(screen, 'k'); // pick tool
    const docBefore = (edit as any).doc;
    const canvasBox = paneContent(screen, 0);
    clickBox(canvasBox, 0, 0);

    assert.strictEqual((edit as any).fg, 5, 'pick must read the clicked cell\'s fg into the active colour');
    assert.strictEqual((edit as any).doc, docBefore, 'pick must never touch the document - same EditDoc reference');
  } finally {
    edit.destroy();
  }
}

export async function fillToolFloodFillsTheConnectedPixelRegionOnAHalfBlockFrame(): Promise<void> {
  // A 2x4 pixel grid: colour 1 on the left half, colour 2 on the right -
  // filling from the left half must repaint only that half.
  const pixels: PixelGrid = [
    [1, 1, 2, 2],
    [1, 1, 2, 2],
  ];
  const sprite = pixelSprite(pixels);
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    pressChar(screen, 'u'); // fill tool
    const canvasBox = paneContent(screen, 0);
    clickBox(canvasBox, 0, 0); // cell (row 0, col 0) - within the 1-coloured half

    const frame = (edit as any).doc.sprite.animations[(edit as any).doc.animation].frames[0];
    assert.deepStrictEqual(decompilePixels(frame), [
      [11, 11, 2, 2],
      [11, 11, 2, 2],
    ], 'fill must use the active colour (default fg 11) and stop at the 2-coloured half');
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

export async function clickingAFrameNumberSelectsThatFrameThroughSelectFrame(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 1, cellH: 1,
    animations: {
      only: {
        ticksPerFrame: 4, loop: true,
        frames: [
          [[{ char: '1', fg: 7, bg: 0 }]],
          [[{ char: '2', fg: 7, bg: 0 }]],
          [[{ char: '3', fg: 7, bg: 0 }]],
        ],
      },
    },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    assert.strictEqual((edit as any).doc.frame, 0, 'frame 0 starts selected');

    // The column for frame index 2, computed via the SAME plain tokens
    // paintFrames()/handleFramesClick() both read from frameTokens() -
    // not a hand-guessed offset.
    const tokens: string[] = (edit as any).frameTokens();
    const targetColumn = tokens.slice(0, 2).reduce((sum, t) => sum + t.length + 1, 0);
    assert.strictEqual(tokenAtColumn(tokens, targetColumn), 2,
      'precondition: this column must land on frame token index 2');

    const framesBox = paneContent(screen, 2);
    clickBox(framesBox, targetColumn, 0);

    assert.strictEqual((edit as any).doc.frame, 2, 'clicking frame 3\'s token must select it');
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
    const pending = keyHandler(screen, '+')(); // open the new-animation dialog
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
 * Fix round 1, Important 1: every keyboard op is dialog-guarded (opKey())
 * and the sibling handleFramesClick already had this check - canvas mouse
 * painting was the one path that bypassed it, so pressing '+' and then
 * clicking the canvas painted the live document mid dialog.
 */
export async function clickingTheCanvasWhileADialogIsOpenDoesNothing(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 2, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null, null]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const pending = keyHandler(screen, '+')(); // open the new-animation dialog
    const canvasBox = paneContent(screen, 0);
    clickBox(canvasBox, 0, 0);

    assert.strictEqual((edit as any).doc.sprite.animations['only'].frames[0][0][0], null,
      'a click on the canvas while a dialog is open must not paint the document');

    lastDialog(screen).children[0].cancel();
    await pending;
  } finally {
    edit.destroy();
  }
}

export async function draggingOnTheCanvasWhileADialogIsOpenDoesNothing(): Promise<void> {
  const sprite: Sprite = {
    name: 'fixture', cellW: 2, cellH: 1,
    animations: { only: { ticksPerFrame: 4, loop: true, frames: [[[null, null]]] } },
  };
  const screen = makeFakeScreen();
  const edit = new EditScreen(screen, 'fixture-door', 'fixture.sprite.json', sprite, () => {});
  try {
    const pending = keyHandler(screen, '+')(); // open the new-animation dialog
    const canvasBox = paneContent(screen, 0);
    dragBox(canvasBox, 0, 0, 'left');

    assert.strictEqual((edit as any).doc.sprite.animations['only'].frames[0][0][0], null,
      'a drag over the canvas while a dialog is open must not paint the document');

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
    const pending = keyHandler(screen, 'x')();
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
    const pending = keyHandler(screen, 'x')();
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
    const pending = keyHandler(screen, 'S-x')();
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
    // Dirty the document the same way a real edit would: paint the one cell.
    pressKey(screen, 'space');
    assert.strictEqual((edit as any).doc.dirty, true, 'precondition: the document must be dirty');

    const pending = keyHandler(screen, 'escape')();
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
  pressKey(screen, 'space'); // dirty it

  const pending = keyHandler(screen, 'escape')();
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

  pressKey(screen, 'escape');

  assert.strictEqual(exited, true, 'a clean document must exit on the first ESC, no confirmation needed');
  assert.strictEqual(screen.dialogOpen, undefined, 'no dialog should ever have opened');
}
