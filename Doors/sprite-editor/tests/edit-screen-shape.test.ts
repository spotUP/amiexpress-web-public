/**
 * The edit screen binds the tested document model - it does not
 * reimplement it - and honours the door-lifecycle rules.
 *
 * Source-shape checks with COMMENTS STRIPPED first: the naive version of
 * these greps matched commented-out code twice this session.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const raw = readFileSync(join(__dirname, '..', 'edit-screen.ts'), 'utf8');
/** The source with line and block comments removed. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const appRaw = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');
const appCode = appRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

export async function theScreenUsesTheDocumentModel(): Promise<void> {
  for (const op of ['openDoc', 'addFrame', 'deleteFrame', 'moveFrame',
                    'setCell', 'setPixel', 'setTicksPerFrame', 'toggleLoop',
                    'addAnimation', 'toSprite', 'floodFill']) {
    assert.ok(code.includes(op), `edit-screen must use ${op} from edit-doc`);
  }
}

export async function savesGoThroughTheGuardedWriter(): Promise<void> {
  assert.ok(code.includes('writeSprite('), 'saving must use the guarded writer');
}

export async function teardownClearsItsTimerAndKeys(): Promise<void> {
  assert.ok(/clearInterval\(this\.playback/.test(code),
    'the playback interval must die with the screen');
  assert.ok(/unkey\(|removeKey|offKey|\.removeListener\(/.test(code) ||
            /keyHandlers/.test(code),
    'screen-level key bindings must be removed on destroy - the browser\'s ' +
    'keys come back when the editor leaves');
}

export async function escapeIsGuardedWhenDirty(): Promise<void> {
  assert.ok(/dirty/.test(code) && /escape/i.test(code),
    'a dirty document must not be silently discarded by one keypress');
}

/**
 * While the editor owns the screen, the browser must be deaf: blessed
 * fires every handler bound to a key, and unguarded navigation mutated
 * the selection underneath the editor on every arrow press.
 */
export async function theBrowserIsDeafWhileTheEditorIsOpen(): Promise<void> {
  const applyBody = appCode.slice(appCode.indexOf('private apply('));
  assert.ok(/if \(this\.editScreen\) return;/.test(applyBody.slice(0, 400)),
    'apply() must ignore navigation while the edit screen is open');
}

/**
 * Review finding: typing an animation name fired every op key bound to a
 * letter in the name (naming "spin" saved to disk and inserted a blank
 * frame). Every op binding must route through one guarded wrapper so the
 * check exists exactly once, not copy-pasted per key.
 *
 * Studio 2c task 5: the typed-naming mode is gone (dialogs.ts's
 * promptText/confirm replace it). The wrapper's guard now reads
 * `screen.dialogOpen`, a flag dialogs.ts itself sets/clears around its own
 * await - never a `this.naming` field this file owned. The meaning this
 * test pins is unchanged from before: every op binding must still be
 * declared AND still be wired through ONE guard, not the raw key().
 *
 * Studio 2c: the 24 opKey-bound keys below no longer appear as literal
 * `this.opKey(['x'], ...)` call sites - they are StudioBinding entries in
 * one table (bindings.ts), wired through opKey by a single loop.
 *
 * Fix round 1 (review-caught): a menu item's mouse click bypassed
 * dialogOpen entirely (dropdown-menu.ts's selectItem() calls
 * `item.action?.()` directly - a separate dispatch path from
 * screen.key()). The fix moved the CHECK into bindings.ts's
 * buildBindingSet(bindings, isBlocked), which wraps every handler once
 * before either screen.key() registration OR menuItems()'s action ever
 * sees it - so this file's own opKey() check is now redundant-by-
 * construction for every table-routed binding (see opKey's own doc
 * comment). Pins both halves: buildBindingSet is called WITH a guard
 * predicate, and the wiring loop reads the GUARDED bindingSet.bindings,
 * not the raw opBindings array.
 */
