/**
 * Starting the board must not create a screen file.
 *
 * `displayScreen` answers TRUE for any file that OPENS (express.e:6773-6774),
 * and the flow pauses on that answer (express.e:28556). So a 0-byte screen is
 * a blank terminal and a `(Pause)...Space To Resume:` with nothing above it,
 * while an ABSENT screen is skipped in silence.
 *
 * Startup was creating four of them - `BBSTITLE.TXT`, `LOGON.TXT`,
 * `MENU.TXT`, `LOGOFF.TXT` - empty, on every boot, in a function whose own
 * comment explained why that is exactly wrong and then exempted only
 * BULL/NODE_BULL/CONF_BULL from it. LOGON pauses just like BULL does.
 *
 * It was doing it on the live board tonight. The sysop, 2026-09-14: "i get an
 * empty prompt after loging in with ansi mode", and "it has been like this for
 * a while". Removing the 161 hollow screens from the repository (93e12958a)
 * and the eleven on the volume by hand were both the symptom: the next
 * container start wrote a fresh `Screens/LOGON.TXT` at 15:11:34 UTC, on a
 * board where it had been gone for twenty minutes. THAT measurement is what
 * this test exists to keep true.
 *
 * Driven through the real startup function against a real empty directory,
 * because the defect was a file appearing on disk and nothing short of looking
 * at the disk would have seen it.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ensureScreensDirectory } from '../../src/services/file-areas-loader';

/** A board with nothing in it, the way a fresh install arrives. */
function anEmptyBoard(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blank-screen-boot-'));
}

describe('starting the board on a fresh install', () => {
  it('creates no screen files at all', async () => {
    const root = anEmptyBoard();

    await ensureScreensDirectory(root);

    const made = fs.readdirSync(path.join(root, 'Screens'));
    // Named, not counted: whoever breaks this needs to know WHICH screen came
    // back, because that is the one that will pause on a blank terminal.
    expect(made).toEqual([]);
  });

  it('does not bring back the logon screen in particular', async () => {
    // The one that actually bit: recreated at every container start, which is
    // why removing it from the repo and from the volume both looked like they
    // had not worked.
    const root = anEmptyBoard();

    await ensureScreensDirectory(root);

    expect(fs.existsSync(path.join(root, 'Screens', 'LOGON.TXT'))).toBe(false);
  });

  it('still makes the directory, so a screen can be written into it', async () => {
    // The part that WAS wanted: the screens editor needs somewhere to put the
    // first file. Dropping the directory too would trade one bug for another.
    const root = anEmptyBoard();

    await ensureScreensDirectory(root);

    expect(fs.statSync(path.join(root, 'Screens')).isDirectory()).toBe(true);
  });

  it('leaves a screen that already has content alone', async () => {
    // The round trip. This never overwrote anything and must not start: a
    // board's real MENU.TXT is 4,273 bytes on the live volume.
    const root = anEmptyBoard();
    fs.mkdirSync(path.join(root, 'Screens'));
    fs.writeFileSync(path.join(root, 'Screens', 'MENU.TXT'), 'THE MENU\r\n', 'latin1');

    await ensureScreensDirectory(root);

    expect(fs.readFileSync(path.join(root, 'Screens', 'MENU.TXT'), 'latin1')).toBe('THE MENU\r\n');
  });

  it('is safe to run twice, as a restart does', async () => {
    const root = anEmptyBoard();

    await ensureScreensDirectory(root);
    await ensureScreensDirectory(root);

    expect(fs.readdirSync(path.join(root, 'Screens'))).toEqual([]);
  });
});
