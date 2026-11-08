// @ts-nocheck
/**
 * CREATING CONFERENCE N DECIDES SLOT N FOR EVERY ACCOUNT - it does not trust
 * string length.
 *
 * "i created a new conference now in the web admin but it's not visible via
 * the join conference command in the bbs": conference 6 was created, and the
 * expansion only grows strings SHORTER than the conference count. The sysop's
 * string was `XXXXX____` - nine wide, left over from a fourteen-conference
 * board - so slot 6 stayed '_' and J (~CL, checkConfAccess express.e:8499)
 * never listed it. Eight short-string users got it; ten long-string users,
 * the sysop among them, did not.
 *
 * Driven against a real user.data in a temp board, read back through the
 * board's one user.data reader.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'access-grant-'));
process.env.BBS_DATA_DIR = dataDir;

jest.resetModules();
const { config } = require('../../src/config');
const getConfig = jest.spyOn(config, 'getConfig').mockReturnValue({ dataDir } as any);
const { userFileManager } = require('../../src/services/UserFileManager');
const { grantConferenceAccess } = require('../../src/services/conference-access-expansion');

function account(username: string, confAccess: string, secLevel: number): any {
  return {
    id: username, username, realname: username, location: '', phone: '', secLevel,
    uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0, ratioType: 0,
    timeTotal: 0, timeLimit: 60, timeUsed: 0, chatLimit: 0, chatUsed: 0,
    firstLogin: new Date(), lastLogin: new Date(), calls: 1, callsToday: 1, newUser: false,
    expert: 'N', ansi: true, linesPerScreen: 23, computer: '', screenType: 'ANSI', protocol: 'Z',
    editor: 'FULL', zoomType: 'QWK', availableForChat: true, quietNode: false, autoRejoin: 1,
    confAccess, areaName: '', uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0,
  };
}

function mirror() {
  const runs: Array<unknown[]> = [];
  return { runs, prepare: () => ({ run: (...params: unknown[]) => { runs.push(params); } }) };
}

function seed(): void {
  userFileManager.writeUserFiles(account('SYSOP', 'XXXXX____', 255), 1);
  userFileManager.writeUserFiles(account('CALLER', 'XXXXX____', 10), 2);
  userFileManager.writeUserFiles(account('SHORT', 'XXX', 10), 3);
  userFileManager.writeUserFiles(account('COSYSOP', 'XXXXX', 100), 4);
  userFileManager.writeUserFiles(account('ELITE', 'Elite', 255), 5);
}

const access = (slot: number): string => userFileManager.readUserBySlot(slot).confAccess;

beforeEach(seed);

afterAll(() => {
  getConfig.mockRestore();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('grantConferenceAccess', () => {
  it('everyone: sets the slot even where a stale tail had it "_" - the sysop included', () => {
    const sqlite = mirror();
    const result = grantConferenceAccess({ users: userFileManager, sqlite }, 6, { kind: 'everyone' });

    expect(access(1)).toBe('XXXXXX___');
    expect(access(2)).toBe('XXXXXX___');
    expect(access(3)).toBe('XXXXXX');
    expect(access(4)).toBe('XXXXXX');
    expect(access(5)).toBe('Elite');
    expect(result).toEqual({ usersGranted: 4, usersChanged: 4, beyondDiskWidth: false });
    expect(sqlite.runs).toContainEqual(['XXXXXX___', 1]);
  });

  it('sysop only: the full sysop gets it, everyone else is decided "_"', () => {
    grantConferenceAccess({ users: userFileManager, sqlite: mirror() }, 6, { kind: 'sysop' });

    expect(access(1)).toBe('XXXXXX___');
    expect(access(2)).toBe('XXXXX____');
    expect(access(3)).toBe('XXXXX_');
    expect(access(4)).toBe('XXXXX_');
  });

  it('by access level: at or above the level gets it', () => {
    grantConferenceAccess({ users: userFileManager, sqlite: mirror() }, 6, { kind: 'level', minLevel: 100 });

    expect(access(1)).toBe('XXXXXX___');
    expect(access(2)).toBe('XXXXX____');
    expect(access(4)).toBe('XXXXXX');
  });

  it('past the ninth flag user.data cannot hold it, and says so', () => {
    const sqlite = mirror();
    expect(grantConferenceAccess({ users: userFileManager, sqlite }, 10, { kind: 'everyone' }))
      .toEqual({ usersGranted: 0, usersChanged: 0, beyondDiskWidth: true });
    expect(sqlite.runs).toEqual([]);
  });
});
