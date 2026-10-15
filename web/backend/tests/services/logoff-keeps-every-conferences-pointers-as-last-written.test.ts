/**
 * masterSavePointers, express.e:8661-8671 (called at logoff 8205 and after the
 * account editor's `~` 22283): for every conference and message base,
 * saveConfDB(slot, i, m, cb, TRUE) puts the caller's in-memory confBase back
 * into that conference's Conf.DB.
 *
 * The web has no in-memory confBases array (see masterLoadPointers, 8583-8593):
 * each pointer is written to the caller's Conf.DB slot when it moves, so the
 * Conf.DB record is the saved state and masterSavePointers has nothing left to
 * write. What must hold is the outcome of the loop: after the logoff the
 * records of ALL conferences (not only the joined one) still hold the pointers
 * last written, and a neighbouring caller's slot is untouched.
 *
 * Reachability: drives saveAccountAtLogoff (the logoff entry) with the real
 * Conf.DB files of a temp board.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'master-save-'));
setBoardRoot(board);

jest.mock('../../src/database', () => ({
  db: {
    getUserById: jest.fn(async () => ({})),
    updateUser: jest.fn(async () => undefined),
  },
}));
jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { updateUserDataFile: jest.fn(), patchUserRecord: jest.fn(), readRecordStructs: jest.fn(() => ({ keys: { number: 0 } })) },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { saveAccountAtLogoff } = require('../../src/services/account.service');
const { messagePointerFileManager: mpfm } = require('../../src/services/MessagePointerFileManager');
const { applyTooltypes } = require('../../src/utils/info-file.util');
/* eslint-enable @typescript-eslint/no-var-requires */

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

describe('logoff (masterSavePointers)', () => {
  beforeAll(() => {
    applyTooltypes(path.join(board, 'ConfConfig.info'), [
      ['NCONFS', '3'], ['NAME.1', 'One'], ['LOCATION.1', 'BBS:Conf1/'], ['NAME.2', 'Two'], ['LOCATION.2', 'BBS:Conf2/'],
      ['NAME.3', 'Three'], ['LOCATION.3', 'BBS:Conf3/'],
    ]);
    for (const n of [1, 2, 3]) fs.mkdirSync(path.join(board, `Conf${n}`), { recursive: true });
  });

  test("leaves the pointers of every conference, joined or not, as they were written", async () => {
    mpfm.patchRecord(1, 4, { confYM: 11, confRead: 12 });
    mpfm.patchRecord(2, 4, { confYM: 21, confRead: 22 });
    mpfm.patchRecord(3, 4, { confYM: 31, confRead: 32 });
    mpfm.patchRecord(2, 5, { confYM: 99, confRead: 98 }); // another caller

    const session: any = {
      currentConf: 2,
      user: { id: 'u4', slotNumber: 4, messagesPosted: 0, bytesUpload: 0, bytesDownload: 0, uploads: 0, downloads: 0 },
    };
    await saveAccountAtLogoff(session);

    for (const [conf, ym, read] of [[1, 11, 12], [2, 21, 22], [3, 31, 32]]) {
      const rec = mpfm.readRecordOrZero(conf, 4);
      expect([conf, rec.confYM, rec.confRead]).toEqual([conf, ym, read]);
    }
    const other = mpfm.readRecordOrZero(2, 5);
    expect([other.confYM, other.confRead]).toEqual([99, 98]);
    expect(session.accountSavedAtLogoff).toBe(true);
  });
});
