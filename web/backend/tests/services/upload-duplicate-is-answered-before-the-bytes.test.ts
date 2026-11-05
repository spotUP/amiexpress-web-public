/**
 * A duplicate is refused at the ZFILE, not filed after the transfer.
 *
 * WHAT WENT WRONG ON THE LIVE BOARD (2026-09-08, sysop and a second tester).
 * Every duplicate upload was accepted in full and then moved to HOLD. The log
 * said why, once per file:
 *
 *   Database query error: SqliteError: no such column: value
 *     at checkForFile (src/utils/file-upload.util.ts:76)
 *     at async uploadIsDuplicate (src/services/upload-duplicate.service.ts:65)
 *   [lrzsz upload] duplicate check failed, accepting file
 *
 * `checkForFile` asked `SELECT value FROM system_config WHERE key LIKE
 * 'DLPATH.%'`, and `system_config` is a WIDE single-row table - there is no
 * `value` column and there never was one, because DLPATH.n and ULPATH.n are
 * CONFERENCE tooltypes. The rule threw, the caller's safety net accepted the
 * file, and the caller paid for the whole transfer.
 *
 * express.e:18408-18445 asks five questions and none of them is SQL. These
 * drive the real `uploadIsDuplicate` against a real board on disk, because the
 * whole defect was a query that only fails against a real schema.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { parseInfoFile, writeInfoFile, updateTooltype } from '../../src/utils/info-file.util';
import { uploadIsDuplicate } from '../../src/services/upload-duplicate.service';
import { checkForFile } from '../../src/utils/file-upload.util';
import { clearNodeTooltypeCache } from '../../src/utils/node-tooltypes.util';

const REPO = path.resolve(__dirname, '../../../..');
const CONF = 7;

/**
 * A board whose conference 7 says, in its own icon, where its files live -
 * one download directory and one upload directory, both real.
 */
function boardWithConference(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dupe-check-'));
  fs.mkdirSync(path.join(root, `Conf${CONF}`, 'Files'), { recursive: true });
  fs.mkdirSync(path.join(root, `Conf${CONF}`, 'Upload'), { recursive: true });
  fs.mkdirSync(path.join(root, `Conf${CONF}`, 'LcFiles'), { recursive: true });

  const icon = path.join(root, `Conf${CONF}.info`);
  fs.copyFileSync(path.join(REPO, 'board', 'Conf1.info'), icon);
  writeInfoFile(updateTooltype(parseInfoFile(icon), 'DLPATH.1', `Conf${CONF}/Files`, false));
  writeInfoFile(updateTooltype(parseInfoFile(icon), 'ULPATH.1', `Conf${CONF}/Upload`, false));
  return root;
}

function ask(name: string, root: string): Promise<boolean> {
  return uploadIsDuplicate({ filename: name, conferenceId: CONF, bbsRoot: root, nodeId: 0 });
}

