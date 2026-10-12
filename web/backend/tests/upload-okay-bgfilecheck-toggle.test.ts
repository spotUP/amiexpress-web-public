/**
 * The upload's Okay prompt offers (B)ackground filecheck and B switches it.
 *
 * express.e:17764-17771 - where bgFileCheck is set and the node does not
 * FORCE_BGFILECHECK the prompt reads "Okay:   (B)ackground filecheck: YES|NO"
 * (YES green, NO white) above "(Enter) to Start, (G)oodbye after transfer,
 * (A)bort? "; 17777-17779 - B then Eors USER_BGFILECHECK. Any other prompt
 * is the plain one. Same predicate as the W menu's option 16
 * (userMayToggleBackgroundFileCheck), driven through the real handleCommand.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../src/services/CallersLogManager');
const mockUpdateUser = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../src/services/account.service', () => ({
  ...jest.requireActual('../src/services/account.service'),
  changeAccount: (...a: unknown[]) => mockUpdateUser(...a),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../src/config';
import { clearNodeTooltypeCache } from '../src/utils/node-tooltypes.util';
import { handleCommand } from '../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../src/constants/bbs-states';
import { UserFlag } from '../src/constants/express-flags';
import { flushOutput } from '../src/utils/output.util';

let n = 0;
function atTheOkayPrompt(userFlags: number, bgFileCheck: boolean) {
  const text: string[] = [];
  const socket: any = {
    id: `okay-bg-${++n}`, on: () => {}, off: () => {}, removeListener: () => {},
    emit(event: string, data: unknown) { if (event === 'ansi-output') text.push(String(data)); return true; },
  };
  const session: any = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.UPLOAD_FILENAME_INPUT,
    connectionType: 'web', nodeId: 1, currentConf: 1, bgFileCheck,
    user: { id: 'u1', username: 'spot', secLevel: 100, userFlags },
    tempData: { uploadMode: true, uploadBatch: [], uploadCount: 1, uploadStartTime: Date.now() },
  };
  const screen = () => { flushOutput(socket); return text.join(''); };
  return { socket, session, screen };
}

let board: string;
let previousDataDir: string;
beforeEach(() => {
  mockUpdateUser.mockClear();
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'okaybg-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', board);
  clearNodeTooltypeCache();
  fs.writeFileSync(path.join(board, 'Node1.info'), 'BGFILECHECK\n');
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  clearNodeTooltypeCache();
  fs.rmSync(board, { recursive: true, force: true });
});

describe('upload Okay prompt (B)ackground filecheck (express.e:17764-17779)', () => {
  test('shows the caller\'s setting and B switches it, redrawing the prompt', async () => {
    const t = atTheOkayPrompt(0, true);
    await handleCommand(t.socket, t.session, '\r'); // blank FileName line
    expect(t.session.subState).toBe(LoggedOnSubState.UPLOAD_OKAY_CONFIRM);
    expect(t.screen()).toContain('(B)ackground filecheck: \x1b[37mNO\x1b[0m');

    await handleCommand(t.socket, t.session, 'b');
    expect(t.session.user.userFlags & UserFlag.BGFILECHECK).toBe(UserFlag.BGFILECHECK);
    expect(mockUpdateUser).toHaveBeenCalled();
    expect(t.screen()).toContain('(B)ackground filecheck: \x1b[32mYES\x1b[0m');

    await handleCommand(t.socket, t.session, 'B');
    expect(t.session.user.userFlags & UserFlag.BGFILECHECK).toBe(0);
  });

  test('is not offered and B does nothing when the node forces the check', async () => {
    fs.writeFileSync(path.join(board, 'Node1.info'), 'BGFILECHECK\nFORCE_BGFILECHECK\n');
    clearNodeTooltypeCache();
    const t = atTheOkayPrompt(0, true);
    await handleCommand(t.socket, t.session, '\r');
    await handleCommand(t.socket, t.session, 'B');
    expect(t.screen()).not.toContain('(B)ackground');
    expect(t.session.user.userFlags).toBe(0);
  });

  test('is not offered when no background check is raised (bgFileCheck clear)', async () => {
    const t = atTheOkayPrompt(0, false);
    await handleCommand(t.socket, t.session, '\r');
    await handleCommand(t.socket, t.session, 'B');
    expect(t.screen()).not.toContain('(B)ackground');
    expect(t.session.user.userFlags).toBe(0);
  });
});
