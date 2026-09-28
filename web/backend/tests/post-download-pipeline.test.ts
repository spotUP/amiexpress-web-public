/**
 * Regression test for the shared runPostDownload pipeline.
 *
 * express.e:20251-20316 (downloadAFile post-transfer block):
 *   - aePuts('\b\n\b\nFile transfer Completed.\b\n')
 *   - StringF(' \d files, \sk bytes, \d minutes \d seconds \d cps, \d% efficiency at \d')
 *   - loggedOnUserMisc.lastDlCPS := pcps
 *   - IF pcps > dnCPS2 THEN dnCPS2:=pcps; oldDnCPS:=Min(pcps,65535)
 *   - callersLog/udLog summary (success) or 'Download Failed..' (zero files)
 *   - displayULStats(loggedOnUser, loggedOnUserMisc)
 *   - IF goodbye THEN pGoodbye()
 *
 * Every step is asserted by driving the real `runPostDownload` with its
 * loggers and the user-file writer stubbed, and reading what reached the
 * caller, the session's user and the loggers. The two download paths are
 * then driven for real - the telnet/SSH lrzsz path through
 * `startZmodemDownload` (with a fake LrzszTransferManager, so no sz runs)
 * and the web path through `DownloadHandler.handleConfirmInput` - and each
 * must produce the pipeline's banner exactly once, which is how a path that
 * skipped it, or duplicated the stats inline, shows up. Last, the D
 * command's single-file Restricted gate (D16) is driven on a temp board.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const callersLog = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../src/server/database-helpers', () => ({ callersLog: (...a: unknown[]) => callersLog(...a) }));
jest.mock('../src/services/UserFileManager', () => ({ userFileManager: { updateUserDataFile: jest.fn() } }));
const writeUDSessionHeader = jest.fn(async () => {});
const writeToCallersLog = jest.fn(async (..._args: unknown[]) => {});
const writeToUDLog = jest.fn(async (..._args: unknown[]) => {});
jest.mock('../src/utils/download-logging.util', () => ({
  writeUDSessionHeader: () => writeUDSessionHeader(),
  writeToCallersLog: (...a: unknown[]) => writeToCallersLog(...a),
  writeToUDLog: (...a: unknown[]) => writeToUDLog(...a),
}));
jest.mock('../src/utils/display-ul-stats.util', () => ({ emitULStats: jest.fn() }));
const advanceDisplayFlow = jest.fn(async () => {});
jest.mock('../src/handlers/command.handler', () => ({ advanceDisplayFlow: () => advanceDisplayFlow() }));
jest.mock('../src/services/download-booking.service', () => ({
  ...jest.requireActual('../src/services/download-booking.service'),
  bookDownloads: jest.fn(async () => undefined),
}));
jest.mock('../src/storage/storage-context', () => ({ getStorageContext: () => null }));
const lrzszManagers: any[] = [];
jest.mock('../src/services/lrzsz-transfer.service', () => ({
  isLrzszAvailable: () => true,
  LrzszTransferManager: class {
    opts: any;
    constructor(opts: any) { this.opts = opts; lrzszManagers.push(this); }
    start() { /* no sz */ }
    handleInput() { /* no sz */ }
  },
}));

import { runPostDownload } from '../src/services/post-download.service';
import { startZmodemDownload } from '../src/handlers/commands/user-commands.handler';
import { DownloadHandler } from '../src/handlers/file/download.handler';
import { writeDirEntry } from '../src/utils/dir-file.util';
import { LoggedOnSubState } from '../src/constants/bbs-states';
import { config } from '../src/config';

