/**
 * The browser's selection state, pure.
 *
 * The UI binds keys to these functions and paints from the result. Every
 * transition is assertable here, so the door's tests do not need a
 * terminal - the lesson every arcade door's suite already applies.
 */

import assert from 'assert';
import {
  initialState, moveSelection, cyclePane, selection,
} from '../browser-model';

export async function theRealDoorsPopulateTheFirstPane(): Promise<void> {
  const s = initialState();
  assert.ok(s.doors.includes('pengo'));
  assert.strictEqual(s.pane, 'doors');
  // A door is selected from the start, and its dependent panes are filled.
  assert.ok(s.sprites.length > 0, 'the selected door has its sprites listed');
  assert.ok(s.animations.length > 0, 'and the selected sprite its animations');
}

export async function movingClampsAndRefillsDependentPanes(): Promise<void> {
  let s = initialState();
  s = moveSelection(s, -1);
  assert.strictEqual(s.doorIndex, 0, 'no wrap above the top');
  const before = selection(s);
  s = moveSelection(s, s.doors.length + 50);
  assert.strictEqual(s.doorIndex, s.doors.length - 1, 'clamped at the end');
  const after = selection(s);
  if (before.door !== after.door) {
    assert.ok(s.spriteIndex === 0 && s.animationIndex === 0,
      'a new door resets the dependent selections');
  }
}

export async function panesCycleBothWays(): Promise<void> {
  let s = initialState();
  s = cyclePane(s, 1);
  assert.strictEqual(s.pane, 'sprites');
  s = cyclePane(s, 1);
  assert.strictEqual(s.pane, 'animations');
  s = cyclePane(s, 1);
  assert.strictEqual(s.pane, 'doors', 'wraps forward');
  s = cyclePane(s, -1);
  assert.strictEqual(s.pane, 'animations', 'wraps backward');
}

export async function selectionNamesWhatTheUiShouldLoad(): Promise<void> {
  const s = initialState();
  const sel = selection(s);
  assert.strictEqual(sel.door, s.doors[0]);
  assert.ok(sel.sprite && sel.sprite.endsWith('.sprite.json'));
  assert.ok(sel.animation && sel.animation.length > 0);
}
