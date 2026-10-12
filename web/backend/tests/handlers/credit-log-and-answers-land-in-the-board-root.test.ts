/**
 * THE CREDITLOG AND A NEW CALLER'S ANSWERS LAND IN THE BOARD'S ROOT.
 *
 * express.e writes both under cmds.bbsLoc: `\sCreditLog` (creditLog, 9441)
 * and `\sAnswers/<slot>` / `\sNode<n>/Answers` (doNewUserQuestions,
 * 30331-30339). The port's board root is boardRoot() (BBS_DATA_DIR ||
 * BBS_ROOT || repo), read when the file is written. These two used
 * config.dataDir, a snapshot taken when the config module loaded, so a
 * board root set afterwards sent them to the old directory.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/utils/node-tooltypes.util', () => ({
  ...jest.requireActual('../../src/utils/node-tooltypes.util'),
  nodeFlag: (_node: number, flag: string) => flag === 'CENTRAL_ANSWERS',
}));

import { writeCreditLog } from '../../src/handlers/user/account-edit-input.handler';
import { answersFileFor } from '../../src/handlers/user/new-user.handler';

describe('board files follow the board root', () => {
  let root: string;
  let saved: string | undefined;

  beforeEach(() => {
    // Set AFTER the modules (and the config singleton) have loaded.
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'board-root-'));
    saved = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = root;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes the CreditLog into the board root (express.e:9441)', () => {
    writeCreditLog({ username: 'zedcaller', slotNumber: 7, creditDays: 0 });
    const log = fs.readFileSync(path.join(root, 'CreditLog'), 'latin1');
    expect(log).toContain('zedcaller [7] CREDIT ACCOUNT INACTIVATED');
  });

  it('puts a CENTRAL_ANSWERS caller\'s answers under the board root (express.e:30333-30337)', () => {
    expect(answersFileFor(1, 42, path.join(root, 'Node1'))).toBe(path.join(root, 'Answers', '42'));
    expect(fs.existsSync(path.join(root, 'Answers'))).toBe(true);
  });
});