function aCaller(over: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const socket: any = {
    id: `post-dl-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: unknown) => { if (event === 'ansi-output') lines.push(String(payload)); return true; },
    on: () => undefined,
    once: () => undefined,
  };
  const session: any = {
    nodeId: 1,
    currentConf: 1,
    user: { id: 'u1', username: 'sysop', securityFlags: 'T'.repeat(64) },
    ...over,
  };
  const said = () => lines.join('');
  return { socket, session, said };
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

beforeEach(() => {
  jest.clearAllMocks();
  lrzszManagers.length = 0;
});
afterEach(() => jest.restoreAllMocks());

describe('Post-download pipeline (express.e:20251-20316)', () => {
  const NOW = 1_800_000_000_000;
  function finished(over: Record<string, unknown> = {}) {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    // 2 seconds, 8192 bytes: 4096 cps, 4096*100/(38400/10) = 106%.
    return { downloadStartTime: NOW - 2000, downloadedFiles: 2, downloadedBytes: 8192, goodbyeAfter: false, success: true, ...over };
  }
  const STATS = ' 2 files, 8k bytes, 0 minutes 2 seconds 4096 cps, 106% efficiency at 38400';

  test('emits the banner then the aggregate stats line (express.e:20251, 20262)', async () => {
    const c = aCaller();
    await runPostDownload(c.socket, c.session, finished());

    expect(c.said()).toContain(`\r\n\r\nFile transfer Completed.\r\n${STATS}\r\n`);
  });

  test('persists lastDlCPS and raises the top CPS when beaten (express.e:20259, 20271-20275)', async () => {
    const c = aCaller();
    c.session.user.dnCPS2 = 1000;
    await runPostDownload(c.socket, c.session, finished());

    expect(c.session.user.lastDlCPS).toBe(4096);
    expect(c.session.user.dnCPS2).toBe(4096);
    expect(c.session.user.topDownloadCPS).toBe(4096);
    expect(c.session.user.oldDnCPS).toBe(4096);
  });

  test('clamps oldDnCPS to 16 bits and leaves an unbeaten top CPS alone', async () => {
    const fast = aCaller();
    await runPostDownload(fast.socket, fast.session, finished({ downloadedBytes: 400000 }));
    expect(fast.session.user.dnCPS2).toBe(200000);
    expect(fast.session.user.oldDnCPS).toBe(65535);

    const slow = aCaller();
    slow.session.user.dnCPS2 = 999999;
    await runPostDownload(slow.socket, slow.session, finished());
    expect(slow.session.user.dnCPS2).toBe(999999);
    expect(slow.session.user.oldDnCPS).toBeUndefined();
  });

  test('writes the same summary to SQL, the disk CallersLog and UDLog, after the session header (D14, D15)', async () => {
    const c = aCaller();
    await runPostDownload(c.socket, c.session, finished());

    expect(writeUDSessionHeader).toHaveBeenCalledTimes(1);
    expect(callersLog).toHaveBeenCalledWith('u1', 'sysop', `\t${STATS}`);
    expect(writeToCallersLog).toHaveBeenCalledWith('sysop', `\t${STATS}`, 1);
    expect(writeToUDLog).toHaveBeenCalledWith(`\t${STATS}`, 1);
  });

  test('logs "Download Failed.." when nothing went (express.e:20289)', async () => {
    const c = aCaller();
    await runPostDownload(c.socket, c.session, finished({ success: false, downloadedFiles: 0, downloadedBytes: 0 }));

    expect(callersLog).toHaveBeenCalledWith('u1', 'sysop', '\tDownload Failed..');
    expect(writeToUDLog).toHaveBeenCalledWith('\tDownload Failed..', 1);
  });

  test('goodbyeAfter starts the pGoodbye countdown instead of returning to the menu (express.e:20317)', async () => {
    const startPGoodbye = jest.spyOn(DownloadHandler, 'startPGoodbye').mockResolvedValue(undefined);
    const c = aCaller();
    await runPostDownload(c.socket, c.session, finished({ goodbyeAfter: true }));

    expect(startPGoodbye).toHaveBeenCalledTimes(1);
    expect(advanceDisplayFlow).not.toHaveBeenCalled();
  });
});

describe('Telnet/SSH lrzsz download routes through runPostDownload (no duplication)', () => {
  test('startZmodemDownload hands a finished transfer to the pipeline, which prints the stats once', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-dl-sz-'));
    const file = path.join(dir, 'DEMO.LHA');
    fs.writeFileSync(file, Buffer.alloc(2048));
    const c = aCaller({ connectionType: 'telnet', user: { username: 'sysop' } });
    try {
      startZmodemDownload(c.socket, c.session, [file]);
      expect(lrzszManagers).toHaveLength(1);

      await lrzszManagers[0].opts.onComplete(true, { exitCode: 0, signal: null });

      // The earlier onComplete emitted "Download complete: <file>" and
      // returned to the menu; a re-added inline stats line would appear
      // here a second time.
      expect(count(c.said(), 'File transfer Completed.')).toBe(1);
      expect(count(c.said(), ' 1 files, 2k bytes,')).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Web download.handler delegates to runPostDownload', () => {
  test('confirming a web download runs the shared pipeline once', async () => {
    const c = aCaller({
      connectionType: 'web',
      tempData: {
        waitingForDownloadConfirm: true,
        downloadFileList: [{ name: 'DEMO.LHA', size: 3072, confNum: 1, dirNum: 1, fullPath: '/board/DEMO.LHA' }],
      },
    });

    await DownloadHandler.handleConfirmInput(c.socket, c.session, '\r');

    expect(count(c.said(), 'File transfer Completed.')).toBe(1);
    expect(c.said()).toContain(' 1 files, 3k bytes,');
    expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  describe('rejects "Restricted" comment files (D16, express.e checkFIBForFileSize)', () => {
    let root: string;
    let previousDataDir: string;
    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'post-dl-restricted-'));
      previousDataDir = config.get('dataDir');
      config.set('dataDir', root);
    });
    afterEach(() => {
      config.set('dataDir', previousDataDir);
      fs.rmSync(root, { recursive: true, force: true });
    });

    test('a file whose DIR description starts "Restricted" is refused, logged, and not added', async () => {
      const confDir = path.join(root, 'Conf1');
      fs.mkdirSync(path.join(confDir, 'Files'), { recursive: true });
      fs.writeFileSync(path.join(confDir, 'Files', 'SECRET.LHA'), Buffer.alloc(100));
      await writeDirEntry(path.join(confDir, 'DIR1'), 'SECRET.LHA', 100, new Date(), 'Restricted - sysop only', 'N', 'sysop', false);
      const c = aCaller({ tempData: { downloadFileList: [], downloadNumFiles: 0 } });

      await DownloadHandler.handleFilenameInput(c.socket, c.session, 'SECRET.LHA');

      expect(c.said()).toContain('SECRET.LHA: restricted file');
      expect(callersLog).toHaveBeenCalledTimes(1);
      expect(String(callersLog.mock.calls[0][2])).toContain('Attempt to download RESTRICTED file');
      expect(c.session.tempData.downloadFileList).toEqual([]);
    });
  });
});
