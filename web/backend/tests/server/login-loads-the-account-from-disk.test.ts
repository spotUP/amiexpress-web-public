/**
 * A login runs on the caller's user.data record, not on the database row.
 *
 * express.e:29664 loads the account off the disk at logon (loadAccount,
 * 7977-8022) and writes nothing back until logoff (8207). This port read the
 * users ROW and wrote it over the record on every login (login-post.service),
 * so the post count went to 0 (the table has no column for it) and a level a
 * door had saved into user.data was put back to the row's.
 *
 * Driven through `runPostAuthLogin`, the pipeline every transport's login
 * runs, against a real user.data on this run's temp board.
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
jest.mock('../../src/database', () => ({
  db: {
    updateUser: (...args: unknown[]) => updateUser(...args),
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
import { getSystemTime } from '../../src/utils/date-time.util';

function emitter() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    emitted,
    id: 'disk-login-socket',
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
    join() { return this; },
  } as any;
}

function session(): any {
  return {
    state: BBSState.LOGON,
    subState: LoggedOnSubState.READ_COMMAND,
    connectionType: 'telnet',
    nodeId: 3,
    tempData: {},
  };
}

/** The users row, as getUserByUsername maps it: no messagesPosted column. */
function row(username: string, slotNumber: number): any {
  const yesterday = new Date(getSystemTime().getTime() - 2 * 86400 * 1000);
  return {
    id: `row-${username}`, username, slotNumber, passwordHash: 'hash',
    realname: 'Disk Caller', location: 'Here', phone: '', email: '',
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

/** The record a door left: level 200 saved, seven posts, 30 minutes used today. */
function writeRecord(username: string, slot: number, extra: Record<string, unknown> = {}): void {
  userFileManager.writeUserFiles({
    ...row(username, slot),
    secLevel: 200,
    messagesPosted: 7,
    timeUsed: 1800,
    calls: 3,
    lastLogin: getSystemTime(),
    ...extra,
  } as any, slot);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('a login', () => {
  it('runs on the user.data record, and leaves it as it was', async () => {
    const slot = 901;
    writeRecord('diskcaller', slot);
    const readSpy = jest.spyOn(userFileManager, 'readUserBySlot');
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const s = session();

    await runPostAuthLogin(emitter(), s, row('diskcaller', slot), {
      lastLoginBeforeUpdate: row('diskcaller', slot).lastLogin,
    });

    // The sentinel: the pipeline read the record at the caller's slot.
    expect(readSpy).toHaveBeenCalledWith(slot);
    readSpy.mockRestore();

    // The session is the record's, not the row's.
    expect(s.user.messagesPosted).toBe(7);
    expect(s.user.secLevel).toBe(200);
    // Same day as the record's timeLastOn: today's half hour is not given back.
    expect(s.user.timeUsed).toBe(1800);
    // express.e:16045 - one more call, in memory.
    expect(s.user.calls).toBe(4);

    // Nothing wrote the row over the record.
    const after = userFileManager.readUserBySlot(slot)!;
    expect(after.messagesPosted).toBe(7);
    expect(after.secLevel).toBe(200);
    expect(after.timeUsed).toBe(1800);

    // The row follows the record, and that write does not touch the disk.
    expect(updateUser).toHaveBeenCalledWith(
      `row-diskcaller`,
      expect.objectContaining({ secLevel: 200, timeUsed: 1800, calls: 4 }),
      { syncDisk: false },
    );
  });

  it('falls back to the row when the slot holds another account', async () => {
    const slot = 902;
    writeRecord('somebodyelse', slot);
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const s = session();

    await runPostAuthLogin(emitter(), s, row('rowonly', slot), {
      lastLoginBeforeUpdate: row('rowonly', slot).lastLogin,
    });

    expect(s.user.username).toBe('rowonly');
    expect(s.user.secLevel).toBe(20);
    // And it did not write over the other account either.
    expect(userFileManager.readUserBySlot(slot)!.username).toBe('somebodyelse');
  });

  it('refuses an account whose record is deleted, at the position it still holds', async () => {
    const slot = 903;
    writeRecord('deletedcaller', slot, { accountDeleted: true });
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const socket = emitter();

    const result = await runPostAuthLogin(socket, session(), row('deletedcaller', slot), {
      lastLoginBeforeUpdate: new Date(0),
    });

    expect(result).toEqual({ ok: false, terminated: 'deleted-account' });
    const said = socket.emitted
      .filter((e: { event: string }) => e.event === 'ansi-output')
      .map((e: { data: unknown }) => String(e.data)).join('');
    expect(said).toContain('That account has been deleted.');
  });
});
