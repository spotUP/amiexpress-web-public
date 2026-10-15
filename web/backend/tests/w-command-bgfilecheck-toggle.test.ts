/**
 * Regression test for C-W: W command option 16 (BACKGROUND FILE CHECK).
 *
 * express.e:25872-25879 — display:
 *   IF(checkToolTypeExists(TOOLTYPE_NODE,node,'BGFILECHECK'))
 *     AND (checkToolTypeExists(TOOLTYPE_NODE,node,'FORCE_BGFILECHECK')=FALSE)
 *     IF userFlags AND USER_BGFILECHECK THEN '... BACKGROUND FILE CHECK... [32mYES[0m'
 *     ELSE                                  '... BACKGROUND FILE CHECK... [37mNO[0m'
 *   ELSE
 *     '[16] [DISABLED]'
 *
 * express.e:26083-26087 — toggle:
 *   CASE 16: userFlags := Eor(userFlags, USER_BGFILECHECK)
 *
 * The toggle is gated exactly as the display is (26085): a node without
 * BGFILECHECK, or one that FORCE_BGFILECHECKs, shows [DISABLED] and the
 * option changes nothing. (The web port used to toggle freely.)
 *
 * Driven through the REAL W menu (info-commands.handler, mocked the way
 * tests/handlers/w-menu-settings-doors.test.ts mocks it): the bytes row 16
 * is drawn with, and the userFlags option 16 persists - the XOR leaves every
 * other flag bit alone.
 */
jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../src/handlers/command-handler/dependency-injection', () => ({
  getDoors: () => [],
}));
const mockUpdateUser = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../src/database', () => ({ db: { updateUser: (...a: unknown[]) => mockUpdateUser(...a) } }));
jest.mock('../src/utils/acs.util', () => ({
  ...jest.requireActual('../src/utils/acs.util'),
  checkSecurity: () => true,
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../src/config';
import { clearNodeTooltypeCache } from '../src/utils/node-tooltypes.util';
import { LoggedOnSubState } from '../src/constants/bbs-states';
import { UserFlag } from '../src/constants/express-flags';
import { flushOutput } from '../src/utils/output.util';
import {
  handleWriteUserParamsCommand,
  handleWOptionSelectInput,
} from '../src/handlers/commands/info-commands.handler';

let seq = 0;
function driver(userFlags: number) {
  const text: string[] = [];
  const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { id: 'u16', username: 'SPOT', secLevel: 255, userFlags } };
  const socket: any = {
    id: `w16-${seq++}`, session,
    emit(event: string, data: unknown) { if (event === 'ansi-output') text.push(String(data)); return true; },
    on() { return socket; },
  };
  /** Row 16 as sent, colour bytes included - express's own [32m / [37m. */
  const row16 = () => {
    flushOutput(socket);
    return text.join('').split(/\r?\n/).find((l) => l.includes('BACKGROUND FILE CHECK')) ?? '';
  };
  return { socket, session, row16 };
}

let board: string;
let previousDataDir: string;
/** The node's own icon (express.e checkToolTypeExists(TOOLTYPE_NODE,...)). */
const nodeIcon = (text: string) => fs.writeFileSync(path.join(board, 'Node1.info'), text);

beforeEach(() => {
  mockUpdateUser.mockClear();
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'w16-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', board);
  clearNodeTooltypeCache();
  nodeIcon('BGFILECHECK\n');
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  clearNodeTooltypeCache();
  fs.rmSync(board, { recursive: true, force: true });
});

describe('W command option 16 BGFILECHECK display + toggle (C-W, express.e:25872-25879 / 26083-26087)', () => {
  test('display gates YES/NO on userFlags & BGFILECHECK (not always NO)', () => {
    const on = driver(UserFlag.BGFILECHECK);
    handleWriteUserParamsCommand(on.socket, on.session);
    expect(on.row16()).toContain('\x1b[32mYES\x1b[0m');

    // Other bits set, this one clear: NO.
    const off = driver(0xff & ~UserFlag.BGFILECHECK);
    handleWriteUserParamsCommand(off.socket, off.session);
    expect(off.row16()).toContain('\x1b[37mNO\x1b[0m');
  });

  test('case 16 toggles userFlags via XOR with UserFlag.BGFILECHECK and persists', async () => {
    const others = 0x05; // unrelated flags that must survive the toggle
    const d = driver(others);
    d.session.subState = LoggedOnSubState.W_OPTION_SELECT;

    // user.keys userFlags: the account in memory, saved on leaving W
    // (express.e:25893), so nothing is written per toggle.
    await handleWOptionSelectInput(d.socket, d.session, '16');
    expect(d.session.user.userFlags).toBe(others | UserFlag.BGFILECHECK);

    await handleWOptionSelectInput(d.socket, d.session, '16');
    expect(d.session.user.userFlags).toBe(others);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test.each([
    ['a node without BGFILECHECK', ''],
    ['a node that FORCE_BGFILECHECKs', 'BGFILECHECK\nFORCE_BGFILECHECK\n'],
  ])('%s: row 16 is [DISABLED] and option 16 changes nothing (25880, 26085)', async (_name, icon) => {
    nodeIcon(icon);
    clearNodeTooltypeCache();
    const d = driver(0x05);
    handleWriteUserParamsCommand(d.socket, d.session);
    expect(d.row16()).toBe('');
    flushOutput(d.socket);

    d.session.subState = LoggedOnSubState.W_OPTION_SELECT;
    await handleWOptionSelectInput(d.socket, d.session, '16');
    expect(d.session.user.userFlags).toBe(0x05);
  });
});
