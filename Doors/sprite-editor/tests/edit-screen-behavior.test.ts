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
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { EditScreen } from '../edit-screen';

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
  };
  return screen;
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

const frameStrip = (framesBoxContent: string): string => {
  const idx = framesBoxContent.indexOf('\n new animation');
  return idx === -1 ? framesBoxContent : framesBoxContent.slice(0, idx);
};

export async function namingSwallowsAnimationNameLettersNotBoundOps(): Promise<void> {
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
    const framesBox = screen.children[2];

    pressKey(screen, '+'); // start naming a new animation
    const statusBefore = statusBar.getContent();
    const stripBefore = frameStrip(framesBox.getContent());

    // "cane": c and n are bound to clone-frame/new-frame, a is bound to
    // cycle-animation. Every one of them must land ONLY in the typed name.
    for (const ch of 'cane') pressChar(screen, ch);

    assert.strictEqual(statusBar.getContent(), statusBefore,
      'typing a name must not change the current animation, frame, or dirty state');
    assert.strictEqual(frameStrip(framesBox.getContent()), stripBefore,
      'typing a name must not add/clone a frame');

    // The guard must not have swallowed the TYPED characters themselves.
    assert.ok(framesBox.getContent().includes('new animation: {lightyellow-fg}cane{/}'),
      'the typed letters must still reach the name');
  } finally {
    edit.destroy();
  }
}

export async function namingStillSubmitsAValidAnimationName(): Promise<void> {
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
    pressKey(screen, '+');
    for (const ch of 'spin') pressChar(screen, ch);
    pressKey(screen, 'enter');
    assert.ok(statusBar.getContent().includes(' spin '),
      `the guard must not block a legitimate submit - got: ${statusBar.getContent()}`);
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
    const canvasBox = screen.children[0];

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
    const canvasBox = screen.children[0];

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

    const canvasBox = screen.children[0];
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
    soloContent = soloScreen.children[0].getContent();
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

    assert.strictEqual(doubleScreen.children[0].getContent(), soloContent,
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
    const canvasBox = screen.children[0];
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
    const framesBox = screen.children[2];
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
