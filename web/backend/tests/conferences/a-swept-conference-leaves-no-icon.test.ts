/**
 * Sweeping an orphan conference must take its icon with it.
 *
 * Deleting a conference shifts `NAME.n`/`LOCATION.n` down and leaves the
 * DIRECTORY behind on purpose - the messages and files in it belong to the
 * conference, not to its position, so the sysop decides whether they go. The
 * admin can then sweep that directory.
 *
 * It swept the directory and left `Conf<n>.info` where it was, for ever.
 * Nothing looked at the icon again: `listOrphanConferenceDirs` filtered on
 * `entry.isDirectory()`, so an icon with no directory was invisible to the one
 * tool built to find dead conferences.
 *
 * That is not theoretical. The live board carries five conferences
 * (`ConfConfig.info`, `NCONFS=5`) and fourteen `Conf<n>.info` files, and on
 * 2026-09-14 I read the icons as the conference list and opted nine
 * conferences that do not exist into a message-base door. The sysop:
 * "the live bbs dont have 14 confereces........." and then "why do we have
 * phantom conferences when i removed them via the admin ui? fix the root
 * issue".
 *
 * THE ICON IS POSITIONAL, unlike the directory. express.e walks `NAME.i` /
 * `LOCATION.i` for `i := 1 TO NCONFS` and reads conference i's settings from
 * `Conf<i>.info`, so the icons shift down on removal and an icon numbered
 * above NCONFS is dead by arithmetic - no `LOCATION` lookup needed. The
 * directory is the opposite: it is whatever `LOCATION.n` names and is never
 * derived from the number.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  listOrphanConferenceDirs,
  removeOrphanConferenceDir,
} from '../../src/conferences/orphan-conference-dirs';
import { applyTooltypes } from '../../src/utils/info-file.util';

/**
 * A board declaring `live` conferences, with `onDisk` numbered icons and
 * directories actually present.
 *
 * Written through the board's own icon writer - a `.info` is a binary Amiga
 * icon and a hand-rolled one would not parse.
 */
function aBoardWith(live: number, onDisk: number[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-conf-'));
  const entries: [string, string][] = [['NCONFS', String(live)]];
  for (let n = 1; n <= live; n++) {
    entries.push([`NAME.${n}`, `Conference ${n}`]);
    entries.push([`LOCATION.${n}`, `BBS:Conf${n}/`]);
  }
  applyTooltypes(path.join(root, 'ConfConfig.info'), entries);
  for (const n of onDisk) {
    fs.mkdirSync(path.join(root, `Conf${n}`), { recursive: true });
    fs.writeFileSync(path.join(root, `Conf${n}`, 'marker'), 'x', 'latin1');
    applyTooltypes(path.join(root, `Conf${n}.info`), [['NDIRS', '1']]);
  }
  return root;
}

const names = (root: string) => listOrphanConferenceDirs(root).map(o => o.dir);

describe('an orphan conference on a board that declares five', () => {
  it('is reported when only its icon is left', () => {
    // The state the old sweep left behind, and the one nothing could see.
    const root = aBoardWith(5, [1, 2, 3, 4, 5]);
    applyTooltypes(path.join(root, 'Conf9.info'), [['NDIRS', '1']]);

    expect(names(root)).toContain('Conf9');
  });

  it('says which halves of it are on disk', () => {
    const root = aBoardWith(5, [1, 2, 3, 4, 5, 9]);

    const nine = listOrphanConferenceDirs(root).find(o => o.dir === 'Conf9');
    expect(nine).toMatchObject({ hasDirectory: true, hasIcon: true });
  });

  it('takes the icon with the directory when swept', () => {
    // The defect in one assertion: the directory went, the icon stayed.
    const root = aBoardWith(5, [1, 2, 3, 4, 5, 9]);

    removeOrphanConferenceDir(root, 'Conf9');

    expect(fs.existsSync(path.join(root, 'Conf9'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'Conf9.info'))).toBe(false);
  });

  it('leaves nothing for a second sweep to find', () => {
    const root = aBoardWith(5, [1, 2, 3, 4, 5, 9]);

    removeOrphanConferenceDir(root, 'Conf9');

    expect(names(root)).toEqual([]);
  });

  it('removes an icon-only orphan that an earlier sweep stranded', () => {
    const root = aBoardWith(5, [1, 2, 3, 4, 5]);
    applyTooltypes(path.join(root, 'Conf9.info'), [['NDIRS', '1']]);

    removeOrphanConferenceDir(root, 'Conf9');

    expect(fs.existsSync(path.join(root, 'Conf9.info'))).toBe(false);
  });

  it('never touches a conference the board still declares', () => {
    // The round trip, and the one that matters: conference 3 is live, so both
    // its directory and its icon are untouchable however the sweep is asked.
    const root = aBoardWith(5, [1, 2, 3, 4, 5]);

    expect(names(root)).toEqual([]);
    expect(() => removeOrphanConferenceDir(root, 'Conf3')).toThrow(/conference 3/);
    expect(fs.existsSync(path.join(root, 'Conf3.info'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'Conf3'))).toBe(true);
  });

  it('refuses when the board has no conference list to check against', () => {
    // Unchanged: with no ConfConfig.info nothing is KNOWN to be dead, so the
    // sweep guesses at nothing.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-noconf-'));
    applyTooltypes(path.join(root, 'Conf9.info'), [['NDIRS', '1']]);

    expect(names(root)).toEqual([]);
    expect(() => removeOrphanConferenceDir(root, 'Conf9')).toThrow(/ConfConfig\.info/);
  });
});
