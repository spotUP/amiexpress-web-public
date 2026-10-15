/**
 * SYSOP EXTRA BYTES LET THE CALLER DOWNLOAD MORE.
 *
 * express.e refuses a download against bytesADL (19853, 19909), which both
 * logons set from todaysBytesLimit (28531-28535 BBS, 28928-28932 FTP): the
 * daily limit plus the extra bytes a sysop's Q edit (21537-21544) or an
 * upload (19531) gave for today. checkDownloadRatios - the gate the BBS
 * download and the FTP RETR both ask - read dailyBytesLimit, so extra bytes
 * were shown nowhere and allowed nothing. The upload stats screen's "Todays
 * Bytes Available" (12701-12714) read a field nothing set and always said
 * Infinite.
 */
jest.mock('../../src/index', () => ({}));

import { checkDownloadRatios } from '../../src/utils/download-ratios.util';
import { emitULStats } from '../../src/utils/display-ul-stats.util';

const MB = 1_000_000;

function caller(extra: Record<string, unknown> = {}): any {
  return {
    username: 'zedcaller', secLevel: 20, uploads: 0, downloads: 0,
    bytesUpload: 0, bytesDownload: 0, ratio: 0, ratioType: 0,
    byteLimit: 1 * MB, dailyBytesDld: 0, ...extra,
  };
}

describe("today's download allowance (express.e:28531-28535, 19853)", () => {
  it('lets a caller with 4 MB of sysop extra bytes take a 3 MB file over a 1 MB daily limit', async () => {
    const verdict = await checkDownloadRatios(caller({ todaysBytesLimit: 5 * MB }), [{ size: 3 * MB, isFree: false }]);
    expect(verdict.canDownload).toBe(true);
  });

  it('still refuses the same file with no extra bytes', async () => {
    const verdict = await checkDownloadRatios(caller(), [{ size: 3 * MB, isFree: false }]);
    expect(verdict.canDownload).toBe(false);
    expect(verdict.errorMessage).toBe('Not enough daily byte allowance for requested downloads');
  });

  it("refuses once today's downloads have used today's limit up", async () => {
    const verdict = await checkDownloadRatios(
      caller({ todaysBytesLimit: 5 * MB, dailyBytesDld: 4 * MB }), [{ size: 3 * MB, isFree: false }]);
    expect(verdict.canDownload).toBe(false);
  });

  it("shows today's bytes left on the upload stats screen (express.e:12709-12711)", () => {
    const out: string[] = [];
    emitULStats({ emit: (_e: string, d: string) => { out.push(d); return true; } } as any,
      { user: caller({ todaysBytesLimit: 5 * MB, dailyBytesDld: 250_000 }) } as any);
    expect(out.join('')).toContain('Todays Bytes Available   : 4750000');
  });
});
