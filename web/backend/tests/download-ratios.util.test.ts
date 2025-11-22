jest.mock('../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: () => ({ freeDownloads: true })
}));

import { checkDownloadRatios, updateDownloadStats } from '../src/utils/download-ratios.util';
import { DownloadHandler } from '../src/handlers/download.handler';
import { User } from '../src/types';

function makeUser(overrides: Partial<User> = {}): User {
  const now = new Date();
  return {
    id: 'u1',
    username: 'tester',
    passwordHash: '',
    realname: 'Test User',
    location: 'Nowhere',
    phone: '0000',
    secLevel: 10,
    uploads: 0,
    downloads: 0,
    bytesUpload: 0,
    bytesDownload: 0,
    ratio: 0,
    ratioType: 0,
    timeTotal: 0,
    timeLimit: 0,
    timeUsed: 0,
    chatLimit: 0,
    chatUsed: 0,
    firstLogin: now,
    calls: 0,
    callsToday: 0,
    newUser: false,
    expert: 'N',
    ansi: true,
    linesPerScreen: 23,
    computer: '',
    screenType: '',
    protocol: '',
    editor: '',
    zoomType: '',
    availableForChat: true,
    quietNode: false,
    autoRejoin: 1,
    confAccess: '',
    areaName: '',
    uuCP: false,
    topUploadCPS: 0,
    topDownloadCPS: 0,
    byteLimit: 0,
    userFlags: 0,
    created: now,
    updated: now,
    ...overrides
  };
}

describe('checkDownloadRatios', () => {
  it('allows sysops regardless of request size', async () => {
    const user = makeUser({ secLevel: 255, ratio: 0 });
    const result = await checkDownloadRatios(user, [{ size: 10_000_000 }]);
    expect(result.canDownload).toBe(true);
  });

  it('enforces daily byte allowance', async () => {
    const user = makeUser({ dailyBytesLimit: 1000, dailyBytesDld: 900 });
    const result = await checkDownloadRatios(user, [{ size: 200 }]);
    expect(result.canDownload).toBe(false);
    expect(result.errorMessage).toMatch(/daily byte allowance/i);
  });

  it('counts free downloads against daily byte allowance', async () => {
    const user = makeUser({ dailyBytesLimit: 500, dailyBytesDld: 450 });
    const result = await checkDownloadRatios(user, [{ size: 100, isFree: true }]);
    expect(result.canDownload).toBe(false);
    expect(result.errorMessage).toMatch(/daily byte allowance/i);
  });

  it('enforces byte ratios when ratioType=0', async () => {
    const user = makeUser({
      ratio: 2,
      ratioType: 0,
      bytesUpload: 1_000,
      bytesDownload: 500
    });
    // Allowed bytes = (2 * 1000) - 500 = 1500
    const result = await checkDownloadRatios(user, [{ size: 1_600 }]);
    expect(result.canDownload).toBe(false);
    expect(result.errorMessage).toMatch(/free bytes/i);
  });

  it('enforces file ratios when ratioType=2', async () => {
    const user = makeUser({
      ratio: 1,
      ratioType: 2,
      uploads: 5,
      downloads: 3
    });
    // Allowed files = (1 * (5+1)) - 3 = 3
    const result = await checkDownloadRatios(user, [{ size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }]);
    expect(result.canDownload).toBe(false);
    expect(result.errorMessage).toMatch(/free files/i);
  });

  it('ignores free downloads for ratio checks', async () => {
    const user = makeUser({
      ratio: 1,
      ratioType: 2,
      uploads: 0,
      downloads: 0
    });
    const result = await checkDownloadRatios(user, [
      { size: 10, isFree: true },
      { size: 20, isFree: true }
    ]);
    expect(result.canDownload).toBe(true);
  });

  it('bypasses ratio/file checks when credit account is active', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const user = makeUser({
      ratio: 5,
      ratioType: 2,
      uploads: 0,
      downloads: 0,
      creditDays: 5,
      creditStartDate: nowSec - 1000 // active window
    });
    const result = await checkDownloadRatios(user, [{ size: 10 }, { size: 10 }, { size: 10 }, { size: 10 }, { size: 10 }]);
    expect(result.canDownload).toBe(true);
  });

  it('skips download counters when credit account is not tracking downloads', async () => {
    const user = makeUser({
      downloads: 2,
      bytesDownload: 100,
      dailyBytesDld: 50,
      creditDays: 2,
      creditStartDate: Math.floor(Date.now() / 1000) - 10,
      creditTracking: 0 // TRACK_DOWNLOADS_BIT not set
    });
    await updateDownloadStats(user as any, 25);
    expect(user.downloads).toBe(2); // unchanged
    expect(user.bytesDownload).toBe(100);
    expect(user.dailyBytesDld).toBe(75); // daily always increments
  });

  it('applies CREDITBYKB scaling to daily limit (KB rounding)', async () => {
    const user = makeUser({ dailyBytesLimit: 2048, dailyBytesDld: 0 });
    // 2049 bytes would fail if treated as bytes; with CREDITBYKB it rounds down to 2KB and should pass.
    const result = await checkDownloadRatios(user, [{ size: 2049 }], undefined, false, true);
    expect(result.canDownload).toBe(true);
  });

  it('fails daily allowance when CREDITBYKB scaling still exceeded', async () => {
    const user = makeUser({ dailyBytesLimit: 2048, dailyBytesDld: 0 });
    // 4096 bytes → 4KB vs 2KB allowance even with scaling, so should fail.
    const result = await checkDownloadRatios(user, [{ size: 4096 }], undefined, false, true);
    expect(result.canDownload).toBe(false);
    expect(result.errorMessage).toMatch(/daily byte allowance/i);
  });

  it('treats conference FREEDOWNLOADS as free (no ratio hit)', () => {
    const handler: any = DownloadHandler;
    const fileInfo = { confNum: 1, comment: '', size: 1000 };
    expect(handler.isFreeDownload(fileInfo)).toBe(true);
  });
});
