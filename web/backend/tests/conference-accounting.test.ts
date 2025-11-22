import { checkDownloadRatios } from '../src/utils/download-ratios.util';
import type { User } from '../src/types';
import type { Conference } from '../src/database/types';

function makeUser(overrides: Partial<User> = {}): User {
  const now = new Date();
  return {
    id: 'u1',
    username: 'tester',
    passwordHash: '',
    realname: 'Test User',
    location: '',
    phone: '',
    secLevel: 10,
    uploads: 0,
    downloads: 0,
    bytesUpload: 0,
    bytesDownload: 0,
    ratio: 1,
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

function makeConference(overrides: Partial<Conference> = {}): Conference {
  const now = new Date();
  return {
    id: overrides.id ?? 1,
    name: 'Conf1',
    description: '',
    ratio: 1,
    ratioType: 0,
    uploads: 0,
    downloads: 0,
    bytesUpload: 0,
    bytesDownload: 0,
    created: now,
    updated: now,
    ...overrides
  };
}

describe('conference accounting parity', () => {
  it('enforces per-conference byte ratio when ACS_CONFERENCE_ACCOUNTING enabled', async () => {
    const user = makeUser({ secLevel: 50 }); // not sysop
    const conferences = [
      makeConference({
        id: 1,
        ratio: 2,
        ratioType: 0,
        bytesUpload: 1_000,
        bytesDownload: 100
      })
    ];

    // allowed bytes = (2*1000) - 100 = 1900
    const result = await checkDownloadRatios(
      user,
      [{ size: 2_000, conference: 1 }],
      conferences,
      true
    );
    expect(result.canDownload).toBe(false);
    expect(result.errorMessage).toMatch(/Conf 1/i);
  });

  it('bypasses per-conference ratios when credit account is active', async () => {
    const now = Math.floor(Date.now() / 1000);
    const user = makeUser({ creditDays: 2, creditStartDate: now - 10, secLevel: 50 });
    const conferences = [
      makeConference({
        id: 1,
        ratio: 1,
        ratioType: 0,
        bytesUpload: 100,
        bytesDownload: 0
      })
    ];

    // Would normally fail because requested > allowedBytesConf (100)
    const result = await checkDownloadRatios(
      user,
      [{ size: 150, conference: 1 }],
      conferences,
      true
    );
    expect(result.canDownload).toBe(true);
  });

  it('enforces per-conference file ratio (ratioType=2) when accounting enabled', async () => {
    const user = makeUser({ secLevel: 50 });
    const conferences = [
      makeConference({
        id: 1,
        ratio: 1,
        ratioType: 2,
        uploads: 1,
        downloads: 1
      })
    ];

    // allowed files = (1*(1+1)) - 1 = 1
    const result = await checkDownloadRatios(
      user,
      [{ size: 10, conference: 1 }, { size: 10, conference: 1 }],
      conferences,
      true
    );
    expect(result.canDownload).toBe(false);
    expect(result.errorMessage).toMatch(/Conf 1/i);
  });
});
