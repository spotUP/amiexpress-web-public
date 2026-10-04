/**
 * An FTP login refuses the accounts the board's own logon refuses.
 *
 * The FTP `PASS` took the SQL row the moment the password matched. An account
 * the sysop had DELETED (the record's slotNumber written as 0, express.e:21365;
 * the row stays and the password still verifies), LOCKED (user.misc
 * accountLocked, express.e:29775) or set to level 0 (express.e:29768) was
 * refused at the BBS and let in over FTP, where it could take files.
 *
 * Driven through the real entry point: a client on a socket, `USER`/`PASS`,
 * against an FtpServer running the board's own `authenticate`
 * (boardFtpDeps), over a real user.data on this run's temp board. Only the
 * password check (bcrypt against the row) and the node manager are stubbed.
 */
process.env.SKIP_DB_INIT = '1';

const authenticateUser = jest.fn();
const getUserByUsername = jest.fn();
jest.mock('../../src/database', () => ({
  db: {
    authenticateUser: (...args: unknown[]) => authenticateUser(...args),
    getUserByUsername: (...args: unknown[]) => getUserByUsername(...args),
    getConfigRepository: () => ({ getConferenceConfigs: () => [] }),
  },
  getDatabase: () => ({}),
}));

// The board's MAX_PASSWORD_FAILS tooltype, as the policy reader returns it.
const maxPasswordFails = jest.fn(() => -1);
jest.mock('../../src/services/password-policy.util', () => ({
  ...jest.requireActual('../../src/services/password-policy.util'),
  getMaxPasswordFails: () => maxPasswordFails(),
}));

import * as net from 'net';
import { FtpServer } from '../../src/ftp/ftp-server';
import type { FtpDeps } from '../../src/ftp/ftp-session';
import { boardFtpDeps } from '../../src/ftp/ftp-auth';
import { userFileManager } from '../../src/services/UserFileManager';
import { userDatabaseManager } from '../../src/services/UserDatabaseManager';

/** The users row the password check hands back. Level 20, not deleted. */
function row(username: string, slotNumber: number): any {
  const when = new Date(Date.now() - 86400 * 1000);
  return {
    id: `row-${username}`, username, slotNumber, passwordHash: 'hash',
    realname: 'Ftp Caller', location: 'Here', phone: '', email: '',
    secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0,
    chatLimit: 600, chatUsed: 0, lastLogin: when, firstLogin: when,
    calls: 3, callsToday: 0, newUser: false, expert: 'N', ansi: true,
    linesPerScreen: 23, computer: '', screenType: '', protocol: '/X Zmodem',
    editor: 'Prompt', zoomType: 'QWK', availableForChat: true, quietNode: false,
    autoRejoin: 1, confAccess: 'XXXXXXXXXX', areaName: '', uuCP: false,
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0, baud: 0,
    created: when, updated: when,
  };
}

/** The account's record on disk, with whatever the sysop did to it. */
function onDisk(username: string, slot: number, extra: Record<string, unknown> = {}): void {
  userFileManager.writeUserFiles({ ...row(username, slot), ...extra } as any, slot);
  authenticateUser.mockImplementation(async (name: string, password: string) =>
    name === username && password === 'right' ? row(username, slot) : null);
  getUserByUsername.mockImplementation(async (name: string) =>
    name === username ? row(username, slot) : null);
}

let server: FtpServer;
let reserved: string[];

async function listen(): Promise<number> {
  reserved = [];
  const deps: FtpDeps = {
    ...boardFtpDeps(),
    reserveNode: async (sessionId) => { reserved.push(sessionId); return 4; },
    releaseNode: async () => undefined,
    log: () => undefined,
  };
  server = new FtpServer({ port: 0, host: '127.0.0.1' }, deps);
  await server.start();
  return server.address()!.port;
}

/** USER + PASS over a real socket; the final reply to PASS. */
async function login(port: number, username: string, password: string): Promise<string> {
  const socket = net.createConnection({ port, host: '127.0.0.1' });
  socket.setEncoding('latin1');
  const finals: string[] = [];
  let buffer = '';
  let wake: (() => void) | null = null;
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let i: number;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).replace(/\r$/, '');
      buffer = buffer.slice(i + 1);
      if (/^\d{3} /.test(line)) finals.push(line);
      wake?.();
    }
  });
  const next = async (count: number) => {
    while (finals.length < count) await new Promise<void>((r) => { wake = r; });
    return finals[count - 1];
  };
  await next(1); // greeting
  socket.write(`USER ${username}\r\n`);
  await next(2);
  socket.write(`PASS ${password}\r\n`);
  const reply = await next(3);
  socket.destroy();
  return reply;
}

