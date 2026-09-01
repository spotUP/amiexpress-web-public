/**
 * The app binds the pure model - it does not reimplement it.
 *
 * A source-shape check, deliberately: the UI cannot run without a
 * terminal, but the two faults worth guarding are (1) the app growing its
 * own selection logic beside the tested model, and (2) the playback timer
 * surviving destroy() - the leak class that made LiveChat's video flip
 * between two modes. Both are visible in the source.
 *
 * One exception: theMenuBarSleepsWithTheEditorAndArtSession below builds a
 * REAL Screen + MenuBar (final fix wave, must-fix test) - the guarantee it
 * proves (hiding the menu bar actually stops its buttons receiving mouse
 * events) lives in Screen's runtime hit-testing, not in app.ts's source
 * text, and a regex over the source cannot see it.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createStudioMenuBar } from '../menu';

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
 * Fix round 1, Critical 1: the browser's menu bar stayed mounted at
 * top:0 with live hover/click listeners while EditScreen (or ArtSession)
 * owned the screen - a hovering mouse could open "Sprite > Quit" directly
 * under the editor's own menu bar.
 *
 * Final fix wave, must-fix test: the original version of this test only
 * regexed app.ts's source for "this.menuBar" inside the studio.edit/
 * studio.artMode hide/show lists - a guarantee the CODE did not actually
 * provide, because hide() alone never made a hidden container's children
 * stop receiving mouse events (screen.ts's mouse hit-test walked into a
 * hidden element's subtree regardless of the element's own hidden state -
 * see the SDK's hidden-container-mouse-hit-test.test.ts for the root-
 * cause fix). This version drives the REAL hit-test path against a REAL
 * MenuBar, built the exact way app.ts builds its own (menu.ts's
 * createStudioMenuBar): it fails before the SDK's Critical 1 fix (the
 * hidden button stays hit-testable) and passes after.
 */
export async function theMenuBarSleepsWithTheEditorAndArtSession(): Promise<void> {
  const screen: any = new Screen({ title: 'menu-sleep', width: 80, height: 24 } as any);
  try {
    const menuBar = createStudioMenuBar(screen, [
      { label: 'Sprite', items: [{ label: 'Quit (q)', action: () => undefined }] },
    ]);
    const button = (menuBar as any).menuButtons[0];
    const coords = button._getCoords();

    // Precondition, checked directly against the button's own geometry -
    // not through Screen's hit-test index, which this test is about to
    // exercise for the first time - so hiding it below is a meaningful
    // test rather than one that would pass no matter what.
    assert.ok(button.hasMouseOver(coords.xi, coords.yi),
      'precondition: the menu bar\'s first button must cover its own coordinates while visible');

    menuBar.hide();

    // First-ever query against this screen's mouse index (nothing queried
    // it before now), so this proves the real, first-build behaviour -
    // not something a stale cache happens to mask.
    const hits: any[] = (screen as any).getElementsAt(coords.xi, coords.yi);
    assert.ok(!hits.includes(button),
      'a hidden menu bar\'s own button must not be returned by the real hit-test path - ' +
      'the exploit this fix wave closed: a hovering mouse could still open the browser\'s ' +
      '"Sprite > Quit" menu while EditScreen/ArtSession owned the screen');
  } finally {
    screen.destroy();
  }
}

/**
 * Final fix wave, Important 4: bindKeys() used to wire the RAW bindings
 * table (`for (const binding of bindings) this.screen.key(...)`) while
 * menuItems() served the GUARDED array buildBindingSet built - the
 * opposite of the invariant bindings.ts's module doc comment documents,
 * and of what edit-screen.ts's own bindKeys() does (see edit-screen-
 * shape.test.ts's opBindingsRouteThroughTheDialogOpenGuard, the pin this
 * one mirrors for the browser screen). Harmless only as long as no
 * isBlocked predicate was passed to buildBindingSet; Critical 1's SDK fix
 * makes a hidden MenuBar's buttons stop firing on hover, but the browser
 * and editor share ONE Screen instance, so a dialog opened by the editor
 * (dialogs.ts sets `screen.dialogOpen` on that shared screen) must also
 * block the browser's OWN keyboard bindings, not just its mouse.
 */
export async function bindKeysRoutesThroughTheDialogOpenGuard(): Promise<void> {
  assert.ok(/buildBindingSet\(bindings, \(\) => this\.screen\.dialogOpen\)/.test(app),
    'buildBindingSet must be called with a dialogOpen guard predicate, so menuItems() inherits it too');
  assert.ok(/for \(const binding of this\.bindingSet\.bindings\) this\.screen\.key\(binding\.keys, binding\.handler\);/.test(app),
    'the browser\'s keys must be wired from the GUARDED bindingSet.bindings, not the raw bindings array');
}

/**
 * Fix round 1, Important 2: studio.help shipped keyboard-unreachable
 * (empty keys, no tab stop, Tab already claimed by pane-cycling). F1 is
 * a standard, non-printable help key.
 */
