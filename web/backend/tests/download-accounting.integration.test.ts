import { db as singletonDb } from '../src/database';
import { ConferenceRepository } from '../src/database/conference-repository';
import { DownloadHandler as RawDownloadHandler } from '../src/handlers/file/download.handler';

// Access private method for testing
const DownloadHandler: any = RawDownloadHandler;

describe('download accounting integration (per-conference + credit tracking)', () => {
  let repo: ConferenceRepository;

  beforeAll(async () => {
    await singletonDb.init();
    repo = new ConferenceRepository((singletonDb as any).db);
  }, 30000);

  afterAll(async () => {
    await singletonDb.close();
  });

  it('increments conference stats when ACS conference accounting is enabled', async () => {
    const confBefore = await repo.getConferenceById(1);

    // Post c316ada1e fix(security), checkSecurity uses file-based ACS lookups
    // (no more secLevel >= 100 fallback). Grant CONFERENCE_ACCOUNTING via the
    // user's securityFlags string — that path doesn't require Access/ files.
    // ACSPermission.CONFERENCE_ACCOUNTING = 57. securityFlags is indexed by
    // permission number; "T" grants, "F" denies, "?" defers to default logic.
    const securityFlags = '?'.repeat(87).split('');
    securityFlags[57] = 'T';

    const session: any = {
      user: {
        username: 'tester',
        secLevel: 50, // non-sysop
        securityFlags: securityFlags.join(''),
        secOverride: '',
      },
      conferences: await repo.getConferences(),
      nodeId: 1,
    };

    const fileInfo = { confNum: 1, size: 200 };

    await DownloadHandler.updateConferenceDownloadStats(session, fileInfo, false);

    const confAfter = await repo.getConferenceById(1);
    expect(confAfter?.downloads).toBe((confBefore?.downloads || 0) + 1);
    expect(confAfter?.bytesDownload).toBe((confBefore?.bytesDownload || 0) + 200);
  });

  it('skips conference increments when credit tracking disables downloads', async () => {
    const confBefore = await repo.getConferenceById(1);
    const session: any = {
      user: {
        username: 'credit',
        secLevel: 50,
        creditDays: 5,
        creditStartDate: Math.floor(Date.now() / 1000) - 100,
        creditTracking: 0, // TRACK_DOWNLOADS_BIT not set
      },
      conferences: await repo.getConferences(),
      nodeId: 1,
    };

    const fileInfo = { confNum: 1, size: 300 };

    await DownloadHandler.updateConferenceDownloadStats(session, fileInfo, false);

    const confAfter = await repo.getConferenceById(1);
    expect(confAfter?.downloads).toBe(confBefore?.downloads || 0);
    expect(confAfter?.bytesDownload).toBe(confBefore?.bytesDownload || 0);
  });
});
