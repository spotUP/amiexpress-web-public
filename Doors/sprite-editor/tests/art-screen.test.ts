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
import { newFileContent } from '../art-screen';
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
