/**
 * Art mode ('m'): the door's .ans files opened in the full ANSIEditor
 * engine. Same discipline as edit-screen-shape.test.ts - source-shape
 * checks with COMMENTS STRIPPED first, since the naive greps matched
 * commented-out code before.
 *
 * ArtSession itself lives in art-screen.ts (extracted from app.ts for
 * parity with EditScreen/edit-screen.ts); app.ts keeps only the 'm'
 * wiring - the hide/show around it, the double-open guard, and the
 * browser's own apply() deafness. Tests below read whichever file the
 * shape they pin actually lives in.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const raw = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');
/** The source with line and block comments removed. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const artScreenRaw = readFileSync(join(__dirname, '..', 'art-screen.ts'), 'utf8');
/** art-screen.ts with line and block comments removed. */
const artScreenCode = artScreenRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

export async function artModeUsesTheAssetHelpers(): Promise<void> {
  for (const op of ['listArt(', 'readArt(', 'writeArt(']) {
    assert.ok(artScreenCode.includes(op), `art mode must use ${op} from assets`);
  }
}

export async function theBrowserPanesHideAndShowAroundArtMode(): Promise<void> {
  const idx = code.indexOf("this.screen.key(['m']");
  assert.ok(idx >= 0, "app.ts must bind the 'm' key for art mode");
  const block = code.slice(idx, idx + 1200);
  assert.ok(/\.hide\(\)/.test(block),
    'the m handler must hide the browser panes before opening art mode');
  assert.ok(/\.show\(\)/.test(block),
    "the art session's exit callback must restore the browser panes");
}

export async function theArtEditorWidgetIsDestroyedOnExit(): Promise<void> {
  assert.ok(/this\.editor\?\.destroy\(\)/.test(artScreenCode) || /this\.editor\.destroy\(\)/.test(artScreenCode),
    'the ANSIEditor instance must be destroyed when art mode exits');
}

export async function theArtHandlerGuardsDoubleOpenAndEditScreen(): Promise<void> {
  const idx = code.indexOf("this.screen.key(['m']");
  assert.ok(idx >= 0, "app.ts must bind the 'm' key for art mode");
  const block = code.slice(idx, idx + 400);
  assert.ok(/this\.editScreen/.test(block),
    "the m handler must no-op while the edit screen is open");
  assert.ok(/this\.artSession/.test(block),
    'the m handler must no-op while another art session is already open');
}

/**
 * apply() is the browser's one choke point for navigation keys; while art
 * mode owns the screen the browser must stay deaf to them too, the same
 * way it already stays deaf while the edit screen is open (blessed fires
 * every handler bound to a key, focused or not).
 */
export async function theBrowserIsDeafWhileArtModeIsOpen(): Promise<void> {
  const applyBody = code.slice(code.indexOf('private apply('));
  assert.ok(/if \(this\.editScreen\) return;/.test(applyBody.slice(0, 400)),
    'apply() must keep ignoring navigation while the edit screen is open');
  assert.ok(/if \(this\.artSession\) return;/.test(applyBody.slice(0, 400)),
    'apply() must ignore navigation while art mode is open too');
}
