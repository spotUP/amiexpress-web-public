/**
 * Art mode's new-file naming: the collision case, exercised for real.
 *
 * Review finding: `[new file]` -> typing a name that already exists in
 * this.files opened the editor with content = '' unconditionally, so the
 * first save on an EXISTING file replaced it with a blank canvas. The fix
 * is `newFileContent(door, files, name)`, exported from art-screen.ts as a
 * pure function of the collision decision - assertable here against the
 * real filesystem (this door's own art/ directory, scratch data, cleaned
 * up after) without touching the ANSIEditor widget at all.
 */

import assert from 'assert';
import * as fs from 'fs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { newFileContent, ArtSession } from '../art-screen';
import { writeArt, resolveAssetPath } from '../assets';

const raw = readFileSync(join(__dirname, '..', 'art-screen.ts'), 'utf8');
/** The source with line and block comments removed - the naive grep matched
 * commented-out code before, in this same door (edit-screen-shape.test.ts). */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/**
 * The pure decision function alone proves nothing if the naming submit
 * handler never calls it - the exact gap a first draft of this fix left:
 * newFileContent() was correct and unit-tested while the real [new file]
 * flow still passed '' unconditionally. Pin the wiring, not just the logic.
 */
export async function theNamingSubmitHandlerUsesTheCollisionCheck(): Promise<void> {
  assert.ok(code.includes('newFileContent(this.door, this.files, name)'),
    'the enter-while-naming handler must open newFileContent(...), not a hardcoded blank string');
}

const SCRATCH_DOOR = 'sprite-editor'; // our own door: safe scratch space
const SCRATCH_NAME = 'scratch-collision-test';
const SCRATCH_FILE = `${SCRATCH_NAME}.ans`;

export async function aCollidingNameOpensTheRealFileNotBlank(): Promise<void> {
  const real = Buffer.from('REAL ART - must survive naming collision\n', 'latin1');
  writeArt(SCRATCH_DOOR, SCRATCH_FILE, real);
  try {
    const content = newFileContent(SCRATCH_DOOR, [SCRATCH_FILE], SCRATCH_NAME);
    assert.strictEqual(content, real.toString('latin1'),
      'naming an EXISTING file must open its real content, never blank it');
  } finally {
    fs.unlinkSync(resolveAssetPath(SCRATCH_DOOR, 'art', SCRATCH_FILE));
  }
}

export async function aFreshNameStillOpensBlank(): Promise<void> {
  const content = newFileContent(SCRATCH_DOOR, ['other-file.ans'], 'brand-new-name');
  assert.strictEqual(content, '', 'a name with no matching file opens a blank canvas');
}

export async function theListOfFilesIsWhatDecidesCollisionNotTheDisk(): Promise<void> {
  // newFileContent trusts the FILES ARRAY it is given (the same listing
  // the browser already showed the user), not a fresh disk read - so a
  // name matching something NOT in that list is treated as fresh.
  const content = newFileContent(SCRATCH_DOOR, [], SCRATCH_NAME);
  assert.strictEqual(content, '');
}

/**
 * Task 7 (controller audit gap 3): the picker used to bind up/k, down/j,
 * enter, escape directly via this.key(), with NO menu at all. It must now
 * declare a StudioBinding table covering exactly those four actions, each
 * with a menu/label/hotkeyHint - the same shape edit-screen-shape.test.ts
 * pins for the two edit-screen gaps.
 */
export async function thePickerBindingTableCoversEveryKeyWithAMenuEntry(): Promise<void> {
  const cases: Array<{ id: string; keys: string; menu: string; label: string; hotkeyHint: string }> = [
    { id: 'file.openSelected', keys: "['enter']", menu: 'File', label: 'Open Selected', hotkeyHint: 'enter' },
    { id: 'file.cancel', keys: "['escape']", menu: 'File', label: 'Cancel', hotkeyHint: 'esc' },
    { id: 'nav.up', keys: "['up', 'k']", menu: 'Navigate', label: 'Up', hotkeyHint: 'up/k' },
    { id: 'nav.down', keys: "['down', 'j']", menu: 'Navigate', label: 'Down', hotkeyHint: 'down/j' },
  ];
  for (const c of cases) {
    const idx = code.indexOf(`id: '${c.id}'`);
    assert.ok(idx >= 0, `art-screen.ts must declare the '${c.id}' binding`);
    const block = code.slice(idx, idx + 500);
    assert.ok(block.includes(`keys: ${c.keys}`), `${c.id} must bind keys ${c.keys}`);
    assert.ok(block.includes(`menu: '${c.menu}'`), `${c.id} must live under the '${c.menu}' menu`);
    assert.ok(block.includes(`label: '${c.label}'`), `${c.id}'s label must be '${c.label}'`);
    assert.ok(block.includes(`hotkeyHint: '${c.hotkeyHint}'`), `${c.id}'s hotkeyHint must be '${c.hotkeyHint}'`);
  }
}

