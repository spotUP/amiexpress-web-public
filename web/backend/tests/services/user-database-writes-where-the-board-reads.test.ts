/**
 * A new user lands in the file the board reads.
 *
 * UserDatabaseManager resolved its root from BBS_ROOT alone. Docker sets
 * BBS_DATA_DIR=/app/data/bbs and leaves BBS_ROOT empty, so it wrote
 * /app/user.data - a 0-byte file nothing reads - while the board's real
 * user.data (8.7 MB) sat in /app/data/bbs. Everything appended through here
 * went there, including a NEW USER SIGNING UP (new-user.handler.ts:1475).
 *
 * The suite was green throughout: tests/api/config-routes.test.ts mocks this
 * manager and UserFileManager, so the write it was meant to cover never ran.
 * This drives the real thing against a temporary BBS root and reads the bytes
 * back.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// express.e's on-disk record sizes, mirrored in UserDatabaseManager: a user
// is 232 bytes in user.data, 56 in user.keys, 248 in user.misc.
const USER_RECORD_BYTES = 232;
const USER_KEYS_BYTES = 56;
const USER_MISC_BYTES = 248;

function freshManager(env: { BBS_DATA_DIR?: string; BBS_ROOT?: string }) {
  const previous = { ...process.env };
  delete process.env.BBS_DATA_DIR;
  delete process.env.BBS_ROOT;
  Object.assign(process.env, env);

  jest.resetModules();
  // Required after the env is set: the paths are resolved in the constructor,
  // and the module holds a singleton built at import time.
  const { UserDatabaseManager } = require('../../src/services/UserDatabaseManager');
  const manager = new UserDatabaseManager();

  process.env = previous;
  return manager;
}

describe('where a user is written', () => {
  let dataDir: string;
  let rootDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-data-'));
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-root-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('uses BBS_DATA_DIR, which is what the container sets', () => {
    const manager = freshManager({ BBS_DATA_DIR: dataDir });
    manager.initializeUserDatabase();

    expect(fs.existsSync(path.join(dataDir, 'user.data'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'user.keys'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'user.misc'))).toBe(true);
  });

  it('prefers BBS_DATA_DIR over BBS_ROOT - the exact case that broke', () => {
    const manager = freshManager({ BBS_DATA_DIR: dataDir, BBS_ROOT: rootDir });
    manager.initializeUserDatabase();

    expect(fs.existsSync(path.join(dataDir, 'user.data'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'user.data'))).toBe(false);
  });

  it('still honours BBS_ROOT when that is all a board sets', () => {
    const manager = freshManager({ BBS_ROOT: rootDir });
    manager.initializeUserDatabase();

    expect(fs.existsSync(path.join(rootDir, 'user.data'))).toBe(true);
  });

  it('a new account written by the board\'s writer is read back here, slot 1 at offset 0', () => {
    // New accounts go through UserFileManager.writeUserFiles (the one
    // serializer); this manager still reads them, from the same directory.
    const manager = freshManager({ BBS_DATA_DIR: dataDir });
    manager.initializeUserDatabase();
    expect(manager.getUserCount()).toBe(0);

    const previous = { ...process.env };
    process.env.BBS_DATA_DIR = dataDir;
    const { UserFileManager } = require('../../src/services/UserFileManager');
    const writer = new UserFileManager();
    process.env = previous;
    writer.writeUserFiles({
      username: 'spot', location: 'Uprough', secLevel: 255, confAccess: 'XX', ratio: 0, ratioType: 0,
      uploads: 0, downloads: 0, calls: 1, callsToday: 1, timeUsed: 0, timeLimit: 3600, timeTotal: 0,
      bytesDownload: 0, bytesUpload: 0, byteLimit: 0, chatLimit: 0, chatUsed: 0, topUploadCPS: 0,
      topDownloadCPS: 0, userFlags: 0, realname: 'spot', newUser: true, expert: 'N',
    }, 1);

    // The bytes, not the manager's own opinion of them. All three files grow
    // together: a user missing from user.keys is a user who cannot log in.
    expect(fs.statSync(path.join(dataDir, 'user.data')).size).toBe(USER_RECORD_BYTES);
    expect(fs.statSync(path.join(dataDir, 'user.keys')).size).toBe(USER_KEYS_BYTES);
    expect(fs.statSync(path.join(dataDir, 'user.misc')).size).toBe(USER_MISC_BYTES);
    expect(manager.getUserCount()).toBe(1);
    expect(manager.readUserFromDisk(1)!.user.name).toBe('spot');
    expect(manager.readUserFromDisk(0)).toBeNull();
  });
});