afterEach(async () => {
  await server?.stop();
  authenticateUser.mockReset();
  getUserByUsername.mockReset();
  maxPasswordFails.mockReturnValue(-1);
});

describe('an FTP login', () => {
  it('lets a good account on, running on its record (the sentinel: a node is taken)', async () => {
    onDisk('ftpgood', 911);
    const port = await listen();

    expect(await login(port, 'ftpgood', 'right')).toBe('230 password accepted');
    expect(reserved).toHaveLength(1);
  });

  it('refuses a deleted account whose password still verifies', async () => {
    onDisk('ftpdeleted', 912, { accountDeleted: true });
    const port = await listen();

    expect(await login(port, 'ftpdeleted', 'right')).toBe('420 That account has been deleted.');
    expect(reserved).toHaveLength(0);
  });

  it('refuses an account locked by password failures', async () => {
    onDisk('ftplocked', 913);
    // The board's own lock: one failure with MAX_PASSWORD_FAILS=1.
    userDatabaseManager.recordPasswordFailure(913, 1);
    const port = await listen();

    expect(await login(port, 'ftplocked', 'right')).toBe(
      '420 Your account is locked out (possibly due to repeated password failures)');
    expect(reserved).toHaveLength(0);
  });

  it('refuses level 0 on the record even when the row says 20', async () => {
    onDisk('ftplevel0', 914, { secLevel: 0 });
    const port = await listen();

    expect(await login(port, 'ftplevel0', 'right')).toBe(
      '420 Your access level does not allow you to log on.');
    expect(reserved).toHaveLength(0);
  });

  it('refuses an account whose password must be changed first', async () => {
    onDisk('ftpforced', 915);
    // The sysop's "Password Reset" flag, through the writer the editor uses.
    userFileManager.updateUserDataFile({ ...row('ftpforced', 915), forcePwdReset: 1 } as any, 915);
    const port = await listen();

    expect(await login(port, 'ftpforced', 'right')).toBe(
      '420 Your account requires your password to be changed - log on to the board to change it.');
    expect(reserved).toHaveLength(0);
  });

  it('still answers a wrong password with 430', async () => {
    onDisk('ftpwrong', 916);
    const port = await listen();

    expect(await login(port, 'ftpwrong', 'nope')).toBe('430 Invalid username or password');
  });

  it('counts wrong passwords on the account and locks it at MAX_PASSWORD_FAILS, as the BBS logon does', async () => {
    onDisk('ftpguess', 917);
    maxPasswordFails.mockReturnValue(3);
    const port = await listen();

    expect(await login(port, 'ftpguess', 'one')).toBe('430 Invalid username or password');
    expect(userDatabaseManager.readUserFromDisk(917)!.misc.invalidAttempts).toBe(1);
    expect(await login(port, 'ftpguess', 'two')).toBe('430 Invalid username or password');
    expect(await login(port, 'ftpguess', 'three')).toBe('430 Invalid username or password');

    // The third failure locked the account (express.e:1008-1016): the right
    // password no longer lets it on.
    expect(userDatabaseManager.readUserFromDisk(917)!.misc.accountLocked).toBeTruthy();
    expect(await login(port, 'ftpguess', 'right')).toBe(
      '420 Your account is locked out (possibly due to repeated password failures)');
    expect(reserved).toHaveLength(0);
  });

  it('a right password zeroes the count (express.e:1018), so earlier misses do not carry', async () => {
    onDisk('ftpmissed', 918);
    maxPasswordFails.mockReturnValue(3);
    const port = await listen();

    expect(await login(port, 'ftpmissed', 'oops')).toBe('430 Invalid username or password');
    expect(await login(port, 'ftpmissed', 'oops')).toBe('430 Invalid username or password');
    expect(await login(port, 'ftpmissed', 'right')).toBe('230 password accepted');
    expect(userDatabaseManager.readUserFromDisk(918)!.misc.invalidAttempts).toBe(0);
  });
});