/** The picker's menu bar must be built from the same guarded BindingSet the keys wire from. */
export async function thePickerHasAMenuBarBuiltFromTheBindingSet(): Promise<void> {
  assert.ok(code.includes('createStudioMenuBar(this.screen, this.bindingSet.menuItems())'),
    'the picker menu bar must be built from the same BindingSet the hotkeys use - one dispatch path, not two');
  assert.ok(code.includes('buildBindingSet(this.buildListBindings(), () => this.screen.dialogOpen)'),
    'buildBindingSet must be called with a dialogOpen guard predicate, so menuItems() inherits it too');
}

/** No literal this.key() call site may bind these four keys outside the table any more. */
export async function thePickerNoLongerBindsKeysOutsideTheTable(): Promise<void> {
  for (const literal of [
    "this.key(['up', 'k']", "this.key(['down', 'j']", "this.key(['enter']", "this.key(['escape']",
  ]) {
    assert.ok(!code.includes(literal),
      `there must be no separate ${literal}...) call site outside buildListBindings() any more`);
  }
  assert.ok(code.includes('for (const binding of this.bindingSet.bindings) this.key(binding.keys, binding.handler)'),
    'the picker\'s keys must be wired from the GUARDED bindingSet.bindings, by one loop, not per-key call sites');
}

/**
 * Fix precedent: app-shape.test.ts's theMenuBarSleepsWithTheEditorAndArtSession
 * proves the SDK guarantee (a destroyed/hidden element's own button stops
 * being hit-testable) in isolation. This test drives the REAL integration -
 * a REAL ArtSession's own picker menu bar, torn down through the REAL
 * openEditor() code path - because the picker's menu bar must not remain
 * live underneath the ANSIEditor's own `showMenuBar: true` bar once the
 * editor phase begins (Task 7, controller audit gap 3's sleep/destroy
 * requirement). A source-shape regex cannot see this: it lives in whether
 * the destroyed element is still reachable by Screen's real mouse hit-test
 * index, not in whether a `destroy()` call appears in the source text.
 */
export async function thePickerMenuBarDoesNotOutliveTheListPhase(): Promise<void> {
  const screen: any = new Screen({ title: 'art-menu-sleep', width: 80, height: 25 } as any);
  let session: ArtSession | undefined;
  try {
    session = new ArtSession(screen, 'fixture-door', () => {});
    const menuBar = (session as any).menuBar;
    assert.ok(menuBar, 'precondition: the picker must build a menu bar while the list phase is showing');
    const button = (menuBar as any).menuButtons[0];
    const coords = button._getCoords();

    // Checked directly against the button's own geometry first (not
    // through Screen's hit-test index) so tearing it down below is a
    // meaningful test rather than one that would pass no matter what.
    assert.ok(button.hasMouseOver(coords.xi, coords.yi),
      'precondition: the picker menu bar\'s first button must cover its own coordinates while visible');

    (session as any).openEditor('probe.ans', '');

    assert.strictEqual((session as any).menuBar, null,
      'openEditor() must destroy and null out the picker\'s own menu bar reference');

    const hits: any[] = (screen as any).getElementsAt(coords.xi, coords.yi);
    assert.ok(!hits.includes(button),
      'the picker\'s menu bar must not survive into the editor phase - a hovering mouse must not still be ' +
      'able to open the picker\'s "File > Cancel" underneath the ANSIEditor\'s own menu bar');
  } finally {
    session?.destroy();
    screen.destroy();
  }
}
