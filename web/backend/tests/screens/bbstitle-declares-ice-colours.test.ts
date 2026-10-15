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
 * That was the first fix: restore the record and let `transformIceColors` turn
 * the 5 into bright black on the way out, leaving the artist's bytes alone.
 *
 * IT WAS NOT ENOUGH, AND THE ART IS NOW CLEAN AT SOURCE. The blink kept coming
 * back for the sysop after every deploy - the build's `collapse-default-screens`
 * step rebuilds the shipped node screens, and four attempts had fixed files it
 * overwrites - so `1bcd126d8 fix(screens): the node title screens do not blink,
 * at their source` took the 5 out of all 41 node title files instead. That is
 * the stronger guarantee: a caller cannot blink on a client that ignores SAUCE,
 * or through any path that skips the transform, because there is no 5 to read.
 * (The blink was never visible in the web UI at all - xterm.js does not render
 * SGR-5 - so only `telnet bbs.uprough.net 64128` ever proved it either way.)
 *
 * So this pins the state that actually ships: every tracked title screen still
 * DECLARES iCE in its SAUCE record (the colours under those glyphs depend on
 * it), and none of them carries an SGR 5 for anything to interpret. A
 * re-export that loses the record, or one that brings the blink back, fails
 * here instead of at the next caller's terminal.
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

  it.each(screens)('%s carries no SGR 5 at source, so no client can blink it', (screen) => {
    const bytes = fs.readFileSync(path.join(REPO_ROOT, screen), 'latin1');
    expect({ screen, blinks: (bytes.match(SGR_BLINK_RE) ?? []).length })
      .toEqual({ screen, blinks: 0 });
  });

  it('what the board reads for a caller still declares iCE and carries no SGR 5', () => {
    const shown = readAmigaTextFileWithTransforms(path.join(REPO_ROOT, 'Node1/BBSTITLE.txt'));
    expect(shown.iceColors).toBe(true);
    expect(shown.text.match(SGR_BLINK_RE) ?? []).toEqual([]);
  });
});
