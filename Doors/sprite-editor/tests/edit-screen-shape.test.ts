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
 * `naming !== null` check exists exactly once, not copy-pasted per key.
 */
/**
 * Studio 2c: the 19 opKey-bound keys below no longer appear as literal
 * `this.opKey(['x'], ...)` call sites - they are StudioBinding entries in
 * one table (bindings.ts), wired through opKey by a single loop. The
 * meaning this test pins is unchanged: every one of these keys must still
 * be declared AND still be wired through the naming guard, not the raw
 * key().
 */
export async function opBindingsRouteThroughTheNamingGuard(): Promise<void> {
  assert.ok(/private opKey\(/.test(code), 'op key bindings must share one guarded wrapper');
  const opKeyBody = code.slice(code.indexOf('private opKey('), code.indexOf('private opKey(') + 300);
  assert.ok(/if \(this\.naming !== null\) return;/.test(opKeyBody),
    'the wrapper must no-op every bound op while a name is being typed');
  assert.ok(/for \(const binding of opBindings\) this\.opKey\(binding\.keys, binding\.handler\);/.test(code),
    'the op table must be wired through opKey by one loop, not per-key call sites');
  for (const key of ["'g'", "'f'", "'S-f'", "'b'", "'S-b'", "','", "'.'", "'n'", "'c'", "'x'",
                     "'S-,'", "'S-.'", "'a'", "'+'", "'t'", "'S-t'", "'l'", "'S-x'", "'s'"]) {
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
  const count = (code.match(/this\.tryOp\(\(\) => this\.mode === 'pixel'/g) || []).length;
  assert.strictEqual(count, 2, 'both space and delete must use the guarded form');
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
 */
export async function destroyTearsDownItsOwnMenuBar(): Promise<void> {
  const destroyIdx = code.indexOf('destroy(): void {');
  assert.ok(destroyIdx >= 0, 'destroy() must exist');
  const destroyBody = code.slice(destroyIdx, code.indexOf('\n}', destroyIdx));
  assert.ok(/this\.menuBar[\],]/.test(destroyBody),
    'destroy() must include this.menuBar in the widgets it destroys');
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