export async function opBindingsRouteThroughTheDialogOpenGuard(): Promise<void> {
  assert.ok(/private opKey\(/.test(code), 'op key bindings must share one guarded wrapper');
  const opKeyBody = code.slice(code.indexOf('private opKey('), code.indexOf('private opKey(') + 300);
  assert.ok(/if \(this\.screen\.dialogOpen\) return;/.test(opKeyBody),
    'the wrapper must no-op every bound op while a dialog is open');
  assert.ok(!/this\.naming/.test(code), 'the typed-naming field/guard must be fully deleted, not renamed');
  assert.ok(/buildBindingSet\(opBindings, \(\) => this\.screen\.dialogOpen\)/.test(code),
    'buildBindingSet must be called with a dialogOpen guard predicate, so menuItems() inherits it too');
  assert.ok(/for \(const binding of this\.bindingSet\.bindings\) this\.opKey\(binding\.keys, binding\.handler\);/.test(code),
    'the op table must be wired from the GUARDED bindingSet.bindings, not the raw opBindings array, ' +
    'by one loop, not per-key call sites');
  for (const key of ["'g'", "'f'", "'S-f'", "'b'", "'S-b'", "','", "'.'", "'n'", "'c'", "'x'",
                     "'S-,'", "'S-.'", "'a'", "'+'", "'t'", "'S-t'", "'l'", "'S-x'", "'s'",
                     "'space'", "'p'", "'e'", "'k'", "'u'"]) {
    assert.ok(code.includes(`keys: [${key}]`),
      `[${key}] must have a table entry, wired through the op loop into opKey`);
  }
}

/**
 * Review finding: space/delete called setPixel through apply() directly,
 * so an exception (frame no longer pixel-editable) threw uncaught out of
 * the key handler instead of landing in the status flash like every other
 * op's refusal.
 */
export async function spaceAndDeleteRouteSetPixelThroughTryOp(): Promise<void> {
  assert.ok(/this\.tryOp\(\(\) => this\.mode === 'pixel'\s*\n\s*\? setPixel/.test(code),
    'space and delete must route setPixel/setCell through tryOp, not apply() directly');
  // Studio 2c task 4: mouse paint/erase (applyToolAt) reuse this EXACT
  // guarded form too - not a parallel, unguarded copy - so the count grew
  // from 2 (space, delete) to 4 (space, delete, mouse paint, mouse erase)
  // by design. A regression back toward a bespoke, unguarded mouse path
  // would drop this below 4.
  const count = (code.match(/this\.tryOp\(\(\) => this\.mode === 'pixel'/g) || []).length;
  assert.strictEqual(count, 4,
    'space, delete, and mouse paint/erase must all use the guarded tryOp form');
}

/**
 * Review finding: the exclusion string that keeps bound-key letters out of
 * typed cell art omitted 'X' - S-x is bound (deleteAnimation) but its
 * Shift+X keypress ('X') fell through to setCell.
 *
 * Studio 2c: the hand-written exclusion string is gone. The check must now
 * read the binding table's own derived set (bindings.ts's buildBindingSet -
 * unit-pinned in bindings.test.ts, including that S-x derives 'X'), so
 * this test pins that the check reads THAT set and that the delete-
 * animation binding is still declared with the key that derives it.
 */
export async function theTypingExclusionListIncludesShiftedDeleteAnimation(): Promise<void> {
  assert.ok(/this\.bindingSet\.excludedGlyphKeys\.has\(ch\)/.test(code),
    'the glyph-typing exclusion check must read the derived binding set, not a hand-written string');
  assert.ok(code.includes("keys: ['S-x']"),
    "the delete-animation binding must still bind S-x, whose derived glyph 'X' keeps it out of cell-typing");
}

/**
 * Studio 2c: percent geometry is gone, replaced by layout.ts's integer
 * LAYOUT.edit - see layout.test.ts / app-shape.test.ts for the same pin
 * on the browser screen, and the task-2 report for the double-border
 * root-cause arithmetic this eliminates.
 */
export async function theEditScreenUsesIntegerLayoutNotPercent(): Promise<void> {
  const percents = (code.match(/width: '\d+%'/g) || []).length +
                   (code.match(/height: '\d+%'/g) || []).length +
                   (code.match(/top: '\d+%'/g) || []).length +
                   (code.match(/left: '\d+%'/g) || []).length +
                   (code.match(/bottom:\s*0/g) || []).length;
  assert.strictEqual(percents, 0, `no pane may use percent geometry or bottom:0 any more, found ${percents}`);
  assert.ok(code.includes("from './layout'") && code.includes('LAYOUT.edit'),
    'the edit screen must source its pane geometry from layout.ts\'s LAYOUT');
}

/** Studio 2c: a menu bar on the edit screen too, from the same binding table. */
export async function theEditScreenHasAMenuBarBuiltFromTheBindingSet(): Promise<void> {
  assert.ok(code.includes('createStudioMenuBar(this.screen, this.bindingSet.menuItems())'),
    'the edit screen menu bar must be built from the same BindingSet the hotkeys use - ' +
    'one dispatch path, not two');
}

/**
 * Fix round 1, Critical 1: the edit screen's OWN menu bar must die with
 * everything else it owns - the destroy-chain discipline from studio 2b.
 *
 * Studio 2c: the four content panes are now DockablePanels wrapping their
 * old bare box - destroy() must tear down the PANELS (canvasPanel,
 * previewPanel, framesPanel, toolbarPanel), not just their nested content
 * widgets. A panel's own destroy() cascades to its children (element.ts's
 * destroy() destroys every child), so destroying the panel is sufficient;
 * destroying only the content and leaving the panel attached would orphan
 * an empty, still-visible panel shell (title bar and border) on screen.
 */
export async function destroyTearsDownItsOwnMenuBar(): Promise<void> {
  const destroyIdx = code.indexOf('destroy(): void {');
  assert.ok(destroyIdx >= 0, 'destroy() must exist');
  const destroyBody = code.slice(destroyIdx, code.indexOf('\n}', destroyIdx));
  assert.ok(/this\.menuBar[\],]/.test(destroyBody),
    'destroy() must include this.menuBar in the widgets it destroys');
  for (const panel of ['canvasPanel', 'previewPanel', 'framesPanel', 'toolbarPanel']) {
    assert.ok(new RegExp(`this\\.${panel}[\\],]`).test(destroyBody),
      `destroy() must include this.${panel} (the panel, not just its nested content) in the widgets it destroys`);
  }
}

/**
 * Studio 2c: dockable panels. All four edit-screen content panes (canvas,
 * preview, frames, toolbar) become DockablePanels built through the
 * shared panels.ts helper, not bare boxes parented straight onto the
 * screen.
 */
export async function theEditScreenPanesAreDockablePanels(): Promise<void> {
  assert.ok(code.includes("from './panels'") && code.includes('makePanel('),
    'the edit screen must build its panes through panels.ts\'s makePanel');
  for (const key of ['canvas', 'preview', 'frames', 'toolbar']) {
    assert.ok(code.includes(`key: '${key}'`),
      `the ${key} pane must be built via makePanel({ key: '${key}', ... })`);
  }
}

/**
 * Studio 2c task-3 fix round 1, Important 2: a content child at relative
 * top:0 has its row 0 permanently hidden behind the panel's title bar
 * (DockablePanel's bringUIToFront() always renders the title bar last -
 * see panels.ts's panelContentRect doc comment). Every one of the edit
 * screen's four content boxes must be positioned through
 * panelContentRect, not a raw `top: 0` literal.
 */
export async function theEditScreenContentChildrenSitAtTop1ViaPanelContentRect(): Promise<void> {
  assert.ok(code.includes('panelContentRect') && code.includes("from './panels'"),
    'the edit screen must position its panes\' content through panels.ts\'s panelContentRect');
  // Studio 2c task 4: the toolbar pane's content box moved out of this
  // file into toolbar.ts's createToolbar() (the brief's fixed
  // `createToolbar(screen, panel, state, onChange)` signature takes no
  // rect, so it computes its own panelContentRect(LAYOUT.edit.toolbar)) -
  // toolbar.test.ts pins the same top:1/no-literal-top:0 invariant there,
  // against a REAL constructed box's geometry, instead of here.
  for (const box of ['canvasBox', 'previewBox', 'framesBox']) {
    const idx = code.indexOf(`this.${box} = blessed.box({`);
    assert.ok(idx >= 0, `${box} must exist`);
    const block = code.slice(idx, code.indexOf('});', idx));
    assert.ok(!/top:\s*0,/.test(block),
      `${box} must not sit at a literal top:0 - that row belongs to the panel's title bar`);
    assert.ok(/top:\s*\w+Content\.top,/.test(block),
      `${box} must take its top from a panelContentRect(...) result, not a hand-picked number`);
  }
}

/**
 * Studio 2c task-3 fix round 1, Important 2: the leading '\n' that used
 * to push a box's content below its own label/border is now redundant -
 * the content CHILD's position (panelContentRect, top:1) already skips
 * the panel's title-bar row, so keeping the old literal newline would
 * double-blank it (one row lost to position, a second to the string).
 *
 * Final fix wave, Important 3: a LEADING newline is not the only way to
 * introduce a stray column - a `.join('\n ')` SEPARATOR (a newline plus a
 * literal space between every pair of lines) stairsteps every row after
 * the first one column to the right, which is exactly the bug this test
 * previously missed (edit-screen.ts:597 shipped `lines.join('\n ') + ...`
 * - no leading '\n ', so the old regex here saw nothing wrong, but every
 * preview row past row 0 was shifted right by one column - a visible
 * diagonal tear). Checking for the separator form alongside the leading
 * form is what makes this pin catch both shapes of the same mistake.
 */
export async function paintMethodsDoNotDoubleBlankWithALeadingNewline(): Promise<void> {
  assert.ok(!/canvasBox\.setContent\('\\n /.test(code),
    'canvasBox.setContent must not start with a leading \\n - see panelContentRect');
  assert.ok(!/previewBox\.setContent\(\s*\n?\s*'\\n /.test(code),
    'previewBox.setContent must not start with a leading \\n - see panelContentRect');
  assert.ok(!/framesBox\.setContent\(`\\n /.test(code),
    'framesBox.setContent must not start with a leading \\n - see panelContentRect');
  assert.ok(!/\.join\('\\n /.test(code) && !/\.join\(`\\n /.test(code),
    "no line-join may use '\\n ' (newline + space) as its SEPARATOR either - " +
    'that staggers every row but the first one column to the right, the same ' +
    'defect a leading newline causes on row 0 alone');
}

/**
 * Toolbar's content box moved out of edit-screen.ts into toolbar.ts's
 * createToolbar() (Studio 2c task 4) - the old `paletteBox` pin here
 * grepped a name that no longer exists in EITHER file, so it could never
 * fail. toolbar.test.ts's theToolbarBoxSitsAtTheCorrectContentGeometry
 * already covers the box's geometry against a real construction; this
 * pin instead retargets the SAME leading-newline/stagger invariant at
 * toolbar.ts's actual `box.setContent(` call.
 */
export async function toolbarPaintDoesNotDoubleBlankOrStagger(): Promise<void> {
  const toolbarCode = readFileSync(join(__dirname, '..', 'toolbar.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/box\.setContent\(\s*\n?\s*`\\n /.test(toolbarCode),
    'toolbar.ts\'s box.setContent must not start with a leading \\n - see panelContentRect');
  assert.ok(!/\.join\('\\n /.test(toolbarCode) && !/\.join\(`\\n /.test(toolbarCode),
    "toolbar.ts must not join lines with '\\n ' either - the same stagger bug");
}

/** Studio 2c: View -> Reset Layout, wired through the same binding table as every hotkey. */
export async function theEditScreenHasAResetLayoutMenuItem(): Promise<void> {
  const idx = code.indexOf("id: 'view.resetLayout'");
  assert.ok(idx >= 0, "edit-screen.ts must declare the 'view.resetLayout' binding");
  const block = code.slice(idx, idx + 400);
  assert.ok(/keys: \[\]/.test(block), 'Reset Layout has no hotkey - an empty keys array is legal (menu-only)');
  assert.ok(/menu: 'View'/.test(block), "Reset Layout must live under the 'View' menu");
  assert.ok(/label: 'Reset Layout'/.test(block));
  assert.ok(code.includes('resetPanelLayout('),
    'Reset Layout must restore panels through panels.ts\'s resetPanelLayout, not hand-rolled position math');
}

/**
 * Fix round 1, Important 2: studio.help shipped keyboard-unreachable
 * (empty keys, no tab stop). F1 is a standard, non-printable help key -
 * it contributes nothing to the glyph exclusion set (glyphForKey('f1')
 * is null: length !== 1, no 'S-' prefix, not 'space').
 */
export async function studioHelpBindsF1(): Promise<void> {
  const idx = code.indexOf("id: 'studio.help'");
  assert.ok(idx >= 0, 'studio.help binding must exist');
  const block = code.slice(idx, idx + 200);
  assert.ok(/keys: \['f1'\]/.test(block), 'studio.help must bind F1, not ship keyboard-unreachable');
  assert.ok(/hotkeyHint: 'F1'/.test(block), "studio.help's hotkeyHint must read 'F1' so the menu label shows it");
}
