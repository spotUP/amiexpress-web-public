/**
 * W row 6 through the real W menu handlers (user-edit-states.test.ts mocks
 * them, so this case cannot live there).
 */
jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/utils/acs-access-loader');
jest.mock('../../src/database', () => ({ db: { updateUser: jest.fn(async () => undefined) } }));
jest.mock('../../src/utils/output.util', () => ({
  emitText: jest.fn(), emitPrompt: jest.fn(), emitLine: jest.fn(), flushOutput: jest.fn(),
}));
jest.mock('../../src/services/account.service', () => ({
  changeAccount: jest.fn(async (s: any, u: any) => { Object.assign(s.user, u); }),
  saveAccount: jest.fn(),
}));
jest.mock('../../src/services/bbs-config-file.service', () => ({
  getBoardConfig: () => ({ min_password_length: 0, min_password_strength: 0 }),
}));

import * as bcrypt from 'bcryptjs';
import { handleWEditPasswordInput, handleWEditPasswordConfirmInput } from '../../src/handlers/commands/info-commands.handler';

test('W 6 sets pwdLastUpdated, as express.e:26026 does', async () => {
  const socket: any = { emit: jest.fn() };
  const session: any = {
    nodeId: 1, screenHeight: 25, tempData: {},
    user: { id: 7, username: 'Spot', secLevel: 10, securityFlags: 'T'.repeat(128), passwordHash: 'old', pwdLastUpdated: 0 },
  };
  await handleWEditPasswordInput(socket, session, 'Abc123!x');
  await handleWEditPasswordConfirmInput(socket, session, 'Abc123!x');
  expect(session.user.pwdLastUpdated).toBeGreaterThan(0);
  expect(bcrypt.compareSync('Abc123!x', session.user.passwordHash)).toBe(true);
});

test('the internal W keeps spaces around a password, exactly as the door path does (getPass2 does not trim)', async () => {
  const socket: any = { emit: jest.fn() };
  const session: any = {
    nodeId: 1, screenHeight: 25, tempData: {},
    user: { id: 7, username: 'Spot', secLevel: 10, securityFlags: 'T'.repeat(128), passwordHash: 'old', pwdLastUpdated: 0 },
  };
  await handleWEditPasswordInput(socket, session, ' Abc123!x ');
  await handleWEditPasswordConfirmInput(socket, session, ' Abc123!x ');
  expect(bcrypt.compareSync(' Abc123!x ', session.user.passwordHash)).toBe(true);
});
