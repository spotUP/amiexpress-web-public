/**
 * Both user-file writers must resolve the SAME board.
 *
 * UserFileManager reads `BBS_DATA_DIR` first; UserDatabaseManager read only
 * `BBS_ROOT` and otherwise walked up from __dirname. Docker sets
 * BBS_DATA_DIR=/app/data/bbs and leaves BBS_ROOT empty, so on the live board
 * the two pointed at different directories: the reader at
 * /app/data/bbs/user.data - 8.7 MB, the file express.e reads - and the writer
 * at /app, where it had created an empty user.data, user.keys and user.misc.
 *
 * Everything appended through UserDatabaseManager went there: a user created
 * in the admin, and a NEW USER SIGNING UP on the board, which finishes through
 * the same call (new-user.handler.ts:1475 -> appendUserToDisk).
 *
 * The paths are computed in the constructor, so these build their own
 * instances rather than the module singletons.
 */

process.env.SKIP_DB_INIT = '1';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { UserDatabaseManager } from '../../src/services/UserDatabaseManager';
import { UserFileManager } from '../../src/services/UserFileManager';

describe('user.data has one home', () => {
  let root: string;
  let previousDataDir: string | undefined;
  let previousRoot: string | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'user-root-'));
    previousDataDir = process.env.BBS_DATA_DIR;
    previousRoot = process.env.BBS_ROOT;
  });

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = previousDataDir;
    if (previousRoot === undefined) delete process.env.BBS_ROOT; else process.env.BBS_ROOT = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** The paths are private; the file each manager touches is not. */
  const writtenPath = (manager: { initializeUserDatabase?: () => void; initializeUserFiles?: () => void }): string => {
    manager.initializeUserDatabase?.();
    manager.initializeUserFiles?.();
    return fs.existsSync(path.join(root, 'user.data')) ? path.join(root, 'user.data') : 'somewhere else';
  };

  it('both managers write under BBS_DATA_DIR, as Docker sets it', () => {
    process.env.BBS_DATA_DIR = root;
    delete process.env.BBS_ROOT;

    expect(writtenPath(new UserFileManager())).toBe(path.join(root, 'user.data'));
    fs.rmSync(path.join(root, 'user.data'), { force: true });
    expect(writtenPath(new UserDatabaseManager())).toBe(path.join(root, 'user.data'));
  });

  it('still honours BBS_ROOT when that is the only one set', () => {
    delete process.env.BBS_DATA_DIR;
    process.env.BBS_ROOT = root;

    expect(writtenPath(new UserDatabaseManager())).toBe(path.join(root, 'user.data'));
  });
});
