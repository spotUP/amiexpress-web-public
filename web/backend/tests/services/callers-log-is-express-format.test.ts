/**
 * The board's CallersLog is express.e's, so the tools that read one find the
 * calls in it.
 *
 * GLCUpdater (utils/glc-updater.ts, GLCUpdater.e:565, 753) and SAmiLog.asm
 * count a call only where the line after a divider carries ` (CONNECT `,
 * ` (SYSOP_LOCAL)` or ` (F2_LOCAL)` - the line displayUserToCallersLog writes
 * (express.e:16034-16042):
 *
 *   MM-DD-YY (HH:MM:SS) [slot] name (connectString) location
 *
 * The board wrote `04-Oct-26 16:43 [1] spot (LOCAL) location` - its own
 * stamp, slot 1 for everybody, `(LOCAL)` for a telnet caller - and live
 * Node1/CallersLog held 87 dividers and not one call.
 *
 * Driven through `runPostAuthLogin`, the pipeline every transport's login runs
 * (harness of tests/server/login-loads-the-account-from-disk.test.ts), and the
 * logoff writer the disconnect and `G` paths share; the result is read back
 * with the real GLC parser.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/node-reservation.service', () => ({
  ...jest.requireActual('../../src/services/node-reservation.service'),
  isReservationMatch: jest.fn(() => true),
}));
jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff: jest.fn(),
}));
jest.mock('../../src/services/user-already-online', () => ({
  ...jest.requireActual('../../src/services/user-already-online'),
  userAlreadyOnNode: jest.fn(() => null),
}));
jest.mock('../../src/services/mail-notification.service', () => ({
  ...jest.requireActual('../../src/services/mail-notification.service'),
  mailOnLogon: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/batch-scheduler', () => ({
  ...jest.requireActual('../../src/services/batch-scheduler'),
  runExecuteOn: jest.fn(async () => undefined),
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: jest.fn(async () => true),
  doPause: jest.fn(async () => undefined),
}));
jest.mock('../../src/database', () => ({
  db: {
    updateUser: jest.fn(async () => undefined),
    generateAccessToken: jest.fn(async () => 'token'),
    generateRefreshToken: jest.fn(async () => 'refresh'),
    getUserByUsername: jest.fn(async () => null),
  },
  getDatabase: () => ({
    updateUser: jest.fn(async () => undefined),
    getUserByUsername: jest.fn(async () => null),
  }),
}));

import * as fs from 'fs';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { callersLogManager } from '../../src/services/CallersLogManager';
import { userFileManager } from '../../src/services/UserFileManager';
import { getSystemTime } from '../../src/utils/date-time.util';
import { findCallStart, parseCalls } from '../../src/utils/glc-updater';

const NODE = 4;
const logoffMode = { ignoreLocal: true, ignoreSysop: true, ignoreSysopUser: false, processAll: false };

function emitter() {
  return {
    id: 'callers-log-socket',
    emit() { return true; },
    on() { return this; },
    join() { return this; },
  } as any;
}

function account(username: string, slotNumber: number, calls: number): any {
  const yesterday = new Date(getSystemTime().getTime() - 2 * 86400 * 1000);
  return {
    id: `row-${username}`, username, slotNumber, passwordHash: 'hash',
    realname: 'Log Caller', location: 'Test Account', phone: '', email: '',
    secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0,
    chatLimit: 600, chatUsed: 0, lastLogin: yesterday, firstLogin: yesterday,
    calls, callsToday: 0, newUser: calls === 0, expert: 'N', ansi: true,
    linesPerScreen: 23, computer: '', screenType: '', protocol: '/X Zmodem',
    editor: 'Prompt', zoomType: 'QWK', availableForChat: true, quietNode: false,
    autoRejoin: 1, confAccess: 'XXXXXXXXXX', areaName: '', uuCP: false,
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0, baud: 0,
    created: yesterday, updated: yesterday,
  };
}

/** One call on NODE: the login pipeline, then the logoff line. */
async function call(username: string, slot: number, calls: number): Promise<Buffer> {
  const logPath = callersLogManager.logPathFor(NODE);
  fs.rmSync(logPath, { force: true });
  userFileManager.writeUserFiles(account(username, slot, calls), slot);
  const logLogin = jest.spyOn(callersLogManager, 'logLogin');
  const { runPostAuthLogin } = require('../../src/services/login-post.service');
  const session: any = {
    state: BBSState.LOGON, subState: LoggedOnSubState.READ_COMMAND,
    connectionType: 'telnet', nodeId: NODE, tempData: {},
  };

  await runPostAuthLogin(emitter(), session, account(username, slot, calls), {
    lastLoginBeforeUpdate: account(username, slot, calls).lastLogin,
  });
  // The sentinel: the login pipeline wrote this call's logon line.
  expect(logLogin).toHaveBeenCalledTimes(1);
  logLogin.mockRestore();

  session.cleanLogoff = true;
  callersLogManager.logLogoffOnce(session, 'N');
  callersLogManager.logLogoffOnce(session, 'N'); // the disconnect after `G`: once only
  return fs.readFileSync(logPath);
}

describe('a call in the CallersLog', () => {
  it('is express.e:16041 and logoffLog, byte for byte, and GLCUpdater finds it', async () => {
    const log = await call('regress', 907, 3);
    const lines = log.toString('utf8').split('\n');

    expect(lines[0]).toBe('*'.repeat(62));
    expect(lines[1]).toMatch(/^\d\d-\d\d-\d\d \(\d\d:\d\d:\d\d\) \[907\] regress \(CONNECT 19200\) Test Account$/);
    expect(lines.filter(l => / regress Off /.test(l))).toHaveLength(1);
    expect(lines[lines.length - 2]).toMatch(/^\d\d-\d\d-\d\d \(\d\d:\d\d:\d\d\) regress Off Normally$/);

    const start = findCallStart(log, false);
    expect(start).not.toBeNull();
    const [glc] = parseCalls(log, start!, logoffMode);
    expect(glc).toMatchObject({ userName: 'regress', location: 'Test Account', userNum: 907, skip: false });
    expect(glc.timeOff).toBe(lines[lines.length - 2].substr(10, 5));
  });

  it("is `NEW [n]` on the account's first call, which GLCUpdater marks `*`", async () => {
    const log = await call('firsttimer', 908, 0);
    expect(log.toString('utf8').split('\n')[1]).toMatch(/\) NEW \[908\] firsttimer \(CONNECT 19200\) Test Account$/);

    const [glc] = parseCalls(log, findCallStart(log, false)!, logoffMode);
    expect(glc).toMatchObject({ userName: 'firsttimer', userNum: 908, skip: false });
    expect(glc.actions[0]).toBe('*');
  });
});