describe('the duplicate a caller is spared', () => {
  let root: string;

  beforeEach(() => {
    root = boardWithConference();
    clearNodeTooltypeCache();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    clearNodeTooltypeCache();
  });

  it('answers at all, instead of throwing at a column that does not exist', async () => {
    // The defect itself: this call threw SQLITE_ERROR on every upload, and the
    // caller's catch turned a duplicate into an accepted file.
    await expect(checkForFile('ANYTHING.LHA', CONF, root, 0)).resolves.toBe(false);
  });

  it("finds a file already in the conference's DLPATH", async () => {
    fs.writeFileSync(path.join(root, `Conf${CONF}`, 'Files', 'ABS_PD1.LHA'), 'x');

    await expect(ask('ABS_PD1.LHA', root)).resolves.toBe(true);
  });

  it("finds a file already in the conference's ULPATH", async () => {
    fs.writeFileSync(path.join(root, `Conf${CONF}`, 'Upload', 'ABS-PLC2.LHA'), 'x');

    await expect(ask('ABS-PLC2.LHA', root)).resolves.toBe(true);
  });

  it('finds one in LcFiles - express.e:18421-18426', async () => {
    fs.writeFileSync(path.join(root, `Conf${CONF}`, 'LcFiles', 'LOCAL.TXT'), 'x');

    await expect(ask('LOCAL.TXT', root)).resolves.toBe(true);
  });

  it('matches without regard to case, the way an AmigaDOS Lock does', async () => {
    fs.writeFileSync(path.join(root, `Conf${CONF}`, 'Files', 'ABS_PD1.LHA'), 'x');

    await expect(ask('abs_pd1.lha', root)).resolves.toBe(true);
  });

  it('lets a name the board has never seen through', async () => {
    await expect(ask('BRAND-NEW.LHA', root)).resolves.toBe(false);
  });

  it('refuses a name carrying one of the symbols express rejects', async () => {
    // express.e:18412-18413 - the reason the prompt says "File Exists, or has
    // a symbol (#?*)". The slash is not in this list because the rule reduces
    // the name with FilePart first (express.e:16831), so a ZFILE header
    // reading `Uploads/DUPE.LHA` is tested as `DUPE.LHA`.
    for (const name of ['A%B.LHA', 'A#B.LHA', 'A?B.LHA', 'A B.LHA', 'A(B.LHA', 'A)B.LHA', 'A:B.LHA', 'A*B.LHA']) {
      await expect(ask(name, root)).resolves.toBe(true);
    }
  });

  it('refuses the slash too, where the name has not been reduced yet', async () => {
    // checkForFile itself sees whatever it is given: the rename prompt at
    // command.handler.ts asks about a name the caller TYPED, path and all.
    await expect(checkForFile('A/B.LHA', CONF, root, 0)).resolves.toBe(true);
  });

  it('tests the last component of a path, the way FilePart does', async () => {
    // express.e:16831 asks zmdupecheck about FilePart(fname): a sender is free
    // to put a path in a ZFILE header, and `Uploads/ABS_PD1.LHA` must be
    // caught as `ABS_PD1.LHA` rather than slipping past into wherever the path
    // pointed.
    fs.writeFileSync(path.join(root, `Conf${CONF}`, 'Files', 'ABS_PD1.LHA'), 'x');

    await expect(ask('Uploads/ABS_PD1.LHA', root)).resolves.toBe(true);
  });

  it('reads the board it was not told about, rather than checking nothing', async () => {
    // command.handler.ts called checkForFile with no bbsDataPath, and every
    // filesystem check sat behind `if (bbsDataPath)`. The board is the
    // default now; passing undefined must not turn the checks off.
    const { config } = require('../../src/config');
    const previous = config.get('dataDir');
    config.set('dataDir', root);
    try {
      fs.writeFileSync(path.join(root, `Conf${CONF}`, 'Files', 'DEFAULTED.LHA'), 'x');
      await expect(checkForFile('DEFAULTED.LHA', CONF, undefined, 0)).resolves.toBe(true);
    } finally {
      config.set('dataDir', previous);
    }
  });
});

describe("the sysop's own list of names never to accept", () => {
  let root: string;

  beforeEach(() => {
    root = boardWithConference();
    clearNodeTooltypeCache();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    clearNodeTooltypeCache();
  });

  /** FILESNOTALLOWED is a NODE tooltype naming a file - ACP.e:2665. */
  function nodeListsNames(nodeId: number, names: string[]): void {
    const { config } = require('../../src/config');
    config.set('dataDir', root);
    const listPath = path.join(root, 'DUPE_LIST');
    fs.writeFileSync(listPath, names.join('\n') + '\n', 'latin1');

    const icon = path.join(root, `Node${nodeId}.info`);
    fs.copyFileSync(path.join(REPO, 'board', 'Conf1.info'), icon);
    writeInfoFile(updateTooltype(parseInfoFile(icon), 'FILESNOTALLOWED', listPath, false));
    clearNodeTooltypeCache();
  }

  it('refuses a name on the list', async () => {
    nodeListsNames(0, ['BANNED.LHA', 'ALSO-BANNED.LHA']);

    await expect(ask('BANNED.LHA', root)).resolves.toBe(true);
    await expect(ask('also-banned.lha', root)).resolves.toBe(true);
  });

  it('lets everything through when the list file is missing - express.e:18387', async () => {
    // A DUPE_LIST that cannot be opened must not refuse every upload on the
    // board, which is what a "list means refuse" reading would do.
    const { config } = require('../../src/config');
    config.set('dataDir', root);
    const icon = path.join(root, 'Node0.info');
    fs.copyFileSync(path.join(REPO, 'board', 'Conf1.info'), icon);
    writeInfoFile(updateTooltype(parseInfoFile(icon), 'FILESNOTALLOWED', path.join(root, 'NO-SUCH-LIST'), false));
    clearNodeTooltypeCache();

    await expect(ask('ANYTHING.LHA', root)).resolves.toBe(false);
  });
});
