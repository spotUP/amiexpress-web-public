/**
 * The conference's OWN ICON decides what it looks like over FTP.
 *
 * Two defects, both live on 2026-09-08, both in the file that already carries
 * the lesson in a comment:
 *
 *  - `EXCLUDE_FTP` was read from the `conference_config` MIRROR only. On the
 *    live board that table has zero rows, so a conference the sysop had
 *    excluded on his icon was served over FTP regardless. express reads it
 *    from the icon (`checkToolTypeExists(TOOLTYPE_CONF,i,'EXCLUDE_FTP')`,
 *    express.e:28947).
 *  - `FTPDIRNAME` (express.e:28948) was not read anywhere. It is the name a
 *    conference wears over FTP, and its whole point is a conference whose
 *    board name cannot be a path segment: express falls back to the
 *    conference name and calls `removeSlashes` on whichever it gets, so a
 *    conference called `Uploads/Incoming` appears as `UploadsIncoming` unless
 *    the sysop names it himself.
 *
 * As with tree-comes-from-the-board.test.ts, this drives the REAL wiring
 * against a board on disk with no database behind it - the shape live has.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

const SYSOP = { username: 'sysop', confAccess: 'XXXX' };

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-icons-'));
  fs.writeFileSync(
    path.join(root, 'ConfConfig.info'),
    [
      'NCONFS=4',
      'NAME.1=Amiga Demoscene',
      'LOCATION.1=BBS:Conf1/',
      'NAME.2=Staff Only',
      'LOCATION.2=BBS:Conf2/',
      'NAME.3=Uploads/Incoming',
      'LOCATION.3=BBS:Conf3/',
      'NAME.4=Long Winded Conference Name',
      'LOCATION.4=BBS:Conf4/',
      '',
    ].join('\n'),
    'utf8'
  );
  for (let i = 1; i <= 4; i += 1) fs.mkdirSync(path.join(root, `Conf${i}`), { recursive: true });

  // Conference 2 is excluded on its icon and nowhere else.
  fs.writeFileSync(path.join(root, 'Conf2.info'), 'EXCLUDE_FTP=1\n', 'utf8');
  // Conference 4 names itself for FTP.
  fs.writeFileSync(path.join(root, 'Conf4.info'), 'FTPDIRNAME=Uploads\n', 'utf8');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function names(rows: Array<{ name: string }>): string[] {
  return rows.map((row) => row.name);
}

describe('a conference icon with FTP tooltypes, and an empty mirror', () => {
  it('hides a conference whose icon carries EXCLUDE_FTP', async () => {
    const { boardFtpFilesystem } = require('../../src/ftp/ftp-auth');

    const rows = await boardFtpFilesystem(root).list(SYSOP, '/');

    expect(names(rows)).not.toContain('002-Staff Only');
  });

  it('shows a conference whose icon does not', async () => {
    const { boardFtpFilesystem } = require('../../src/ftp/ftp-auth');

    const rows = await boardFtpFilesystem(root).list(SYSOP, '/');

    expect(names(rows)).toContain('001-Amiga Demoscene');
  });

  it('wears the name FTPDIRNAME gives it, not the board name', async () => {
    const { boardFtpFilesystem } = require('../../src/ftp/ftp-auth');

    const rows = await boardFtpFilesystem(root).list(SYSOP, '/');

    expect(names(rows)).toContain('004-Uploads');
    expect(names(rows)).not.toContain('004-Long Winded Conference Name');
  });

  it('falls back to the board name, minus the slash, when FTPDIRNAME is absent', async () => {
    const { boardFtpFilesystem } = require('../../src/ftp/ftp-auth');

    const rows = await boardFtpFilesystem(root).list(SYSOP, '/');

    // express.e:28952 calls removeSlashes on the name it ends up with.
    expect(names(rows)).toContain('003-UploadsIncoming');
  });

  it('can still be browsed under the name FTPDIRNAME gave it', async () => {
    const { boardFtpFilesystem } = require('../../src/ftp/ftp-auth');

    // The name must not be cosmetic: the path built from it has to resolve
    // back to conference 4, or the caller sees a directory he cannot enter.
    const rows = await boardFtpFilesystem(root).list(SYSOP, '/004-Uploads');

    expect(Array.isArray(rows)).toBe(true);
  });
});
