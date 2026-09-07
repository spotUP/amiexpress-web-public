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
  DEFAULT_LISTING_DAYS,
  FtpFilesystem,
  machineListLine,
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
    // No date bound in THIS file: its DIR entries carry fixed dates and what
    // is under test is the grammar and the access rules. The bound has its
    // own block below, where the dates are relative on purpose.
    listingDays: () => 0,
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

describe('how far back a listing reaches', () => {
  /**
   * ftpd.e:1157-1163. `FTP_DIR_DAYS`, defaulting to TEN days, and `makeList`
   * emits a row only when its date is newer. An express listing is what
   * arrived recently, not the conference's whole history - the sysop met the
   * other behaviour when his client listed a file whose bytes had long gone.
   */
  const dated = (name: string, when: string) =>
    `${name.padEnd(12)} N ${String(1024).padStart(7)}  ${when}         A file\r\n`;

  let bounded: string;

  beforeAll(() => {
    bounded = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-days-'));
    fs.mkdirSync(path.join(bounded, 'Conf1'), { recursive: true });
    const today = new Date();
    const stamp = (daysAgo: number) => {
      const d = new Date(today.getTime() - daysAgo * 86_400_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getFullYear() % 100)}`;
    };
    fs.writeFileSync(
      path.join(bounded, 'Conf1', 'DIR1'),
      dated('FRESH.LHA', stamp(1)) + dated('STALE.LHA', stamp(400)),
      'latin1'
    );
  });

  afterAll(() => fs.rmSync(bounded, { recursive: true, force: true }));

  const treeWith = (days?: number) =>
    new FtpFilesystem({
      conferences: () => [{ conference_id: 1, name: 'General' }],
      canAccess: () => true,
      bbsRoot: bounded,
      ...(days === undefined ? {} : { listingDays: () => days }),
    });

  it('drops an entry older than the bound', async () => {
    expect((await treeWith(30).list(SYSOP, '/001-General')).map((e) => e.name)).toEqual([
      'FRESH.LHA',
    ]);
  });

  it('defaults to ten days when the sysop has not said', async () => {
    expect((await treeWith().list(SYSOP, '/001-General')).map((e) => e.name)).toEqual([
      'FRESH.LHA',
    ]);
    expect(DEFAULT_LISTING_DAYS).toBe(10);
  });

  it('lists everything when the sysop asks for no bound', async () => {
    expect((await treeWith(0).list(SYSOP, '/001-General')).map((e) => e.name)).toEqual([
      'FRESH.LHA',
      'STALE.LHA',
    ]);
  });
});

describe('the LIST row', () => {
  const file = {
    name: 'UPROUGH.LHA',
    isDirectory: false,
    size: 1234567,
    modified: new Date('2026-09-01T12:34:00Z'),
  };

  /**
   * ftpd.e:885-897. `-r--r--r--   1 root  root %10d %s %s`, the date being
   * `MMM-DD-YYYY HH:MM` (ftpd.e:660). Read-only and `root root` because
   * nothing a caller sees here is his to change.
   */
  it('is express\'s own row, field for field', () => {
    expect(longListLine(file)).toMatch(
      /^-r--r--r--   1 root  root {4}1234567 [A-Z][a-z]{2}-\d{2}-\d{4} \d{2}:\d{2} UPROUGH\.LHA$/
    );
  });

  it('marks a directory, and gives it size zero as express does', () => {
    const line = longListLine({ ...file, isDirectory: true, name: '001-General' });

    expect(line.startsWith('dr--r--r--')).toBe(true);
    expect(line).toContain('         0 ');
    expect(line.endsWith(' 001-General')).toBe(true);
  });

  it('keeps the date in one field, whatever its age', () => {
    // The Unix format switches to a year after six months, which changes the
    // COLUMN COUNT - a client splitting on whitespace then reads a different
    // filename for an old file. express has one field either way.
    expect(longListLine({ ...file, modified: new Date('2019-03-04T10:00:00Z') }).split(/\s+/).length)
      .toBe(longListLine(file).split(/\s+/).length);
  });
});

describe('the MLSD row', () => {
  /**
   * ftpd.e:878-891, including `Perm=r` on a FILE - which is what lets a
   * client offer the download rather than greying it out.
   */
  it('is express\'s own facts', () => {
    expect(
      machineListLine({
        name: 'UPROUGH.LHA',
        isDirectory: false,
        size: 4096,
        modified: new Date(Date.UTC(2026, 8, 7, 19, 45, 3)),
      })
    ).toBe('Type=file;Size=4096;Modify=20260907194503;Perm=r; UPROUGH.LHA');
  });

  it('says dir, with no size, for a conference', () => {
    expect(
      machineListLine({
        name: '001-General',
        isDirectory: true,
        size: 0,
        modified: new Date(Date.UTC(2026, 8, 7, 19, 45, 3)),
      })
    ).toBe('Type=dir;Modify=20260907194503;Perm=r; 001-General');
  });
});
