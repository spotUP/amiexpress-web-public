/**
 * The conference list an FTP caller sees comes from the BOARD, not the mirror.
 *
 * The defect this pins, live on 2026-09-07: the tree was read from the
 * `conference_config` table through the config repository - the list the admin
 * edits - and on the live board that table has ZERO rows. The conferences are
 * in `ConfConfig.info` (`NCONFS`, `NAME.n`, `LOCATION.n`), which is also where
 * `conferenceDir` looks to find their files.
 *
 * So every FTP listing came back empty for a caller with access to five
 * conferences: `226 Transfer complete` and not one row. From the client it
 * looked exactly like a permissions problem, and no amount of checking
 * `confAccess` would ever have found it.
 *
 * The rule it belongs to is already in the project's own notes - conference
 * and user truth lives on disk, SQL is a mirror that may be empty, stale or
 * absent. This drives the REAL wiring (`boardFtpFilesystem`) against a board
 * on disk with NO database behind it, which is the shape the live board had.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

/**
 * `NCONFS` and the NAME/LOCATION pairs.
 *
 * Written as plain tooltype lines into `ConfConfig.info`, which is what
 * `tests/conferences/conference-location-paths.test.ts` does: the reader takes
 * a text file as well as a real Amiga icon, and an icon cannot be authored in
 * a test without a template to modify.
 */
function writeBoard(root: string): void {
  fs.writeFileSync(
    path.join(root, 'ConfConfig.info'),
    [
      'NCONFS=3',
      'NAME.1=Amiga Demoscene',
      'LOCATION.1=BBS:Conf2/',
      'NAME.2=C64 Demoscene',
      'LOCATION.2=BBS:Conf3/',
      'NAME.3=Up Rough Internal',
      'LOCATION.3=BBS:Conf12/',
      '',
    ].join('\n'),
    'utf8'
  );
  // Conference 2's directory, with one file in a DIR file, to prove the names
  // and the DIRECTORIES come from the same place: LOCATION.2 is Conf3.
  const conf = path.join(root, 'Conf3');
  fs.mkdirSync(conf, { recursive: true });
  fs.writeFileSync(
    path.join(conf, 'DIR1'),
    'PARTY.LHA    N  123456  01-01-26         A demo from the C64 conference\r\n',
    'latin1'
  );
}

const SYSOP = { username: 'sysop', confAccess: 'XXX' };

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-board-'));
  writeBoard(root);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a board whose conference_config table is empty', () => {
  it('still lists its conferences, by name, from ConfConfig.info', async () => {
    // The board is passed in: `config` captured its own data directory when it
    // loaded, long before this test had a temp board to offer.
    const { boardFtpFilesystem } = require('../../src/ftp/ftp-auth');
    const tree = boardFtpFilesystem(root);

    const rows = await tree.list(SYSOP, '/');

    expect(rows.map((row: { name: string }) => row.name)).toEqual([
      '001-Amiga Demoscene',
      '002-C64 Demoscene',
      '003-Up Rough Internal',
    ]);
  });

  it('reads a conference\'s files from the directory LOCATION names', async () => {
    // LOCATION.2 is `BBS:Conf3/`, so conference 2's files are in Conf3 - the
    // case a hand-built `Conf<n>` gets wrong, and the reason the names and the
    // directories must come from one reader.
    const { boardFtpFilesystem } = require('../../src/ftp/ftp-auth');
    const tree = boardFtpFilesystem(root);

    const files = await tree.list(SYSOP, '/002-C64 Demoscene');

    expect(files.map((row: { name: string }) => row.name)).toEqual(['PARTY.LHA']);
    expect(files[0].size).toBe(123456);
  });

  it('still hides a conference the caller has no access to', async () => {
    const { boardFtpFilesystem } = require('../../src/ftp/ftp-auth');
    const tree = boardFtpFilesystem(root);

    // X__ : only the first conference.
    const rows = await tree.list({ username: 'member', confAccess: 'X__' }, '/');

    expect(rows.map((row: { name: string }) => row.name)).toEqual(['001-Amiga Demoscene']);
  });
});
