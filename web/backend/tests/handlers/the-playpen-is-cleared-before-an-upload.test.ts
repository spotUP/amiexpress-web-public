/**
 * A dead upload must not leave its bytes in the playpen for ever.
 *
 * express.e:17656 - every batch upload opens with `cleanItUp()`, which clears
 * the node's WORK DIRECTORY before the new transfer writes into it
 * (express.e:17799-17876).
 *
 * This port skipped it: `file.handler.ts` carried `cleanItUp() - nothing
 * needed for web`. The sysop found the result on the live board, 2026-09-15 -
 * `Node2/Playpen` holding seven files dating to August, `.LHA` and `.TXT` from
 * sessions that died - and said "those files looks like they dont belong to
 * the bbs". They did not: they were abandoned uploads nothing ever cleared.
 *
 * The other end of the same fact is already in the source:
 * `file.handler.ts:691` says a refused upload "silently aborts with a partial
 * file in playpen".
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { cleanItUp } from '../../src/utils/clean-it-up.util';
import { displayUploadInterface, setFileAreas } from '../../src/handlers/file/file.handler';
import { getPlaypenDir } from '../../src/utils/bbs-paths.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { config } from '../../src/config';
import { flushOutput } from '../../src/utils/output.util';

function aPlaypen(names: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playpen-'));
  for (const n of names) fs.writeFileSync(path.join(dir, n), 'bytes');
  return dir;
}

describe('clearing the playpen', () => {
  it('deletes the leftovers a dead upload left behind', () => {
    const dir = aPlaypen(['DEC-SCP.LHA', 'TELEKOM.LHA', 'NR_020.TXT']);

    const r = cleanItUp(dir);

    expect(r.deleted.sort()).toEqual(['DEC-SCP.LHA', 'NR_020.TXT', 'TELEKOM.LHA']);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('leaves directories alone', () => {
    // express.e:17836 deletes only fib_DirEntryType < 0, which is a file.
    const dir = aPlaypen(['STALE.LHA']);
    fs.mkdirSync(path.join(dir, 'subdir'));

    cleanItUp(dir);

    expect(fs.existsSync(path.join(dir, 'subdir'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'STALE.LHA'))).toBe(false);
  });

  it('STOPS on a name it does not recognise, rather than skipping it', () => {
    // express.e JUMPs out of the whole loop (17846-17854). Something it does
    // not understand is sitting in a directory it is about to delete from, so
    // it stops deleting. A file after the odd one survives, deliberately.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playpen-odd-'));
    fs.writeFileSync(path.join(dir, 'AAA.LHA'), 'x');
    fs.writeFileSync(path.join(dir, 'has space.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'ZZZ.LHA'), 'x');

    // Directory order is the filesystem's business, so the claim is stated
    // against it rather than against a guess: everything BEFORE the odd name
    // is gone, the odd name and everything after it is untouched.
    const order = fs.readdirSync(dir);
    const odd = order.indexOf('has space.txt');
    expect(odd).toBeGreaterThanOrEqual(0);

    const r = cleanItUp(dir);

    expect(r.stoppedAt).toBe('has space.txt');
    expect(r.deleted.sort()).toEqual(order.slice(0, odd).sort());
    for (const survivor of order.slice(odd)) {
      expect(fs.existsSync(path.join(dir, survivor))).toBe(true);
    }
  });

  it('treats a non-ASCII name as unrecognised too', () => {
    // express.e:17852 isascii(). A latin1 high byte stops the sweep.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playpen-hi-'));
    fs.writeFileSync(path.join(dir, 'CÄFE.TXT'), 'x');

    expect(cleanItUp(dir).stoppedAt).toBe('CÄFE.TXT');
  });

  it('does not mind a node that has never taken an upload', () => {
    // express.e:17824 - a Lock() that fails just returns.
    expect(cleanItUp(path.join(os.tmpdir(), 'no-such-playpen-' + Date.now())))
      .toEqual({ deleted: [] });
  });

  it('is actually called by the upload, not merely defined', () => {
    // The whole defect was a function nobody called - the line in the handler
    // said "nothing needed for web". Driven through `displayUploadInterface`,
    // the function the U command runs, on a temp board whose Node1/Playpen
    // holds a dead upload's leftovers: once the caller is at "FileName 1:",
    // the playpen is empty.
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playpen-upload-'));
    const areaDir = path.join(dataDir, 'Conf1', 'Files');
    fs.mkdirSync(areaDir, { recursive: true });
    const playpen = getPlaypenDir(1, dataDir);
    fs.mkdirSync(playpen, { recursive: true });
    fs.writeFileSync(path.join(playpen, 'DEC-SCP.LHA'), 'stale bytes');

    const original = config.get.bind(config);
    const spy = jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
    setFileAreas([{ id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1', dlPath: areaDir, ulPath: areaDir }]);
    const socket: any = { id: 'playpen-upload', emit: () => true, on: () => undefined };
    const session: any = {
      user: { id: 1, username: 'tester', slotNumber: 1 },
      currentConf: 1,
      nodeId: 1,
      subState: LoggedOnSubState.DISPLAY_MENU,
    };
    try {
      displayUploadInterface(socket, session, '');
      flushOutput(socket);

      expect(session.subState).toBe(LoggedOnSubState.UPLOAD_FILENAME_INPUT);
      expect(fs.readdirSync(playpen)).toEqual([]);
    } finally {
      spy.mockRestore();
      setFileAreas([]);
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