export async function studioHelpBindsF1(): Promise<void> {
  const idx = app.indexOf("id: 'studio.help'");
  assert.ok(idx >= 0, 'studio.help binding must exist');
  const block = app.slice(idx, idx + 200);
  assert.ok(/keys: \['f1'\]/.test(block), 'studio.help must bind F1, not ship keyboard-unreachable');
  assert.ok(/hotkeyHint: 'F1'/.test(block), "studio.help's hotkeyHint must read 'F1' so the menu label shows it");
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

/**
 * Studio 2c: dockable panels. All four browser content panes (doors,
 * sprites, animations, preview) become DockablePanels built through the
 * shared panels.ts helper, not bare boxes/lists parented straight onto
 * the screen - one options block for drag/resize/minimize instead of
 * four hand-tuned ones.
 */
export async function theBrowserPanesAreDockablePanels(): Promise<void> {
  assert.ok(app.includes("from './panels'") && app.includes('makePanel('),
    'the browser must build its panes through panels.ts\'s makePanel');
  for (const key of ['doors', 'sprites', 'animations', 'preview']) {
    assert.ok(app.includes(`key: '${key}'`),
      `the ${key} pane must be built via makePanel({ key: '${key}', ... })`);
  }
}

/**
 * Fix round 1, Important 2: a content child at relative top:0 has its
 * row 0 permanently hidden behind the panel's title bar (DockablePanel's
 * bringUIToFront() always renders the title bar last, i.e. on top - see
 * panels.ts's panelContentRect doc comment). Every one of the browser's
 * four content widgets must be positioned through panelContentRect, not
 * a raw `top: 0` literal that would put its first row right back under
 * the title bar.
 */
export async function theBrowserContentChildrenSitAtTop1ViaPanelContentRect(): Promise<void> {
  assert.ok(app.includes("panelContentRect") && app.includes("from './panels'"),
    'the browser must position its panes\' content through panels.ts\'s panelContentRect');
  for (const list of ['doorsList', 'spritesList', 'animationsList', 'previewBox']) {
    const idx = app.indexOf(`this.${list} = blessed.`);
    assert.ok(idx >= 0, `${list} must exist`);
    const block = app.slice(idx, app.indexOf('});', idx));
    assert.ok(!/top:\s*0,/.test(block),
      `${list} must not sit at a literal top:0 - that row belongs to the panel's title bar`);
    assert.ok(/top:\s*\w+Content\.top,/.test(block),
      `${list} must take its top from a panelContentRect(...) result, not a hand-picked number`);
  }
}

/**
 * Studio 2c fix round: livechat's screen options (the worked DockablePanel
 * reference) disable fastCSR for stable dockable-panel rendering; this
 * door's screen must mirror that or dragging/resizing a panel here can
 * corrupt the terminal the same way it used to in livechat before the fix.
 */
export async function theBrowserScreenDisablesFastCSR(): Promise<void> {
  const idx = app.indexOf('createScreen(');
  assert.ok(idx >= 0, 'the browser must build its screen through createScreen');
  const block = app.slice(idx, app.indexOf(');', idx));
  assert.ok(/fastCSR:\s*false/.test(block),
    'the browser screen must set fastCSR: false, mirroring livechat/ui/screen.ts');
}

/**
 * Studio 2c: hiding/showing PANES while the editor/art session owns the
 * screen must hide/show the PANELS (the outermost dockable element), not
 * their nested list/box content - hiding only the content would leave an
 * empty, still-visible, still-draggable panel shell sitting on screen.
 */
export async function theSleepListsHidePanelsNotBareContentWidgets(): Promise<void> {
  for (const id of ["id: 'studio.edit'", "id: 'studio.artMode'"]) {
    const idx = app.indexOf(id);
    assert.ok(idx >= 0, `${id} binding must exist`);
    const block = app.slice(idx, idx + 1500);
    const hideLists = block.match(/for \(const w of \[[^\]]*\]\) w\.hide\(\);/g) || [];
    const showLists = block.match(/for \(const w of \[[^\]]*\]\) w\.show\(\);/g) || [];
    assert.strictEqual(hideLists.length, 1, `${id} must have exactly one hide list`);
    assert.strictEqual(showLists.length, 1, `${id} must have exactly one show list`);
    for (const panel of ['doorsPanel', 'spritesPanel', 'animationsPanel', 'previewPanel']) {
      assert.ok(hideLists[0].includes(`this.${panel}`), `${id}'s hide list must include this.${panel}`);
      assert.ok(showLists[0].includes(`this.${panel}`), `${id}'s show list must include this.${panel}`);
    }
  }
}

/** Studio 2c: View -> Reset Layout, wired through the same binding table as every hotkey. */
export async function theBrowserHasAResetLayoutMenuItem(): Promise<void> {
  const idx = app.indexOf("id: 'view.resetLayout'");
  assert.ok(idx >= 0, "app.ts must declare the 'view.resetLayout' binding");
  const block = app.slice(idx, idx + 400);
  assert.ok(/keys: \[\]/.test(block), 'Reset Layout has no hotkey - an empty keys array is legal (menu-only)');
  assert.ok(/menu: 'View'/.test(block), "Reset Layout must live under the 'View' menu");
  assert.ok(/label: 'Reset Layout'/.test(block));
  assert.ok(app.includes('resetPanelLayout('),
    'Reset Layout must restore panels through panels.ts\'s resetPanelLayout, not hand-rolled position math');
}

