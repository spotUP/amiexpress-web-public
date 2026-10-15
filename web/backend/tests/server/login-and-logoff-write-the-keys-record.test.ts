/**
 * userKeys at logon and logoff, as express.e writes it.
 *
 *   logon  (29759, 30102)  loggedOnUserKeys.baud:=onlineBaud
 *   logoff (8193-8195)     userKeys.userName := UpperStr(name); userKeys.number := slotNumber
 *
 * The port wrote userKeys.baud only for a NEW account and never touched
 * userName/number of an existing one, so every record kept the constructor's
 * default speed and a mixed-case name.
 *
 * ONE reachability test: runPostAuthLogin (the pipeline every transport's
 * login runs) then saveAccountAtLogoff, read back from user.keys. The deleted
 * record case is the pure overlay rule and lives with it.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/node-reservation.service', () => ({
  ...jest.requireActual('../../src/services/node-reservation.service'),
  isReservationMatch: jest.fn(() => true),
}));
const beginLogoff = jest.fn();
jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff,
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

const updateUser = jest.fn(async (..._args: unknown[]) => undefined);
let currentRow: unknown = null;
jest.mock('../../src/database', () => ({
  db: {
    updateUser: (...args: unknown[]) => updateUser(...args),
    getUserById: jest.fn(async () => currentRow),
    generateAccessToken: jest.fn(async () => 'token'),
    generateRefreshToken: jest.fn(async () => 'refresh'),
    getUserByUsername: jest.fn(async () => null),
  },
  getDatabase: () => ({
    updateUser: (...args: unknown[]) => updateUser(...args),
    getUserByUsername: jest.fn(async () => null),
  }),
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { userFileManager } from '../../src/services/UserFileManager';
import { saveAccountAtLogoff } from '../../src/services/account.service';
import { getSystemTime } from '../../src/utils/date-time.util';

function emitter() {
  return {
    id: 'keys-login-socket',
    emit() { return true; },
    on() { return this; },
    join() { return this; },
  } as any;
}

function session(): any {
  return {
    state: BBSState.LOGON, subState: LoggedOnSubState.READ_COMMAND,
    connectionType: 'telnet', nodeId: 3, tempData: {},
  };
}

function row(username: string, slotNumber: number): any {
  const yesterday = new Date(getSystemTime().getTime() - 2 * 86400 * 1000);
  return {
    id: `row-${username}`, username, slotNumber, passwordHash: 'hash',
    realname: 'Keys Caller', location: 'Here', phone: '', email: '',
    secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0,
    chatLimit: 600, chatUsed: 0, lastLogin: yesterday, firstLogin: yesterday,
    calls: 3, callsToday: 0, newUser: false, expert: 'N', ansi: true,
    linesPerScreen: 23, computer: '', screenType: '', protocol: '/X Zmodem',
    editor: 'Prompt', zoomType: 'QWK', availableForChat: true, quietNode: false,
    autoRejoin: 1, confAccess: 'XXXXXXXXXX', areaName: '', uuCP: false,
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0, baud: 0,
    created: yesterday, updated: yesterday,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('userKeys at logon and logoff', () => {
  it('a logon holds the connect speed and the logoff writes the upper-case name and the slot', async () => {
    const slot = 911;
    // A record as the old writer left it: the default speed, a mixed-case name, number 0.
    userFileManager.writeUserFiles({ ...row('Keys Caller', slot), connectBaud: 4800 } as any, slot);
    userFileManager.patchUserRecord(slot, { keys: { number: 5 } });
    expect(userFileManager.readRecordStructs(slot).keys).toMatchObject({ baud: 4800, userName: 'Keys Caller', number: 5 });

    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const s = session();
    currentRow = row('Keys Caller', slot);
    await runPostAuthLogin(emitter(), s, row('Keys Caller', slot), {
      lastLoginBeforeUpdate: row('Keys Caller', slot).lastLogin,
    });
    // The logon changes it in memory only: nothing on disk yet.
    expect(userFileManager.readRecordStructs(slot).keys.baud).toBe(4800);

    const writes = jest.spyOn(userFileManager, 'patchUserRecord');
    await saveAccountAtLogoff(s);
    // The sentinel: the logoff's identity overlay ran.
    expect(writes).toHaveBeenCalledWith(slot, { keys: { userName: 'KEYS CALLER', number: slot } });
    writes.mockRestore();

    expect(userFileManager.readRecordStructs(slot).keys).toMatchObject({
      baud: 19200, userName: 'KEYS CALLER', number: slot,
    });
  });

  it('a deleted record keeps its 0 in userKeys.number across the logoff', async () => {
    const slot = 912;
    userFileManager.writeUserFiles({ ...row('Gone Caller', slot) } as any, slot);
    userFileManager.patchUserRecord(slot, { keys: { number: 0 } });
    const s: any = { user: { ...row('Gone Caller', slot), id: 'row-Gone Caller' }, currentConf: 1, newSinceFlag: false };
    currentRow = row('Gone Caller', slot);

    await saveAccountAtLogoff(s);

    expect(userFileManager.readRecordStructs(slot).keys).toMatchObject({ userName: 'GONE CALLER', number: 0 });
  });
});
