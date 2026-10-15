/**
 * user.misc holds no piece of anyone's password.
 *
 * The record's pwdHash field is 32 characters and a bcrypt hash is 60, so what
 * was written there was the first half of a credential: unable to verify
 * anything, and a fragment of a real hash in a file every door can read. It
 * also looked like an answer - on 2026-09-01 a password changed in the admin
 * landed in that fragment while the board went on checking the users table,
 * so the account kept its old password and the sysop was told it was updated.
 *
 * The store that authenticates is SQLite (db.authenticateUser). Disk carries
 * the account, not the credential.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const BCRYPT_HASH = '$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

/** The fields the serializer touches; the record is fixed-width, so all of them. */
function aUser(): any {
  const now = new Date();
  return {
    username: 'spot', realname: '', location: '', phone: '', email: '',
    passwordHash: BCRYPT_HASH, secLevel: 255, slotNumber: 1,
    timeLimit: 0, timeUsed: 0, timeTotal: 0, timeLimitAdjust: 0,
    expert: false, ansi: true, screenType: 'ANSI', protocol: '', editor: '',
    uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, messagesPosted: 0, newSinceDate: now,
    created: now, updated: now, lastLogin: now, lastCall: now, confAccess: '1',
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0,
    availableForChat: true, quietNode: false, autoRejoin: 0, zoomType: 0,
    areaName: '', uuCP: false, slotnumber: 1, internetName: '',
  };
}

function freshManager(bbsRoot: string) {
  const previous = process.env.BBS_DATA_DIR;
  process.env.BBS_DATA_DIR = bbsRoot;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { UserFileManager } = require('../../src/services/UserFileManager');
  const manager = new UserFileManager();
  if (previous === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = previous;
  return manager;
}

describe('a user record on disk', () => {
  let bbsRoot: string;

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-misc-'));
  });

  afterEach(() => fs.rmSync(bbsRoot, { recursive: true, force: true }));

  it('never carries part of a password hash', () => {
    const manager = freshManager(bbsRoot);
    manager.updateUserDataFile(aUser(), 1);

    // The bytes, not the object: no fragment of the hash anywhere in the
    // three files a door can read.
    for (const file of ['user.data', 'user.keys', 'user.misc']) {
      const full = path.join(bbsRoot, file);
      if (!fs.existsSync(full)) continue;
      const bytes = fs.readFileSync(full).toString('latin1');
      expect(bytes).not.toContain(BCRYPT_HASH.slice(0, 32));
      expect(bytes).not.toContain('$2b$10$');
    }
  });

  it('reads back no credential at all', () => {
    const manager = freshManager(bbsRoot);
    manager.updateUserDataFile(aUser(), 1);

    const readBack = manager.readUserBySlot(1);

    expect(readBack).not.toBeNull();
    expect(readBack.passwordHash).toBe('');
  });
});
