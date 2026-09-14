/**
 * ConfTop has to fit the 25 rows a caller has.
 *
 * "more screens are cutt off in the bbs" (the sysop, 2026-09-14), with a
 * screenshot of the conference-join bulletin whose uploader list began at
 * slot 5 - rows 1 to 4 had already scrolled off the top.
 *
 * ConfTop prints SIX rows of chrome and then one row per `ROWS`: the
 * conference line, a blank, the column heading, its rule, then the slots, a
 * blank and the totals. Measured off the real output the board had just
 * written (`Conf5/Bulletins/conftop.txt`, 26 lines at `ROWS=20`). So the
 * height is `6 + ROWS`, and `ROWS=20` is a 26-row screen on a 25-row
 * terminal - over budget before the join has printed a word of its own.
 *
 * The join then adds its own tail after the bulletin - "Joining Conference",
 * the message stats, the pause - so the bulletin cannot have all 25 either.
 * `ROWS=12` leaves it 18 and the join its 6.
 *
 * `SKIP_EMPTY_LINES` is the other half and the one that made it absurd: with
 * no uploaders, ConfTop still printed twenty numbered blank slots. It is a
 * documented tooltype (Conftop.Guide, "Available Tooltypes") and nothing on
 * this board set it.
 *
 * Read off the ICONS rather than a render, because the setting is the defect:
 * the door is a 68K binary we do not build, and its only lever is what its
 * icon declares.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Rows ConfTop spends on chrome, whatever `ROWS` says. */
const CHROME_ROWS = 6;
/** What a caller's terminal shows without scrolling. */
const SCREEN_ROWS = 25;
/** "Joining Conference", the message stats and the pause, after the bulletin. */
const JOIN_TAIL_ROWS = 6;

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** Every conference icon that configures ConfTop, by conference directory. */
function conftopIcons(): { name: string; file: string }[] {
  return fs
    .readdirSync(REPO_ROOT)
    .filter(entry => /^Conf\d+$/.test(entry))
    .map(name => ({ name, file: path.join(REPO_ROOT, name, 'Conftop.info') }))
    .filter(({ file }) => fs.existsSync(file));
}

/** Tooltypes as plain strings - an icon is binary, the tooltypes are ASCII. */
function tooltypes(file: string): string[] {
  const bytes = fs.readFileSync(file).toString('latin1');
  return [...bytes.matchAll(/[A-Z][A-Z0-9_]{2,}(?:=[^\x00]*)?/g)].map(m => m[0]);
}

describe('a conference top-uploaders bulletin', () => {
  it('is configured somewhere at all', () => {
    // If this board stops shipping conference icons the rest of the file
    // would pass by testing nothing.
    expect(conftopIcons().length).toBeGreaterThan(0);
  });

  it.each(conftopIcons())('fits a caller screen in $name', ({ file }) => {
    const rows = tooltypes(file)
      .map(tt => /^ROWS=(\d+)$/.exec(tt)?.[1])
      .find(Boolean);

    expect(rows).toBeDefined();
    expect(CHROME_ROWS + Number(rows)).toBeLessThanOrEqual(SCREEN_ROWS - JOIN_TAIL_ROWS);
  });

  it.each(conftopIcons())('does not print empty slots in $name', ({ file }) => {
    // Without this an empty conference is twenty numbered blank rows, which
    // is what pushed the top of the list off the screen.
    expect(tooltypes(file)).toContain('SKIP_EMPTY_LINES');
  });
});
