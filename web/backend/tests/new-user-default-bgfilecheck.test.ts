/**
 * DEFAULT_BGFILECHECK at new-user creation.
 *
 * express.e:30284 - `IF bgFileCheck AND DEFAULT_BGFILECHECK THEN userFlags OR
 * USER_BGFILECHECK` while the new record is built. bgFileCheck is express.e's
 * global (session.bgFileCheck): a session that has not raised it gets no flag.
 * createUser must also keep the flags it is given (it used to drop them).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../src/config';
import { clearNodeTooltypeCache } from '../src/utils/node-tooltypes.util';
import { newUserDefaultFlags } from '../src/handlers/user/new-user.handler';
import { UserFlag } from '../src/constants/express-flags';

let board: string;
let previousDataDir: string;
beforeEach(() => {
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'newbg-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', board);
  clearNodeTooltypeCache();
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  clearNodeTooltypeCache();
  fs.rmSync(board, { recursive: true, force: true });
});
const icon = (t: string) => { fs.writeFileSync(path.join(board, 'Node1.info'), t); clearNodeTooltypeCache(); };

describe('new account USER_BGFILECHECK (express.e:30284)', () => {
  test('DEFAULT_BGFILECHECK with bgFileCheck raised sets the flag', () => {
    icon('BGFILECHECK\nDEFAULT_BGFILECHECK\n');
    expect(newUserDefaultFlags({ nodeId: 1, bgFileCheck: true })).toBe(UserFlag.BGFILECHECK);
  });
  test('no DEFAULT_BGFILECHECK, or bgFileCheck clear, leaves it off', () => {
    icon('BGFILECHECK\n');
    expect(newUserDefaultFlags({ nodeId: 1, bgFileCheck: true })).toBe(0);
    icon('DEFAULT_BGFILECHECK\n');
    expect(newUserDefaultFlags({ nodeId: 1, bgFileCheck: false })).toBe(0);
    expect(newUserDefaultFlags({ nodeId: 1 })).toBe(0);
  });
  test('createUser keeps the flags it is given', async () => {
    const db = (global as any).testDb;
    if (!db) throw new Error('Test database not initialized');
    const id = await db.createUser({
      username: `bgdef_${Date.now()}`, passwordHash: 'x', realname: 'b', location: '', phone: '', email: 'a@b.c',
      secLevel: 10, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0, ratioType: 0,
      timeTotal: 0, timeLimit: 60, timeUsed: 0, chatLimit: 30, chatUsed: 0,
      firstLogin: new Date(), lastLogin: new Date(), calls: 1, callsToday: 1, newUser: true, expert: 'N', ansi: true,
      linesPerScreen: 23, computer: 'AMiGA 500', screenType: 'ANSI', protocol: 'ZMODEM', editor: 'FULL', zoomType: 'NONE',
      availableForChat: true, quietNode: false, autoRejoin: 1, confAccess: 'XXX', areaName: '', uuCP: false,
      topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: UserFlag.BGFILECHECK,
    } as any);
    expect((await db.getUserById(id)).userFlags).toBe(UserFlag.BGFILECHECK);
  });
});
