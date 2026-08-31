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
