/**
 * Regression: batch download (F+D / flagged-files-batch path) must
 * reject files whose DIR description starts "Restricted", matching the
 * single-file download path and express.e:checkFIBForFileSize.
 *
 * Without this, a sysop marks a file Restricted but a user can flag it
 * via F then download it via F+D batch — D16 in the parity diff.
 *
 * The restricted check lives in the shared file-restriction.util (single
 * source of truth; its behaviour is tested in
 * tests/utils/file-restriction.util.test.ts). This test guards the WIRING:
 * it drives the real `BatchDownloadHandler.handleBatchDownload` with two
 * flagged files, one whose DIR description says "Restricted", and asserts
 * the restricted one is refused on the wire, logged to the callers log,
 * counted as failed and never reaches the download list, while the other
 * one still queues. The file resolver is fed through a stubbed pooled
 * storage (no board on disk), and only the DIR-description lookup is
 * stubbed - `isRestrictedComment` is the real one.
 */
process.env.SKIP_DB_INIT = '1';

const callersLog = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../src/server/database-helpers', () => ({
  callersLog: (...args: unknown[]) => callersLog(...args),
}));
jest.mock('../src/storage/storage-context', () => ({
  getStorageContext: () => ({ pooled: true }),
}));
jest.mock('../src/storage/remote-download', () => ({
  materialiseRemoteFile: async (filename: string) => ({
    name: filename,
    size: 1000,
    fullPath: `/pool/${filename}`,
    driveNumber: 1,
    key: filename,
  }),
  storageFailureText: (error: unknown) => String(error),
}));
const DESCRIPTIONS: Record<string, string> = {
  'SECRET.LHA': 'Restricted - sysop only',
  'OPEN.LHA': 'A perfectly ordinary archive',
};
jest.mock('../src/utils/file-restriction.util', () => ({
  ...jest.requireActual('../src/utils/file-restriction.util'),
  resolveFileDescription: async (_conf: number, _dataDir: string, name: string) => DESCRIPTIONS[name] ?? '',
}));
jest.mock('../src/utils/acs.util', () => ({
  ...jest.requireActual('../src/utils/acs.util'),
  checkSecurity: () => true,
}));
jest.mock('../src/utils/download-ratios.util', () => ({
  checkDownloadRatios: async () => ({ canDownload: true }),
}));

import { BatchDownloadHandler } from '../src/handlers/transfer/batch-download.handler';
import { LoggedOnSubState } from '../src/constants/bbs-states';

describe('batch download enforces Restricted gate (D16)', () => {
  it('refuses the Restricted file, logs the attempt, and still queues the rest', async () => {
    const lines: string[] = [];
    const socket: any = {
      id: 'caller',
      emit: (event: string, payload: unknown) => { if (event === 'ansi-output') lines.push(String(payload)); },
    };
    const session: any = {
      currentConf: 1,
      conferences: [],
      user: { id: 7, username: 'SPOT', secLevel: 255 },
      tempData: {},
      flagManager: {
        getAll: () => [
          { confNum: 1, fileName: 'SECRET.LHA' },
          { confNum: 1, fileName: 'OPEN.LHA' },
        ],
      },
    };

    await BatchDownloadHandler.handleBatchDownload(socket, session);
    const said = lines.join('');

    expect(said).toContain('SECRET.LHA: restricted file');
    expect(callersLog).toHaveBeenCalledTimes(1);
    expect(String(callersLog.mock.calls[0][2])).toContain('Attempt to download RESTRICTED file [/pool/SECRET.LHA]');

    // The restricted file never reaches the list the confirm step sends.
    expect(session.subState).toBe(LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM);
    const queued = session.tempData.batchDownloadList.map((f: any) => f.name);
    expect(queued).toEqual(['OPEN.LHA']);
    expect(session.tempData.failCount).toBe(1);
    expect(session.tempData.successCount).toBe(1);
    expect(said).toContain('Queued: OPEN.LHA');
    expect(said).not.toContain('Queued: SECRET.LHA');
  });
});
