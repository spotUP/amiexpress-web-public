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
