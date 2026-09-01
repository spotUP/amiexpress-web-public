/**
 * The app binds the pure model - it does not reimplement it.
 *
 * A source-shape check, deliberately: the UI cannot run without a
 * terminal, but the two faults worth guarding are (1) the app growing its
 * own selection logic beside the tested model, and (2) the playback timer
 * surviving destroy() - the leak class that made LiveChat's video flip
 * between two modes. Both are visible in the source.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const app = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');

export async function theAppUsesTheTestedModel(): Promise<void> {
  for (const name of ['initialState', 'moveSelection', 'cyclePane', 'selection']) {
    assert.ok(app.includes(name), `app.ts should call ${name} from browser-model`);
  }
  assert.ok(app.includes('previewLines'), 'and render through previewLines');
}

export async function destroyStopsThePlaybackTimer(): Promise<void> {
  assert.ok(/clearInterval\(this\.playback/.test(app),
    'destroy() must clear the playback interval - a door is unloaded by ' +
    'removing its script, which stops nothing it started');
}

/**
 * Studio 2c: percent geometry is gone, replaced by layout.ts's integer
 * LAYOUT.browser - the root cause fix for the bottom double border (see
 * the task-2 report: independently-rounded sibling percentages could
 * disagree on a shared boundary by a row, depending on terminal height).
 * This test used to assert the OPPOSITE (percentage-sized panes); it now
 * pins that no percent string geometry has crept back in, and that the
 * panes are built from LAYOUT instead.
 */
export async function theLayoutIsIntegerNotPercentageBased(): Promise<void> {
  const percents = (app.match(/width: '\d+%'/g) || []).length +
                   (app.match(/height: '\d+%'/g) || []).length +
                   (app.match(/top: '\d+%'/g) || []).length +
                   (app.match(/left: '\d+%'/g) || []).length;
  assert.strictEqual(percents, 0, `no pane may use percent geometry any more, found ${percents}`);
  assert.ok(app.includes("from './layout'") && app.includes('LAYOUT.browser'),
    'the browser must source its pane geometry from layout.ts\'s LAYOUT');
}

/** Studio 2c: menu bars on both screens, built from the same binding table. */
export async function theBrowserHasAMenuBarBuiltFromTheBindingSet(): Promise<void> {
  assert.ok(app.includes('createStudioMenuBar(this.screen, this.bindingSet.menuItems())'),
    'the browser menu bar must be built from the same BindingSet the hotkeys use - ' +
    'one dispatch path, not two');
}

/**
 * Studio 2c: click-to-select and double-click-to-open must not be a
 * second, parallel implementation of selection/edit - they route through
 * the exact same pure functions (apply/moveSelection/cyclePane) the
 * arrow keys use, and the exact same StudioBinding handler (found by id)
 * the 'e' key dispatches - not a copy of its body.
 */
export async function mouseSelectionReusesTheExistingHandlersNotACopy(): Promise<void> {
  assert.ok(app.includes('this.apply(moveSelection(this.state, indexDelta))'),
    'a click must move the selection through apply(moveSelection(...)) - the same path arrow keys take');
  assert.ok(app.includes('this.apply(cyclePane(this.state, 1))'),
    'a click on another pane must focus it through apply(cyclePane(...)) - the same path Tab takes');
  assert.ok(app.includes("this.bindingSet.bindings.find(b => b.id === 'studio.edit')?.handler()"),
    "a double-click must invoke the SAME 'studio.edit' binding handler the 'e' key dispatches, found by id");
}

/** Studio 2c: click-to-select needs mouse enabled on the three lists and preview. */
export async function theThreeListsAndPreviewHaveMouseEnabled(): Promise<void> {
  for (const list of ['doorsList', 'spritesList', 'animationsList']) {
    const idx = app.indexOf(`this.${list} = blessed.list({`);
    assert.ok(idx >= 0, `${list} must exist`);
    const block = app.slice(idx, app.indexOf('});', idx));
    assert.ok(/mouse:\s*true/.test(block), `${list} must have mouse: true for click-to-select`);
  }
  const previewIdx = app.indexOf('this.previewBox = blessed.box({');
  const previewBlock = app.slice(previewIdx, app.indexOf('});', previewIdx));
  assert.ok(/mouse:\s*true/.test(previewBlock), 'previewBox must have mouse: true');
}

/**
 * The door holds itself open.
 *
 * CoreDoor.execute() awaits its input loop ONLY for doors that register
 * onInput handlers. A blessed door routes keys through the screen instead,
 * so start() must await a promise resolved on destroy - the ANSI editor's
 * pattern - or execute() returns as soon as setup finishes. Shipped
 * without it once: opening SPRITED cleared the screen and dropped
 * straight back to the BBS.
 */
export async function startHoldsTheDoorOpenUntilDestroy(): Promise<void> {
  assert.ok(/await new Promise<void>\(\(resolve\) => \{\s*\n\s*this\.exitResolve = resolve;/.test(app),
    'start() must await the stay-alive promise');
  assert.ok(/this\.exitResolve\(\);/.test(app),
    'and destroy() must resolve it, or quitting hangs the door');
}

/** Constructed is not enabled: without enable() the backend drops every key. */
export async function theInputManagerIsEnabled(): Promise<void> {
  assert.ok(/this\.inputManager\.enable\(\)/.test(app),
    'DoorInputManager must be enabled or the door is input-dead');
}

/** This blessed port has no right-align token; a literal {|} on screen is the bug. */
export async function theStatusBarUsesNoUnsupportedTags(): Promise<void> {
  assert.ok(!app.includes("'{|}'") && !app.includes('{|}'),
    'the {|} token renders literally in this blessed port - pad by width instead');
}

