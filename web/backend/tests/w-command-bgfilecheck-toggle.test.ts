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
 * Web version drops the per-Node tooltype gating (no bg checker process
 * runs server-side, so the gate is moot) and lets the user toggle the
 * preference flag freely. Display still reads userFlags & BGFILECHECK
 * to show YES/NO. WEB_ tag documents the deviation.
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

beforeEach(() => mockUpdateUser.mockClear());

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

    await handleWOptionSelectInput(d.socket, d.session, '16');
    expect(mockUpdateUser).toHaveBeenLastCalledWith('u16', { userFlags: others | UserFlag.BGFILECHECK });

    await handleWOptionSelectInput(d.socket, d.session, '16');
    expect(mockUpdateUser).toHaveBeenLastCalledWith('u16', { userFlags: others });
    expect(d.session.user.userFlags).toBe(others);
  });
});
