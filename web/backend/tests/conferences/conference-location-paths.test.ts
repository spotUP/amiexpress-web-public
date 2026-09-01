/**
 * A conference IS a position, and its DIRECTORY is whatever LOCATION.n says.
 *
 * express.e:31849 walks `FOR i:=1 TO cmds.numConf` reading NAME.i and
 * LOCATION.i - the directory is never derived from the number. Deleting a
 * conference renumbers the board (conference-removal.service.ts) by shifting
 * NAME.n/LOCATION.n down and renaming the icons, deliberately leaving the
 * directories where they are, because the files and messages inside them
 * belong to the conference and not to its position.
 *
 * So after deleting conference 1 on a live board:
 *
 *   NAME.1=Amiga Warez!   LOCATION.1=BBS:Conf2/
 *
 * Every reader that builds `Conf<n>` from the number then looks in the
 * directory of the conference that was DELETED. Reported 2026-09-01: file
 * listing showed nothing for the conference that had moved into position 1.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getConferenceDir, getRootConferenceDir } from '../../src/utils/file-hold.util';
import { conferenceDir } from '../../src/conferences/conference-paths';

let root: string;

function writeConfConfig(entries: { name: string; location: string }[]): void {
  const lines = [`NCONFS=${entries.length}`];
  entries.forEach((entry, i) => {
    lines.push(`NAME.${i + 1}=${entry.name}`);
    lines.push(`LOCATION.${i + 1}=${entry.location}`);
  });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), lines.join('\n') + '\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-paths-'));
  fs.mkdirSync(path.join(root, 'Conf2', 'Files'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf3'), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a renumbered board', () => {
  beforeEach(() => {
    // What the live board looked like after the sysop deleted conference 1.
    writeConfConfig([
      { name: 'Amiga Warez!', location: 'BBS:Conf2/' },
      { name: 'Abandoned Apps', location: 'BBS:Conf3/' },
    ]);
  });

  test('conference 1 resolves to the directory LOCATION.1 names', () => {
    expect(conferenceDir(root, 1)).toBe(path.join(root, 'Conf2'));
  });

  test('conference 2 resolves to LOCATION.2, not Conf2', () => {
    expect(conferenceDir(root, 2)).toBe(path.join(root, 'Conf3'));
  });

  test('the file-listing resolver every file command uses agrees', () => {
    expect(getConferenceDir(1, root)).toBe(path.join(root, 'Conf2'));
    expect(getRootConferenceDir(1, root)).toBe(path.join(root, 'Conf2'));
  });
});

describe('a board that has never been renumbered', () => {
  test('falls back to Conf<n> when there is no ConfConfig.info at all', () => {
    expect(conferenceDir(root, 4)).toBe(path.join(root, 'Conf4'));
    expect(getConferenceDir(4, root)).toBe(path.join(root, 'Conf4'));
  });

  test('falls back to Conf<n> when the entry has no LOCATION', () => {
    writeConfConfig([{ name: 'General', location: '' }]);

    expect(conferenceDir(root, 1)).toBe(path.join(root, 'Conf1'));
  });

  test('a conference above NCONFS still answers something usable', () => {
    writeConfConfig([{ name: 'General', location: 'BBS:Conf2/' }]);

    expect(conferenceDir(root, 9)).toBe(path.join(root, 'Conf9'));
  });
});

describe('the LOCATION value itself', () => {
  test('an assign other than BBS: is resolved, not pasted onto the board root', () => {
    writeConfConfig([{ name: 'Elsewhere', location: 'BBS:Conf3/' }]);

    expect(conferenceDir(root, 1)).toBe(path.join(root, 'Conf3'));
  });

  test('a trailing slash does not become part of the directory name', () => {
    writeConfConfig([{ name: 'Amiga Warez!', location: 'BBS:Conf2/' }]);

    expect(conferenceDir(root, 1).endsWith(path.sep)).toBe(false);
  });

  test('the answer follows an edit to ConfConfig.info without a restart', () => {
    writeConfConfig([{ name: 'Amiga Warez!', location: 'BBS:Conf2/' }]);
    expect(conferenceDir(root, 1)).toBe(path.join(root, 'Conf2'));

    writeConfConfig([{ name: 'Amiga Warez!', location: 'BBS:Conf3/' }]);
    expect(conferenceDir(root, 1)).toBe(path.join(root, 'Conf3'));
  });
});
