// @ts-nocheck
/**
 * CREATING A CONFERENCE IN THE WEB ADMIN MAKES IT VISIBLE TO THE J COMMAND.
 *
 * The sysop's report: "i created a new conference now in the web admin but
 * it's not visible via the join conference command in the bbs".
 *
 * The board's account string for the sysop was `XXXXX____` (nine wide, a
 * leftover from a larger board). Conference 6 was created, slot 6 stayed '_',
 * and checkConfAccess (express.e:8499-8512, the check J runs per conference)
 * said no. Unit tests of the grant alone cannot show that the admin route
 * ever calls it, so this drives the real POST /api/config/conferences, with a
 * real user.data, and reads the answer back through the same checkConfAccess
 * the J command uses.
 *
 * The sentinel proves grantConferenceAccess ran exactly once on the way.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

// Pass-through wrapper: the real grant runs, the mock only counts the calls.
jest.mock('../../src/services/conference-access-expansion', () => {
  const actual = jest.requireActual('../../src/services/conference-access-expansion');
  return { ...actual, grantConferenceAccess: jest.fn(actual.grantConferenceAccess) };
});

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-create-join-'));
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-create-join-db-'));
process.env.BBS_DATA_DIR = dataDir;
process.env.DATABASE_DIR = dbDir;
process.env.DATABASE_FILE = 'conf-create-join.db';

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

describe('POST /api/config/conferences reaches the J command', () => {
  let app: any;
  let db: any;
  let getConfig: jest.SpyInstance;
  let userFileManager: any;
  let checkConfAccess: any;
  let expansion: any;

  beforeAll(async () => {
    jest.resetModules();
    const express = require('express');
    const { config } = require('../../src/config');
    getConfig = jest.spyOn(config, 'getConfig').mockReturnValue({ dataDir } as any);
    ({ userFileManager } = require('../../src/services/UserFileManager'));
    ({ checkConfAccess } = require('../../src/handlers/message/message-scan.handler'));
    expansion = require('../../src/services/conference-access-expansion');
    const { Database } = require('../../src/database');
    const { createConfigRouter } = require('../../src/api/config-routes');

    const lines = ['NCONFS=5'];
    for (let i = 1; i <= 5; i++) {
      fs.mkdirSync(path.join(dataDir, `Conf${i}`), { recursive: true });
      lines.push(`NAME.${i}=Conference ${i}`, `LOCATION.${i}=BBS:Conf${i}/`);
    }
    fs.writeFileSync(path.join(dataDir, 'ConfConfig.info'), lines.join('\n') + '\n', 'utf8');

    userFileManager.writeUserFiles(account('SYSOP', 'XXXXX____', 255), 1);
    userFileManager.writeUserFiles(account('CALLER', 'XXXXX____', 10), 2);

    db = new Database();
    await db.init();
    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(db));
  }, 30000);

  afterAll(async () => {
    if (db) await db.close();
    if (getConfig) getConfig.mockRestore();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it('a sysop-only conference 6 is joinable by the sysop and not by a caller', async () => {
    const grantSpy = expansion.grantConferenceAccess as jest.Mock;

    const res = await request(app)
      .post('/api/config/conferences')
      .send({ conference_id: 6, name: 'Sysop Lounge', grant: { kind: 'sysop' } });

    expect(res.status).toBe(200);
    expect(grantSpy).toHaveBeenCalledTimes(1);
    expect(grantSpy.mock.calls[0][1]).toBe(6);

    const sysop = userFileManager.readUserBySlot(1);
    const caller = userFileManager.readUserBySlot(2);
    expect(checkConfAccess(sysop, 6)).toBe(true);
    expect(checkConfAccess(caller, 6)).toBe(false);
  });
});
