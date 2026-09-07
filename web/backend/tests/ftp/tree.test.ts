/**
 * What an FTP caller may see, and what he is shown.
 *
 * Phase 3. The board has no directories - it has conferences a caller may or
 * may not hold access to, and file areas that are DIR text files. This drives
 * the layer that turns those into a tree over a REAL temp board: the DIR files
 * are written to disk and read back through `parseDirFile`, because a listing
 * assembled from a mocked reader would prove nothing about the grammar the
 * board actually writes.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  FtpFilesystem,
  conferenceDirectoryName,
  longListLine,
  resolvePath,
  type FtpConference,
} from '../../src/ftp/ftp-filesystem';

const SYSOP = { username: 'sysop', confAccess: 'XXXX' };
const MEMBER = { username: 'member', confAccess: 'X_XX' };

const CONFERENCES: FtpConference[] = [
  { conference_id: 1, name: 'General', ndirs: 1 },
  { conference_id: 2, name: 'Sysop Only', ndirs: 1 },
  { conference_id: 3, name: 'Files/Uploads', ndirs: 1 },
  { conference_id: 4, name: 'Off FTP', exclude_ftp: true, ndirs: 1 },
];

/** express.e's own rule, in miniature: position N of confAccess must be 'X'. */
function canAccess(user: unknown, conferenceId: number): boolean {
  const access = (user as { confAccess?: string }).confAccess ?? '';
  return access[conferenceId - 1] === 'X';
}

let root: string;
let tree: FtpFilesystem;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-tree-'));
  // Conference 1 gets a real DIR file, in the format the board writes.
  const confDir = path.join(root, 'Conf1');
  fs.mkdirSync(confDir, { recursive: true });
  fs.writeFileSync(
    path.join(confDir, 'DIR1'),
    // The board's own shape, copied from Conf1/DIR1: name(12) status size date desc.
    'UPROUGH.LHA  N 1234567  10-23-25         A demo release\r\n' +
      '                                 continued on a second line\r\n' +
      'SECOND.ZIP   N      42  01-01-26         Something small\r\n',
    'latin1'
  );

  tree = new FtpFilesystem({
    conferences: () => CONFERENCES,
    canAccess,
    bbsRoot: root,
  });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the root is the caller\'s own conference list', () => {
  it('shows a sysop every conference that is not marked off FTP', async () => {
    const names = (await tree.list(SYSOP, '/')).map((entry) => entry.name);

    expect(names).toEqual(['001-General', '002-Sysop Only', '003-FilesUploads']);
  });

  it('hides a conference the caller has no access to', async () => {
    // MEMBER's confAccess is X_XX: conference 2 is not his.
    const names = (await tree.list(MEMBER, '/')).map((entry) => entry.name);

    expect(names).toEqual(['001-General', '003-FilesUploads']);
    expect(names).not.toContain('002-Sysop Only');
  });

  it('hides an EXCLUDE_FTP conference from a caller who otherwise holds it', async () => {
    // 4 is 'X' for the sysop in confAccess and still absent above.
    expect(canAccess(SYSOP, 4)).toBe(true);
    expect((await tree.list(SYSOP, '/')).map((e) => e.name)).not.toContain('004-Off FTP');
  });

  it('strips a slash out of a conference name, so it cannot look like a path', () => {
    expect(conferenceDirectoryName({ conference_id: 3, name: 'Files/Uploads' })).toBe(
      '003-FilesUploads'
    );
  });

  it('every root row is a directory, so a client offers to enter it', async () => {
    expect((await tree.list(SYSOP, '/')).every((entry) => entry.isDirectory)).toBe(true);
  });
});

describe('inside a conference', () => {
  it('lists what the DIR file names, with its own sizes and dates', async () => {
    const entries = await tree.list(SYSOP, '/001-General');

    expect(entries.map((entry) => entry.name)).toEqual(['UPROUGH.LHA', 'SECOND.ZIP']);
    expect(entries[0].size).toBe(1234567);
    expect(entries[0].isDirectory).toBe(false);
    // The continuation line is part of the first entry's description, not a
    // file of its own - the grammar's own rule, and the thing a naive
    // line-per-file reader gets wrong.
    expect(entries).toHaveLength(2);
  });

  it('lists nothing for a conference with no DIR files rather than failing', async () => {
    await expect(tree.list(SYSOP, '/002-Sysop Only')).resolves.toEqual([]);
  });

  it('refuses to admit a conference the caller cannot see exists', () => {
    expect(tree.exists(MEMBER, '/002-Sysop Only')).toBe(false);
    expect(tree.exists(SYSOP, '/002-Sysop Only')).toBe(true);
    expect(tree.exists(SYSOP, '/')).toBe(true);
    expect(tree.exists(SYSOP, '/no-such-conference')).toBe(false);
  });
});

describe('where a path lands', () => {
  it('walks down, and back up with ..', () => {
    expect(resolvePath('/', '001-General')).toBe('/001-General');
    expect(resolvePath('/001-General', '..')).toBe('/');
    expect(resolvePath('/001-General', '/002-Sysop Only')).toBe('/002-Sysop Only');
    expect(resolvePath('/001-General', '.')).toBe('/001-General');
  });

  it('cannot be talked above the root', () => {
    // The obvious probe, and the one a client sends by accident when a user
    // types `cd ..` at the top.
    expect(resolvePath('/', '..')).toBeNull();
    expect(resolvePath('/001-General', '../..')).toBeNull();
    expect(resolvePath('/', '/../../etc')).toBeNull();
  });

  it('survives the shapes clients actually send', () => {
    expect(resolvePath('/', '//001-General//')).toBe('/001-General');
    expect(resolvePath('/001-General', '')).toBe('/001-General');
  });
});

describe('the LIST row', () => {
  const file = {
    name: 'UPROUGH.LHA',
    isDirectory: false,
    size: 1234567,
    modified: new Date('2026-09-01T12:34:00Z'),
  };

  it('has the nine fields every client parses', () => {
    const line = longListLine(file, new Date('2026-09-07T00:00:00Z'));

    // permissions, links, owner, group, size, month, day, time, name
    expect(line.split(/\s+/)).toHaveLength(9);
    expect(line.startsWith('-rw-r--r--')).toBe(true);
    expect(line.endsWith(' UPROUGH.LHA')).toBe(true);
    expect(line).toContain('1234567');
  });

  it('marks a directory as one, or a client will not enter it', () => {
    expect(longListLine({ ...file, isDirectory: true, name: '001-General' })).toMatch(
      /^drwxr-xr-x/
    );
  });

  it('shows a year instead of a time once the file is old', () => {
    const old = { ...file, modified: new Date('2019-03-04T10:00:00Z') };
    const line = longListLine(old, new Date('2026-09-07T00:00:00Z'));

    expect(line).toContain('2019');
    expect(line).not.toMatch(/\d\d:\d\d/);
  });
});
