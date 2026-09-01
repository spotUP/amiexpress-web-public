/**
 * What the sprite studio gained, carried back to the door it forked from.
 *
 * "all the stuff we have enhanced sprited with that benefits ansi-edit needs
 * to be backported to ansi-edit as well." Most of it already arrived by
 * itself, because the studio is a fork of THIS door and both host the same
 * widget: half-block magnification, canvas centring, the undo chunk flushed
 * on release, the half-cell cursor, the wheel being reported at all. These
 * are the door-side halves, which had to be carried by hand.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

export async function theDoorTakesTheSharedSizeSwitch(): Promise<void> {
  assert.ok(source.includes('createTerminalModeSwitch({'),
    'the 80x25 / responsive switch must come from the SDK, not be re-invented');
  assert.ok(source.includes('this.terminalMode?.dispose()'),
    'and be disposed on cleanup, which restores the board 80 columns and ' +
    'unhooks both the resize listener and Alt+Enter');
  assert.ok(source.includes('onRelayout: () => { void this.reopenEditorPreservingContent(); }'),
    'with this door supplying what a relayout means for it');
}

/**
 * One method's body, taken to the NEXT method rather than to a name that
 * happens to appear elsewhere in the file. Slicing to a fixed marker
 * silently produced empty strings twice today - a test that reads nothing
 * passes whatever the code says.
 */
function body(name: string): string {
  const start = source.indexOf(name);
  if (start === -1) return '';
  const rest = source.slice(start + name.length);
  const next = rest.search(/\n  (private|public|protected|async|[a-zA-Z]+\()/);
  return next === -1 ? rest : rest.slice(0, next);
}

export async function aRelayoutKeepsTheArtwork(): Promise<void> {
  const fn = body('private async reopenEditorPreservingContent(');
  assert.ok(fn.length > 0, 'the method must exist to be checked');
  assert.ok(fn.includes('this.editor.getContent()'),
    'the document must be read back before the editor is rebuilt');
  assert.ok(fn.includes('await this.openEditor(content)'),
    'and handed to the new one - a resize must not blank the canvas');
}

export async function theZoomLadderIsEvenAboveActualSize(): Promise<void> {
  const steps = /const ANSI_ZOOM_STEPS = \[([^\]]+)\]/.exec(source);
  assert.ok(steps, 'the ladder must be declared');
  const values = steps![1].split(',').map(v => Number(v.trim()));
  assert.strictEqual(values[0], 1, 'actual size first');
  for (const z of values.slice(1)) {
    assert.strictEqual(z % 2, 0,
      `${z}:1 is odd - half-block art puts two pixels in a cell vertically, ` +
      'so an odd scale gives one of them more rows than the other');
  }
}

export async function theWheelStepsTheLadder(): Promise<void> {
  assert.ok(source.includes("this.editor.on('canvas-wheel'"),
    'the door listens for the turn the widget reports');
  assert.ok(source.includes('stepAnsiZoom(this.zoom'),
    'and steps the same clamped ladder the menu offers');
}

export async function zoomingKeepsTheArtworkToo(): Promise<void> {
  const fn = body('private async setZoom(');
  assert.ok(fn.length > 0, 'the method must exist to be checked');
  assert.ok(fn.includes('reopenEditorPreservingContent'),
    'zooming rebuilds the editor, so it must go through the same content-preserving path');
}
