/**
 * BBSTITLE declares iCE colours, and the board honours the declaration.
 *
 * The sysop's 200-column telnet client showed seventeen glyphs blinking in the
 * title screen: the art says `ESC[5;33m` and `ESC[5m` in front of seventeen
 * `|` characters. That parameter is ambiguous in BBS ANSI - a client with iCE
 * colours on reads it as the high-intensity BACKGROUND bit, one without reads
 * it as blink - and the SAUCE record is what settles it. Moebius wrote one
 * (iCE = 1, 80 columns, Amiga Topaz 2+), and commit 56f16c3e2 on 2025-12-10
 * stripped it by hand. From then on nothing said iCE, the board's own
 * transform (`transformIceColors`, run by `readAmigaTextFileWithTransforms`
 * for every screen) never ran on the file, and the 5 reached every caller.
 *
 * Restored, the record is the single source of truth: the artist's bytes are
 * back exactly, and the board turns the bit into bright black under those
 * seventeen glyphs before a caller sees them. This pins both halves - the
 * declaration in every copy of the file, and the reader's output through the
 * real read path - so a re-export that loses the record, or a reader that
 * stops honouring it, fails here by path instead of blinking at the next
 * caller.
 */
process.env.SKIP_DB_INIT = '1';

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseSauceMetadata,
  readAmigaTextFileWithTransforms,
} from '../../src/utils/amiga-text-decode.util';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** An SGR sequence with 5 as one of its parameters, wherever it sits. */
const SGR_BLINK_RE = /\x1b\[(?:[0-9;]*;)?5(?:;[0-9;]*)?m/g;

function trackedTitleScreens(): string[] {
  return execFileSync('git', ['ls-files', '--', '*BBSTITLE.txt'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.length > 0);
}

describe('BBSTITLE declares iCE colours and the board honours it', () => {
  const screens = trackedTitleScreens();

  it('the board still has title screens for this test to read', () => {
    // Screens/, Node0..40 and every conference: a glob that finds nothing
    // would pass the next tests for free.
    expect(screens.length).toBeGreaterThanOrEqual(40);
  });

  it.each(screens)('%s carries the SAUCE record with iCE colours on', (screen) => {
    const sauce = parseSauceMetadata(fs.readFileSync(path.join(REPO_ROOT, screen)));
    expect({ screen, hasSauce: sauce.hasSauce, iceColors: sauce.iceColors, columns: sauce.tInfo1 })
      .toEqual({ screen, hasSauce: true, iceColors: true, columns: 80 });
  });

  it('the artist\'s seventeen iCE glyphs are still in the file - the bytes were not edited', () => {
    const bytes = fs.readFileSync(path.join(REPO_ROOT, 'Screens/BBSTITLE.txt'), 'latin1');
    expect((bytes.match(SGR_BLINK_RE) ?? []).length).toBe(17);
  });

  it('what the board reads for a caller has no SGR 5 left and paints those glyphs on bright black', () => {
    const shown = readAmigaTextFileWithTransforms(path.join(REPO_ROOT, 'Screens/BBSTITLE.txt'));
    expect(shown.iceColors).toBe(true);
    expect(shown.text.match(SGR_BLINK_RE) ?? []).toEqual([]);
    expect((shown.text.match(/\x1b\[(?:0;)?33;100m\|/g) ?? []).length + (shown.text.match(/\x1b\[100m\|/g) ?? []).length)
      .toBe(17);
  });
});
