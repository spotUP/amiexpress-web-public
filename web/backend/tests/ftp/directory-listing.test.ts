/**
 * The other listing express has, and the subdirectories only it can describe.
 *
 * ftpd.e:1166-1174 chooses the source:
 *
 *   inside a subdirectory       -> the DLPATH directories (makeFtpListFromDlDirs)
 *   FTP_NO_DIRLIST on the conf  -> the DLPATH directories
 *   otherwise                   -> the DIR files (makeFtpListFromDirList)
 *
 * The catalogue is the default and stays it. What is driven here is the other
 * two branches: a conference the sysop has marked, and the subdirectories a
 * catalogue has no way of describing at all.
 *
 * The board is built the way this one is configured - the conference's
 * DIRECTORY is `Conf2`, its DLPATH is `Conf3/Files` - because that split is
 * exactly what a naive implementation gets wrong.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FtpFilesystem, type FtpConference } from '../../src/ftp/ftp-filesystem';

const SYSOP = { username: 'sysop', confAccess: 'XX' };
const CONFERENCES: FtpConference[] = [
  { conference_id: 1, name: 'Amiga Demoscene' },
  { conference_id: 2, name: 'Catalogued' },
];

let root: string;
let dlDir: string;

/** A tree with two DLPATHs, a subdirectory, and a stale file in one of them. */
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-dirlist-'));
  dlDir = path.join(root, 'Conf3', 'Files');
  fs.mkdirSync(path.join(dlDir, 'Demos'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf3', 'Upload'), { recursive: true });

  fs.writeFileSync(path.join(dlDir, 'FRESH.LHA'), 'recent bytes');
  fs.writeFileSync(path.join(dlDir, 'Demos', 'INSIDE.LHA'), 'nested bytes');
  fs.writeFileSync(path.join(root, 'Conf3', 'Upload', 'FROM-UPLOAD.LHA'), 'other dlpath');

  // Old enough to fall outside any sane FTP_DIR_DAYS.
  const ancient = new Date(Date.now() - 400 * 86_400_000);
  fs.writeFileSync(path.join(dlDir, 'STALE.LHA'), 'old bytes');
  fs.utimesSync(path.join(dlDir, 'STALE.LHA'), ancient, ancient);

  // Conference 2 keeps a catalogue and no directories, so the default branch
  // is still exercised alongside.
  fs.mkdirSync(path.join(root, 'Conf9'), { recursive: true });
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function tree(options: { marked?: boolean; days?: number } = {}): FtpFilesystem {
  return new FtpFilesystem({
    conferences: () => CONFERENCES,
    canAccess: () => true,
    bbsRoot: root,
    listingDays: () => options.days ?? 0,
    downloadDirs: (conferenceId) =>
      conferenceId === 1 ? [dlDir, path.join(root, 'Conf3', 'Upload')] : [],
    listsDirectories: (conferenceId) => Boolean(options.marked) && conferenceId === 1,
  });
}

describe('a conference marked FTP_NO_DIRLIST', () => {
  it('lists what is on disk, across every DLPATH', async () => {
    const names = (await tree({ marked: true }).list(SYSOP, '/001-Amiga Demoscene'))
      .map((entry) => entry.name)
      .sort();

    // Both DLPATHs contribute, and the subdirectory appears as a directory.
    expect(names).toEqual(['Demos', 'FRESH.LHA', 'FROM-UPLOAD.LHA', 'STALE.LHA']);
  });

  it('marks the subdirectory as one, so a client offers to enter it', async () => {
    const rows = await tree({ marked: true }).list(SYSOP, '/001-Amiga Demoscene');

    expect(rows.find((row) => row.name === 'Demos')?.isDirectory).toBe(true);
    expect(rows.find((row) => row.name === 'FRESH.LHA')?.isDirectory).toBe(false);
  });

  it('carries each file\'s real size and its own path', async () => {
    const rows = await tree({ marked: true }).list(SYSOP, '/001-Amiga Demoscene');
    const fresh = rows.find((row) => row.name === 'FRESH.LHA')!;

    expect(fresh.size).toBe('recent bytes'.length);
    // The path is what lets RETR skip resolution: the file was found on disk.
    expect(fresh.hostPath).toBe(path.join(dlDir, 'FRESH.LHA'));
  });

  it('bounds files by FTP_DIR_DAYS but never hides a directory', async () => {
    const rows = await tree({ marked: true, days: 30 }).list(SYSOP, '/001-Amiga Demoscene');
    const names = rows.map((row) => row.name).sort();

    expect(names).not.toContain('STALE.LHA');
    // Hiding a directory would hide everything under it, however old the
    // directory's own timestamp happens to be.
    expect(names).toContain('Demos');
  });

  it('leaves an unmarked conference on the catalogue', async () => {
    // Conference 2 has no DLPATHs at all: the default branch reads DIR files,
    // finds none, and lists nothing rather than falling into the walk.
    await expect(tree().list(SYSOP, '/002-Catalogued')).resolves.toEqual([]);
  });
});

describe('walking into a subdirectory', () => {
  it('lists what is inside it, whatever the conference is marked', async () => {
    // NOT marked: a subdirectory always comes from the directories, because
    // the catalogue has no notion of one (ftpd.e:1167).
    const rows = await tree().list(SYSOP, '/001-Amiga Demoscene/Demos');

    expect(rows.map((row) => row.name)).toEqual(['INSIDE.LHA']);
  });

  it('admits the subdirectory exists, so CWD into it succeeds', () => {
    expect(tree().exists(SYSOP, '/001-Amiga Demoscene/Demos')).toBe(true);
  });

  it('still refuses a subdirectory that is not there', () => {
    expect(tree().exists(SYSOP, '/001-Amiga Demoscene/Nonsense')).toBe(false);
  });

  it('finds a nested file by path, for SIZE, MDTM and RETR', async () => {
    const found = await tree().find(SYSOP, '/001-Amiga Demoscene/Demos/INSIDE.LHA');

    expect(found?.size).toBe('nested bytes'.length);
    expect(found?.hostPath).toBe(path.join(dlDir, 'Demos', 'INSIDE.LHA'));
  });
});
