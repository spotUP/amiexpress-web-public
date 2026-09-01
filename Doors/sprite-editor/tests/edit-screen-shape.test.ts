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
  // setCell/setPixel/floodFill are gone with the door's own painter: the
  // hosted ANSIEditor owns painting, and its canvas re-enters the document
  // through setFrame - one whole-frame op instead of three per-cell ones.
  for (const op of ['openDoc', 'addFrame', 'deleteFrame', 'moveFrame',
                    'setFrame', 'setTicksPerFrame', 'toggleLoop',
                    'addAnimation', 'toSprite']) {
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

/**
 * C-q must not become a typeable glyph: glyphForKey('C-q') is null (no
 * 'S-' prefix, length !== 1 after the 'C-' strip is never even attempted),
 * so it must never appear as a bare key anywhere else in the table (which
 * would risk colliding with a real printable binding), and the plain
 * letter 'q' must remain completely unbound in this door - painting the
 * glyph q is still 'q's only meaning here.
 */
export async function cqDoesNotCollideWithAnyOtherBindingOrTheGlyphSet(): Promise<void> {
  const closeEditorCount = (code.match(/'C-q'/g) || []).length;
  assert.strictEqual(closeEditorCount, 1, "'C-q' must be declared exactly once, on file.closeEditor");
  assert.ok(!/keys: \[[^\]]*'q'[^\]]*\]/.test(code),
    "no binding may bind the bare letter 'q' - it must keep painting the glyph q");
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
  assert.ok(/buildBindingSet\(this\.buildOpBindings\(\), \(\) => this\.screen\.dialogOpen\)/.test(code),
    'buildBindingSet must be called with a dialogOpen guard predicate, so menuItems() inherits it too');
  assert.ok(/for \(const binding of this\.bindingSet\.bindings\) this\.opKey\(binding\.keys, binding\.handler\);/.test(code),
    'the op table must be wired from the GUARDED bindingSet.bindings, not the raw opBindings array, ' +
    'by one loop, not per-key call sites');
  // Every key the studio still claims. The old single-letter set is gone:
  // the hosted editor types printable characters onto the canvas, so a
  // letter hotkey would fire the op AND paint the letter. What is left is
  // non-printable, and everything else is menu-only.
  for (const key of ["'C-p'", "'C-f'", "'C-e'", "'C-q'"]) {
    assert.ok(code.includes(`keys: [${key}]`),
      `[${key}] must have a table entry, wired through the op loop into opKey`);
  }
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
  for (const panel of ['canvasPanel', 'previewPanel', 'framesPanel']) {
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
  for (const key of ['canvas', 'preview', 'frames']) {
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
  // The canvas pane's content is the hosted ANSIEditor, constructed with
  // `new ANSIEditor({...})` rather than blessed.box - it takes the same
  // panelContentRect geometry, so it is checked by the same rule with its
  // own constructor name.
  for (const [box, ctor] of [['editor', 'new ANSIEditor({'],
                             ['previewBox', 'blessed.box({'],
                             ['framesBox', 'blessed.box({']] as Array<[string, string]>) {
    const idx = code.indexOf(`this.${box} = ${ctor}`);
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
  assert.ok(!/editor\.setContent\('\\n /.test(code),
    'editor.setContent must not start with a leading \\n - see panelContentRect');
  assert.ok(!/previewBox\.setContent\(\s*\n?\s*'\\n /.test(code),
    'previewBox.setContent must not start with a leading \\n - see panelContentRect');
  assert.ok(!/framesBox\.setContent\(`\\n /.test(code),
    'framesBox.setContent must not start with a leading \\n - see panelContentRect');
  assert.ok(!/\.join\('\\n /.test(code) && !/\.join\(`\\n /.test(code),
    "no line-join may use '\\n ' (newline + space) as its SEPARATOR either - " +
    'that staggers every row but the first one column to the right, the same ' +
    'defect a leading newline causes on row 0 alone');
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

