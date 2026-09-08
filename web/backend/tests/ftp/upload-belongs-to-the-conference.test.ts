/**
 * An upload belongs to the conference it was sent to - whatever the SQL
 * mirror knows.
 *
 * `file_areas` on this board is seed data: four demo rows ("General Files",
 * `/files/general`) covering conferences 1 and 2 of fourteen, with paths
 * that exist nowhere. Everything downstream took `areas[0]`, so an FTP
 * caller in conference 3 and up was refused outright - "Cant upload here" -
 * while the same file uploaded at the menu was accepted; and one in
 * conference 1 was filed against a fictional area, saved only by the mover
 * falling back to `<conf>/Files`.
 *
 * The board itself knows where files go: `DLPATH.1` in `Conf<n>.info`
 * (express.e:15264), the same directory the download side reads. These pin
 * that the icon decides, that the mirror is filled in from it rather than
 * consulted, and that an FTP upload is described by its own FILE_ID.DIZ.
 */
process.env.SKIP_DB_INIT = '1';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseInfoFile, writeInfoFile, updateTooltype } from '../../src/utils/info-file.util';
import { destinationFor } from '../../src/services/upload-filing.service';

const REPO = path.resolve(__dirname, '../../../..');

/** A board whose Conf7 says, in its own icon, where its files live. */
function boardWithConference(n: number, dlPath?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-area-'));
  fs.mkdirSync(path.join(root, `Conf${n}`, 'Files'), { recursive: true });
  if (dlPath) {
    fs.mkdirSync(path.resolve(root, dlPath), { recursive: true });
    const icon = path.join(root, `Conf${n}.info`);
    fs.copyFileSync(path.join(REPO, 'Conf1.info'), icon);
    writeInfoFile(updateTooltype(parseInfoFile(icon), `DLPATH.1`, dlPath, false));
  }
  return root;
}

describe('where an upload lands', () => {
  it("is the conference's own DLPATH when the area has none", () => {
    const root = boardWithConference(7, 'Conf7/Uploads');
    expect(destinationFor(undefined, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
    expect(destinationFor(null, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
    expect(destinationFor({}, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
  });

  it("is the area's own dlPath when the sysop configured one", () => {
    const root = boardWithConference(7, 'Conf7/Uploads');
    expect(destinationFor({ dlPath: '/somewhere/else' }, 7, root)).toBe('/somewhere/else');
    // The seeded rows carry the process directory as a placeholder; that is
    // not a configured path and must not win over the board's own.
    expect(destinationFor({ dlPath: process.cwd() }, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
    expect(destinationFor({ dlPath: '   ' }, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
  });

  it('is undefined when the conference has no icon at all, so the mover falls back', () => {
    const root = boardWithConference(9);
    expect(destinationFor(undefined, 9, root)).toBeUndefined();
  });
});

describe('the FTP upload gate', () => {
  // The guard points the board's dataDir at a fixture per run, so this is
  // the real refuseUpload against a real board - not a grep of its source.
  const boardRoot = () => require('../../src/config').config.get('dataDir') as string;

  function conferenceWithFiles(n: number, dlPath: string): void {
    const root = boardRoot();
    fs.mkdirSync(path.resolve(root, dlPath), { recursive: true });
    const icon = path.join(root, `Conf${n}.info`);
    fs.copyFileSync(path.join(REPO, 'Conf1.info'), icon);
    writeInfoFile(updateTooltype(parseInfoFile(icon), 'DLPATH.1', dlPath, false));
  }

  it('lets a caller upload into a conference the SQL mirror has never heard of', async () => {
    conferenceWithFiles(11, 'Conf11/Files');
    const { boardFtpDeps } = require('../../src/ftp/ftp-auth');
    const refusal = await boardFtpDeps().refuseUpload!(
      { id: 'u', username: 'Knut' } as never, 11, 'DEMO.LHA'
    );
    // file_areas has no row for conference 11 - and that is not a reason.
    expect(refusal).toBeFalsy();
  });

  it('refuses when the conference has nowhere to put a file', async () => {
    // A conference number this board has no icon and no directory for: no
    // DLPATH, no Files/, nowhere for the bytes to go.
    const root = boardRoot();
    fs.rmSync(path.join(root, 'Conf37.info'), { force: true });
    fs.rmSync(path.join(root, 'Conf37'), { recursive: true, force: true });
    const { boardFtpDeps } = require('../../src/ftp/ftp-auth');
    const refusal = await boardFtpDeps().refuseUpload!(
      { id: 'u', username: 'Knut' } as never, 37, 'DEMO.LHA'
    );
    expect(refusal).toMatchObject({ code: 550, text: 'Cant upload here' });
  });

  it('still refuses a name the board would not accept', async () => {
    conferenceWithFiles(12, 'Conf12/Files');
    const { boardFtpDeps } = require('../../src/ftp/ftp-auth');
    const refusal = await boardFtpDeps().refuseUpload!(
      { id: 'u', username: 'Knut' } as never, 12, 'a name with spaces.lha'
    );
    expect(refusal).toMatchObject({ code: 553 });
  });

  it('describes the file by its own FILE_ID.DIZ, as a menu upload does', () => {
    // The extraction itself is file-diz.util's, tested there; what this pins
    // is that the FTP path calls it and keeps the placeholder as a fallback.
    const src = fs.readFileSync(path.join(REPO, 'web/backend/src/ftp/ftp-auth.ts'), 'utf8');
    const accept = src.slice(src.indexOf('async acceptUpload'));
    expect(accept).toMatch(/extractAndReadDiz\(playpenPath, nodeWorkDir/);
    expect(accept).toMatch(/description = dizLines\.join/);
    expect(accept).toMatch(/areaForConference\(request\.conferenceId/);
    expect(accept).not.toMatch(/areas\[0\]/);
  });
});
