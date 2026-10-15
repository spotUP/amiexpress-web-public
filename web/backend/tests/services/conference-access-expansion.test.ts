// @ts-nocheck
/**
 * A CONFERENCE THE BOARD GAINS REACHES THE USER.DATA RECORD - not just SQL.
 *
 * "i created conf 13 now 'test' but i dont see it in the bbs": the sysop's
 * access string was too short, and the board reads a missing position as no
 * access. So boot and every conference refresh widen each account (WEB_ -
 * express.e has no such step; see conference-access-expansion.ts).
 *
 * That widening wrote ONLY the SQL rows - `UPDATE users SET confaccess` -
 * and a database copy of the new-user default nothing reads. user.data, the
 * record express.e and every door read (checkConfAccess, express.e:8499-8512),
 * never changed. And it padded an area NAME as if it were flags, turning
 * "Elite" into "EliteX": an area that does not exist, so no access at all.
 *
 * Driven against a real user.data in a temp board, through the board's one
 * user.data writer, reading the records back.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'access-expansion-'));
process.env.BBS_DATA_DIR = dataDir;

jest.resetModules();
const { config } = require('../../src/config');
const getConfig = jest.spyOn(config, 'getConfig').mockReturnValue({ dataDir } as any);
const { userFileManager } = require('../../src/services/UserFileManager');
const { expandConferenceAccessTo, padAccessTo } = require('../../src/services/conference-access-expansion');

function account(username: string, confAccess: string): any {
  return {
    id: username, username, realname: username, location: '', phone: '', secLevel: 10,
    uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0, ratioType: 0,
    timeTotal: 0, timeLimit: 60, timeUsed: 0, chatLimit: 0, chatUsed: 0,
    firstLogin: new Date(), lastLogin: new Date(), calls: 1, callsToday: 1, newUser: false,
    expert: 'N', ansi: true, linesPerScreen: 23, computer: '', screenType: 'ANSI', protocol: 'Z',
    editor: 'FULL', zoomType: 'QWK', availableForChat: true, quietNode: false, autoRejoin: 1,
    confAccess, areaName: '', uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0,
  };
}

/** The SQL mirror: every statement run against it. */
function mirror() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  return { runs, prepare: (sql: string) => ({ run: (...params: unknown[]) => { runs.push({ sql, params }); } }) };
}

beforeAll(() => {
  userFileManager.writeUserFiles(account('SHORT', 'XXX'), 1);
  userFileManager.writeUserFiles(account('ELITE', 'Elite'), 2);
  userFileManager.writeUserFiles(account('FULL', 'XXXXX'), 3);
});

afterAll(() => {
  getConfig.mockRestore();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('a conference the board gains', () => {
  it('reaches the user.data record of a flag-string account, and the SQL row follows it', () => {
    const sqlite = mirror();

    const result = expandConferenceAccessTo({ users: userFileManager, sqlite }, 5);

    expect(userFileManager.readUserBySlot(1).confAccess).toBe('XXXXX');
    expect(result.usersExpanded).toBe(1);
    expect(sqlite.runs.map((r) => r.params)).toEqual([['XXXXX', 1]]);
  });

  it('leaves an area name alone - the area grants new conferences', () => {
    expandConferenceAccessTo({ users: userFileManager, sqlite: mirror() }, 7);
    expect(userFileManager.readUserBySlot(2).confAccess).toBe('Elite');
  });

  it('stops at nine flags, the most a user.data record can hold', () => {
    expandConferenceAccessTo({ users: userFileManager, sqlite: mirror() }, 13);
    expect(userFileManager.readUserBySlot(3).confAccess).toBe('XXXXXXXXX');
  });

  it('does nothing on a board with no conferences', () => {
    const sqlite = mirror();
    expect(expandConferenceAccessTo({ users: userFileManager, sqlite }, 0)).toEqual({ usersExpanded: 0 });
    expect(sqlite.runs).toEqual([]);
  });
});

describe('padAccessTo', () => {
  it('grants the new positions and leaves the old ones alone', () => {
    expect(padAccessTo('XX_X', 6)).toBe('XX_XXX');
  });

  it('never shortens', () => {
    expect(padAccessTo('XXXXXXXXX', 5)).toBe('XXXXXXXXX');
  });
});
