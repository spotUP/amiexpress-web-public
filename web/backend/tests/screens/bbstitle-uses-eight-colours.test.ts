/**
 * BBSTITLE is eight-colour ANSI. No copy of it carries SGR 5.
 *
 * The sysop's 200-column telnet client showed seventeen glyphs blinking in the
 * title screen. They were not a board bug: the art itself said `ESC[5;33m`
 * and `ESC[5m` in front of seventeen `|` characters. In the BBS ANSI world
 * that parameter is ambiguous - a client with iCE colours on reads it as the
 * high-intensity BACKGROUND bit, and one without reads it as blink - and this
 * art declares neither: it has no SAUCE record. The sysop's ruling was that
 * THIS screen is plain eight-colour ANSI, so the parameter was stripped from
 * every copy of the file, leaving the rest of each sequence in place (a bare
 * `ESC[5m` went entirely, because `ESC[m` would have reset the colour under
 * the glyph, which the art never asked for).
 *
 * This pins that ruling by bytes: every BBSTITLE.txt git knows about, in
 * every node and conference, is free of SGR 5. A re-export from an editor with
 * iCE colours on fails here by path, instead of blinking at the next caller.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** An SGR sequence with 5 as one of its parameters, wherever it sits. */
const SGR_BLINK_RE = /\x1b\[(?:[0-9;]*;)?5(?:;[0-9;]*)?m/g;

function trackedTitleScreens(): string[] {
  return execFileSync('git', ['ls-files', '--', '*BBSTITLE.txt'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.length > 0);
}

describe('BBSTITLE uses eight ANSI colours', () => {
  const screens = trackedTitleScreens();

  it('the board still has title screens for this test to read', () => {
    // Screens/, Node0..40 and every conference: a glob that finds nothing
    // would pass the next test for free.
    expect(screens.length).toBeGreaterThanOrEqual(40);
  });

  it.each(screens)('%s carries no SGR 5 (blink / iCE background)', (screen) => {
    const bytes = fs.readFileSync(path.join(REPO_ROOT, screen), 'latin1');
    const blinks = bytes.match(SGR_BLINK_RE) ?? [];
    expect({ screen, blinks }).toEqual({ screen, blinks: [] });
  });
});
