/**
 * A caller refused as "already on another node" leaves no logon behind.
 *
 * express.e's processLogon (29456) refuses the account at 29715-29727, right
 * after loading it, and only later counts the call and writes the logon line
 * (displayUserToCallersLog(0) at 29752 -> timesCalled+1 and callersLog at
 * 16045-16046). This port ran the refusal after the call bump, the node files
 * and `logLogin`, so a refused caller left a ghost logon line in CallersLog
 * and one call too many on the account.
 *
 * Driven through `runPostAuthLogin`, the pipeline every transport's login
 * runs through, with the same mocks as login-refuses-deleted-and-double-login.
 */
process.env.SKIP_DB_INIT = '1';

const beginLogoff = jest.fn();
jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff,
}));

const userAlreadyOnNode = jest.fn((): number | null => 2);
jest.mock('../../src/services/user-already-online', () => ({
  ...jest.requireActual('../../src/services/user-already-online'),
  userAlreadyOnNode,
}));

jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: jest.fn(async () => true),
  doPause: jest.fn(async () => undefined),
}));

const updateUser = jest.fn(async () => undefined);
jest.mock('../../src/database', () => ({
  db: {
    updateUser,
    generateAccessToken: jest.fn(async () => 'token'),
    generateRefreshToken: jest.fn(async () => 'refresh'),
    getUserByUsername: jest.fn(async () => null),
  },
  getDatabase: () => ({
    updateUser,
    getUserByUsername: jest.fn(async () => null),
  }),
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { callersLogManager } from '../../src/services/CallersLogManager';

interface Emitted { event: string; data: unknown }

function emitter() {
  const emitted: Emitted[] = [];
  return {
    emitted,
    id: 'already-on-socket',
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
    join() { return this; },
  };
}

it('writes no logon line and does not count the call', async () => {
  const logLogin = jest.spyOn(callersLogManager, 'logLogin').mockImplementation(() => undefined);
  const logActivity = jest.spyOn(callersLogManager, 'logActivity').mockImplementation(() => undefined);
  const { runPostAuthLogin } = require('../../src/services/login-post.service');
  const user = { id: 'u-1', username: 'spot', slotNumber: 7, calls: 3, callsToday: 0, ansi: true };
  const session = {
    state: BBSState.LOGON,
    subState: LoggedOnSubState.READ_COMMAND,
    connectionType: 'telnet',
    nodeId: 4,
    tempData: {},
  };

  const result = await runPostAuthLogin(emitter(), session, user, {
    lastLoginBeforeUpdate: new Date(0),
  });

  expect(result).toEqual({ ok: false, terminated: 'already-on-another-node' });
  // The refusal's own line is express's (29717-29718); the logon line is not.
  const lines = logActivity.mock.calls.map((call) => String(call[1]));
  expect(lines).toEqual(['User spot already on another node!']);
  expect(logLogin).not.toHaveBeenCalled();
  expect(user.calls).toBe(3);
  expect(updateUser).not.toHaveBeenCalled();
});
