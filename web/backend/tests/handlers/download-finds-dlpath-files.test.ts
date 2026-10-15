/**
 * A file the board WROTE is a file the board can find again.
 *
 * The two halves disagreed. `moveToFiles` puts an upload in the area's
 * `DLPATH` (express.e:15264); `resolveFile` looked only in `<confDir>/Files`
 * and `<confDir>/Upload`. On a board whose DLPATH points somewhere else - the
 * live one does, `Conf2.info` saying `DLPATH.1=BBS:Conf3/Files` and
 * `Conf3.info` saying `BBS:Conf5/Files` - a file uploaded through the BBS
 * could never be downloaded again.
 *
 * It surfaced over FTP on 2026-09-07 ("the board lists it, but its bytes are
 * not here"), but it was never an FTP bug: `D` at the menu had the same blind
 * spot and answered "File not found". Both call `resolveFile`, so both are
 * fixed by it searching DLPATH first.
 *
 * The board here is built the way the live one is configured: the conference's
 * DIRECTORY is `Conf2`, and its files live in `Conf3/Files`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { conferenceDownloadDirs } from '../../src/conferences/conference-paths';
import { resolveFile } from '../../src/handlers/transfer/batch-download.handler';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dlpath-'));

  // Conference 1 lives in Conf2 ...
  fs.writeFileSync(
    path.join(root, 'ConfConfig.info'),
    ['NCONFS=1', 'NAME.1=Amiga Demoscene', 'LOCATION.1=BBS:Conf2/', ''].join('\n')
  );
  // ... and its downloads live in Conf3/Files, per its own icon.
  fs.writeFileSync(
    path.join(root, 'Conf2.info'),
    ['DLPATH.1=BBS:Conf3/Files', 'ULPATH.1=BBS:Conf3/Upload', ''].join('\n')
  );

  fs.mkdirSync(path.join(root, 'Conf2', 'Files'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf3', 'Files'), { recursive: true });

  fs.writeFileSync(path.join(root, 'Conf3', 'Files', 'DEMO.LHA'), 'the real bytes');
  // A file in the CONVENTIONAL place too, so the fallback is still proved.
  fs.writeFileSync(path.join(root, 'Conf2', 'Files', 'OLD.LHA'), 'older bytes');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('where a conference keeps its downloads', () => {
  it('reads DLPATH out of the conference icon, resolving the Amiga assign', () => {
    expect(conferenceDownloadDirs(root, 1)).toEqual([path.join(root, 'Conf3', 'Files')]);
  });

  it('answers nothing for a conference with no icon, rather than throwing', () => {
    // A missing icon is a board without that tooltype, not an error - the
    // caller falls back to the conventional directories.
    expect(conferenceDownloadDirs(root, 7)).toEqual([]);
  });
});

describe('resolving a file for download', () => {
  it('finds the file where the board WROTE it, not only under <conf>/Files', async () => {
    // The regression: this returned null, and the caller was told the file
    // did not exist - over FTP and at the D prompt alike.
    const found = await resolveFile(root, 1, 'DEMO.LHA', null);

    expect(found).not.toBeNull();
    expect(found!.fullPath).toBe(path.join(root, 'Conf3', 'Files', 'DEMO.LHA'));
    expect(found!.size).toBe('the real bytes'.length);
  });

  it('still finds one in the conventional directory', async () => {
    const found = await resolveFile(root, 1, 'OLD.LHA', null);

    expect(found!.fullPath).toBe(path.join(root, 'Conf2', 'Files', 'OLD.LHA'));
  });

  it('still says null for a file that is genuinely not there', async () => {
    // The sysop's own stale DIR entry stays a stale DIR entry: this must not
    // start finding files by accident.
    await expect(resolveFile(root, 1, 'NOTHERE.LHA', null)).resolves.toBeNull();
  });
});
