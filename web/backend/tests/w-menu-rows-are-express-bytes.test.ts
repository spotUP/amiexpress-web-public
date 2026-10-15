/**
 * The W menu's rows in express.e's bytes (25738-25877).
 *
 * The port drew each row from five colorize() pieces, so the space after `]`
 * was blue and a reset sat between label and value; express writes
 * `ESC[34m]ESC[35m LABEL ESC[33mvalue ESC[0m`. It also filled empty fields
 * with invented words ("Not set", "Unknown", "Web Terminal"), showed the
 * login name lowercased as the INTERNET NAME instead of the stored one,
 * hard-coded TRANSLATOR to "English", and printed a [DISABLED] row 15 that
 * express.e never prints (25867-25870 has no ELSE).
 */
jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../src/handlers/command-handler/dependency-injection', () => ({ getDoors: () => [] }));
jest.mock('../src/database', () => ({ db: { updateUser: jest.fn(async () => undefined) } }));
let denied = new Set<ACSPermission>();
jest.mock('../src/utils/acs.util', () => ({
  ...jest.requireActual('../src/utils/acs.util'),
  checkSecurity: (_user: unknown, perm: ACSPermission) => !denied.has(perm),
}));

import { ACSPermission } from '../src/constants/acs-permissions';
import { flushOutput } from '../src/utils/output.util';
import { handleWriteUserParamsCommand } from '../src/handlers/commands/info-commands.handler';

let seq = 0;
function wMenu(user: Record<string, unknown>): string[] {
  const text: string[] = [];
  const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { id: 7, username: 'SPOT', secLevel: 255, ...user } };
  const socket: any = {
    id: `w-bytes-${seq++}`, session,
    emit(event: string, data: unknown) { if (event === 'ansi-output') text.push(String(data)); return true; },
    on() { return socket; },
  };
  handleWriteUserParamsCommand(socket, session);
  flushOutput(socket);
  return text.join('').split('\r\n');
}

const row = (lines: string[], label: string) => lines.find(l => l.includes(` ${label}`)) ?? '';

beforeEach(() => { denied = new Set(); });

test('rows carry express.e bytes and the stored values, empty when empty', () => {
  const lines = wMenu({ internetName: 'spot.up', email: '', computer: '' });

  expect(row(lines, 'LOGIN NAME')).toBe('\x1b[34m[\x1b[0m  0\x1b[34m]\x1b[35m LOGIN NAME.............. \x1b[33mSPOT\x1b[0m');
  expect(row(lines, 'EMAIL ADDRESS')).toBe('\x1b[34m[\x1b[0m  1\x1b[34m]\x1b[35m EMAIL ADDRESS........... \x1b[33m\x1b[0m');
  expect(row(lines, 'INTERNET NAME')).toBe('\x1b[34m[\x1b[0m  3\x1b[34m]\x1b[35m INTERNET NAME........... \x1b[33mspot.up\x1b[0m');
  expect(row(lines, 'COMPUTER')).toBe('\x1b[34m[\x1b[0m  8\x1b[34m]\x1b[35m COMPUTER................ \x1b[33m\x1b[0m');
  expect(row(lines, 'PASSWORD')).toBe('\x1b[34m[\x1b[0m  6\x1b[34m]\x1b[35m PASSWORD................ \x1b[36mENCRYPTED\x1b[0m');
});

test('a caller without TRANSLATION sees no row 15 at all', () => {
  denied.add(ACSPermission.TRANSLATION);
  const lines = wMenu({});

  expect(lines.some(l => l.includes(' 15\x1b[34m]'))).toBe(false);
});
