/**
 * AN FTP CALLER GETS TODAY'S DOWNLOAD ALLOWANCE.
 *
 * express.e's FTP logon (processFtpLoggedOnUser, 28902-28925) runs the same
 * day reset as the BBS logon (28506-28528): a caller last on yesterday has
 * dailyBytesDld zeroed, timesOnToday zeroed and todaysBytesLimit put back to
 * dailyBytesLimit, so bytesADL (28927-28931) is today's. The port's FTP logon
 * ran none of it: yesterday's downloads still counted against today's limit,
 * so a caller who reached it yesterday was refused over FTP today.
 *
 * Driven through the board's own `authenticate` (boardFtpDeps) over a real
 * user.data on this run's temp board; only the password check is stubbed.
 */
process.env.SKIP_DB_INIT = '1';

const authenticateUser = jest.fn();
jest.mock('../../src/database', () => ({
  db: {
    authenticateUser: (...args: unknown[]) => authenticateUser(...args),
    getUserByUsername: jest.fn(async () => null),
    updateUser: jest.fn(async () => undefined),
    getUserById: jest.fn(async () => null),
    getConfigRepository: () => ({ getConferenceConfigs: () => [] }),
  },
  getDatabase: () => ({}),
}));

import { boardFtpDeps } from '../../src/ftp/ftp-auth';
import { userFileManager } from '../../src/services/UserFileManager';

const DAY = 86400 * 1000;

function row(username: string, slotNumber: number, lastLogin: Date): any {
  return {
    id: `row-${username}`, username, slotNumber, passwordHash: 'hash',
    realname: 'Ftp Caller', location: 'Here', phone: '', email: '',
    secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 1200,
    chatLimit: 600, chatUsed: 0, lastLogin, firstLogin: lastLogin,
    calls: 3, callsToday: 4, newUser: false, expert: 'N', ansi: true,
    linesPerScreen: 23, computer: '', screenType: '', protocol: '/X Zmodem',
    editor: 'Prompt', zoomType: 'QWK', availableForChat: true, quietNode: false,
    autoRejoin: 1, confAccess: 'XXXXXXXXXX', areaName: '', uuCP: false,
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 1_000_000, userFlags: 0, baud: 0,
    dailyBytesDld: 1_000_000, todaysBytesLimit: 9_000_000,
    created: lastLogin, updated: lastLogin,
  };
}

async function logOn(username: string, slot: number, lastLogin: Date): Promise<any> {
  const r = row(username, slot, lastLogin);
  userFileManager.writeUserFiles(r, slot);
  authenticateUser.mockImplementation(async () => row(username, slot, lastLogin));
  return boardFtpDeps().authenticate(username, 'right');
}

describe('the FTP logon day reset (express.e:28902-28925)', () => {
  it('gives a caller last on two days ago today\'s download allowance back', async () => {
    const user = await logOn('ftpnewday', 931, new Date(Date.now() - 2 * DAY));
    expect(user.dailyBytesDld).toBe(0);
    expect(user.todaysBytesLimit).toBe(1_000_000);
    expect(user.timeUsed).toBe(0);
    expect(user.callsToday).toBe(0);
  });

  it('keeps today\'s downloads and extra bytes on a second call the same day', async () => {
    const user = await logOn('ftpsameday', 932, new Date());
    expect(user.dailyBytesDld).toBe(1_000_000);
    expect(user.todaysBytesLimit).toBe(9_000_000);
  });

  // express.e:8197-8207 at the FTP session's logoff (29021): what the
  // session changed - here today's limit an upload raised - reaches user.data.
  it('saves what an FTP session changed to the account on disk at logoff', async () => {
    const user = await logOn('ftpsaves', 933, new Date());
    user.todaysBytesLimit = 9_004_242;
    await boardFtpDeps().saveAccount!(user);
    const { loadAccount } = require('../../src/services/load-account');
    const { user: reloaded } = loadAccount(row('ftpsaves', 933, new Date()));
    expect(reloaded.todaysBytesLimit).toBe(9_004_242);
  });
});
