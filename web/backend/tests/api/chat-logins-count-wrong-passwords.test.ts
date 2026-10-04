/**
 * A wrong password at either chat login counts toward MAX_PASSWORD_FAILS on
 * the account, and a right one clears the count - express.e:1008-1018
 * (checkUserPassword), the rule the BBS logon and FTP already keep.
 *
 * `/api/chat/login` and the chat-only socket login checked a password and
 * counted nothing, so they were an unmetered place to guess a caller's
 * password that the board's lockout never saw.
 *
 * Driven through the real entry points: an HTTP POST to the mounted chat
 * router, and the `chat-only-login-submit` event on the handler the socket
 * server installs. The count is read off user.misc on this run's temp board -
 * the record the lockout itself reads. Only the password check (bcrypt
 * against the row) and the MAX_PASSWORD_FAILS tooltype are stubbed.
 */
process.env.SKIP_DB_INIT = '1';

const authenticateUser = jest.fn();
const getUserByUsername = jest.fn();
const verifyPassword = jest.fn();
jest.mock('../../src/database', () => ({
  db: {
    authenticateUser: (...args: unknown[]) => authenticateUser(...args),
    getUserByUsername: (...args: unknown[]) => getUserByUsername(...args),
    verifyPassword: (...args: unknown[]) => verifyPassword(...args),
  },
  getDatabase: () => ({}),
}));

const maxPasswordFails = jest.fn(() => 3);
jest.mock('../../src/services/password-policy.util', () => ({
  ...jest.requireActual('../../src/services/password-policy.util'),
  getMaxPasswordFails: () => maxPasswordFails(),
}));

import express from 'express';
import request from 'supertest';
import { createChatRouter } from '../../src/api/chat-routes';
import { setupChatOnlyLoginHandler } from '../../src/handlers/chat-only-login.handler';
import { userFileManager } from '../../src/services/UserFileManager';
import { userDatabaseManager } from '../../src/services/UserDatabaseManager';

function row(username: string, slotNumber: number): any {
  const when = new Date(Date.now() - 86400 * 1000);
  return {
    id: `row-${username}`, username, slotNumber, passwordHash: 'hash',
    realname: 'Chat Caller', location: 'Here', phone: '', email: '',
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

/** The account on disk; 'right' is its password. */
function onDisk(username: string, slot: number): void {
  userFileManager.writeUserFiles(row(username, slot), slot);
  authenticateUser.mockImplementation(async (name: string, password: string) =>
    name === username && password === 'right' ? row(username, slot) : null);
  getUserByUsername.mockImplementation(async (name: string) =>
    name === username ? row(username, slot) : null);
  verifyPassword.mockImplementation(async (password: string) => password === 'right');
}

const misc = (slot: number) => userDatabaseManager.readUserFromDisk(slot)!.misc;

describe('POST /api/chat/login', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', createChatRouter({
    authenticateUser: (...args: unknown[]) => authenticateUser(...args),
    getUserByUsername: (...args: unknown[]) => getUserByUsername(...args),
  } as any));
  const post = (username: string, password: string) =>
    request(app).post('/api/chat/login').send({ username, password });

  it('counts wrong passwords on the account and locks it at MAX_PASSWORD_FAILS', async () => {
    onDisk('chatguess', 931);

    expect((await post('chatguess', 'one')).status).toBe(401);
    expect(misc(931).invalidAttempts).toBe(1);
    await post('chatguess', 'two');
    await post('chatguess', 'three');

    expect(misc(931).accountLocked).toBeTruthy();
    // The lock is the board's: the right password no longer gets a token.
    expect((await post('chatguess', 'right')).status).toBe(403);
  });

  it('a right password zeroes the count', async () => {
    onDisk('chatmissed', 932);

    await post('chatmissed', 'oops');
    expect(misc(932).invalidAttempts).toBe(1);
    expect((await post('chatmissed', 'right')).status).toBe(200);
    expect(misc(932).invalidAttempts).toBe(0);
  });
});

describe('the chat-only socket login', () => {
  /** The handler the socket server installs, fed one submission. */
  async function submit(username: string, password: string): Promise<string> {
    let onSubmit: ((c: { username: string; password: string }) => Promise<void>) | undefined;
    const emitted: string[] = [];
    const socket: any = {
      on: (event: string, fn: any) => { if (event === 'chat-only-login-submit') onSubmit = fn; },
      emit: (event: string) => { emitted.push(event); return true; },
    };
    setupChatOnlyLoginHandler(socket, {});
    await onSubmit!({ username, password });
    return emitted.join(',');
  }

  it('counts wrong passwords on the account and locks it at MAX_PASSWORD_FAILS', async () => {
    onDisk('chatonlyguess', 933);

    expect(await submit('chatonlyguess', 'one')).toBe('chat-only-login-error');
    expect(misc(933).invalidAttempts).toBe(1);
    await submit('chatonlyguess', 'two');
    await submit('chatonlyguess', 'three');

    expect(misc(933).accountLocked).toBeTruthy();
    expect(await submit('chatonlyguess', 'right')).toBe('chat-only-login-error');
  });

  it('a right password zeroes the count', async () => {
    onDisk('chatonlymissed', 934);

    await submit('chatonlymissed', 'oops');
    expect(misc(934).invalidAttempts).toBe(1);
    expect(await submit('chatonlymissed', 'right')).toBe('chat-only-login-success');
    expect(misc(934).invalidAttempts).toBe(0);
  });
});
